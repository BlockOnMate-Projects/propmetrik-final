'use client'

/**
 * Invoice Crypto Payment Page
 *
 * Flow: Select coin → Get estimate → Preview → Get deposit address (NOWPayments) → QR code → Poll status
 * Based on the working tenant-portal CryptoPaymentFlow pattern.
 * No auth required — public-facing invoice payment page.
 */

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import {
  Wallet,
  ArrowLeft,
  Check,
  AlertTriangle,
  Loader2,
  Copy,
  Search,
  Clock,
  Shield,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface SettlementCoin {
  id: string
  coin_symbol: string
  chain: string
  display_name: string
  nowpayments_ticker: string
  is_evm_native: boolean
  logo_url?: string | null
}

interface CryptoEstimate {
  amountGhs: number
  amountUsd: number
  totalChargeGhs: number
  totalChargeUsd: number
  payCurrency: string
  estimatedPayAmount: number
  minimumPayAmount: number
  isBelowMinimum: boolean
  error?: string
}

interface NowPaymentsResult {
  paymentId: number
  depositAddress: string
  payAmount: number
  payCurrency: string
  priceAmountUsd: number
  outcomeCurrency: string | null
  expiresAt: string | null
  status: string
  paymentReference: string
}

interface NowPaymentsStatus {
  paymentId: number
  status: string
  actuallyPaid: number
  payAmount: number
  payCurrency: string
  outcomeAmount: number
  outcomeCurrency: string
  updatedAt: string
}

type FlowStep = 'loading' | 'select-coin' | 'estimate' | 'preview' | 'deposit' | 'success' | 'error'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

function formatCurrency(amount: number): string {
  return `GHS ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCrypto(val: number | string): string {
  const n = Number(val) || 0
  if (n < 1) return n.toFixed(8)
  if (n < 100) return n.toFixed(4)
  return n.toFixed(2)
}

// ============================================================================
// COIN ICON — logo_url from backend, coincap CDN fallback, then text
// ============================================================================

function CoinIcon({ symbol, logoUrl, size = 24 }: { symbol: string; logoUrl?: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const s = symbol.toLowerCase()
  const primarySrc = logoUrl || `https://assets.coincap.io/assets/icons/${s}@2x.png`
  const fallbackSrc = logoUrl ? `https://assets.coincap.io/assets/icons/${s}@2x.png` : null

  if (imgError && (!fallbackSrc || useFallback)) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-zinc-700 text-[10px] font-bold text-zinc-300 shrink-0"
        style={{ width: size, height: size }}
      >
        {symbol.toUpperCase().slice(0, 3)}
      </span>
    )
  }

  return (
    <img
      src={imgError && fallbackSrc ? fallbackSrc : primarySrc}
      alt={symbol}
      width={size}
      height={size}
      className="rounded-full shrink-0"
      onError={() => {
        if (!imgError) setImgError(true)
        else setUseFallback(true)
      }}
    />
  )
}

// ============================================================================
// API HELPERS (same endpoints as tenant-portal but public, no auth)
// ============================================================================

async function fetchSettlementCoins(): Promise<SettlementCoin[]> {
  const res = await fetch(`${API_BASE}/valuation-invoices/public/crypto/settlement-coins`)
  if (!res.ok) throw new Error('Failed to load coins')
  const data = await res.json()
  return (data.coins || []).filter((c: SettlementCoin) => !c.is_evm_native)
}

async function fetchEstimate(amountGHS: number, ticker: string, invoiceId: string): Promise<CryptoEstimate> {
  const params = new URLSearchParams({ amount: amountGHS.toString(), payCurrency: ticker, invoiceId })
  const res = await fetch(`${API_BASE}/valuation-invoices/public/crypto/estimate?${params}`)
  if (!res.ok) throw new Error('Estimate request failed')
  const raw = await res.json()
  // NOWPayments may return numeric fields as strings — coerce here
  return {
    ...raw,
    amountGhs: Number(raw.amountGhs) || 0,
    amountUsd: Number(raw.amountUsd) || 0,
    totalChargeGhs: Number(raw.totalChargeGhs) || 0,
    totalChargeUsd: Number(raw.totalChargeUsd) || 0,
    estimatedPayAmount: Number(raw.estimatedPayAmount) || 0,
    minimumPayAmount: Number(raw.minimumPayAmount) || 0,
  }
}

async function initiateCrypto(invoiceId: string, ticker: string, chain: string): Promise<NowPaymentsResult> {
  const res = await fetch(`${API_BASE}/valuation-invoices/public/invoice/${invoiceId}/initiate-crypto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payCurrency: ticker, payChain: chain }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Failed to create payment')
  return json.data
}

async function fetchNowPaymentsStatus(paymentId: number): Promise<NowPaymentsStatus> {
  const res = await fetch(`${API_BASE}/valuation-invoices/public/crypto/nowpayments-status/${paymentId}`)
  return res.json()
}

// ============================================================================
// INNER COMPONENT (uses useSearchParams — needs Suspense wrapper)
// ============================================================================

function CryptoPaymentInner() {
  const searchParams = useSearchParams()
  const invoiceId = searchParams.get('invoiceId') || ''
  const amountParam = searchParams.get('amount')
  const invoiceRef = searchParams.get('ref') || ''
  const amountGHS = amountParam ? parseFloat(amountParam) : 0

  const [step, setStep] = useState<FlowStep>('loading')
  const [error, setError] = useState<string | null>(null)
  const [coins, setCoins] = useState<SettlementCoin[]>([])
  const [selectedCoin, setSelectedCoin] = useState<SettlementCoin | null>(null)
  const [coinSearch, setCoinSearch] = useState('')
  const [estimate, setEstimate] = useState<CryptoEstimate | null>(null)
  const [npResult, setNpResult] = useState<NowPaymentsResult | null>(null)
  const [npStatus, setNpStatus] = useState('waiting')
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  // ─── Load coins on mount ──────────────────────────────────
  useEffect(() => {
    if (!invoiceId || !amountGHS) {
      setError('Missing invoice information')
      setStep('error')
      return
    }
    let cancelled = false
    fetchSettlementCoins()
      .then(c => {
        if (!cancelled) { setCoins(c); setStep('select-coin') }
      })
      .catch(err => {
        console.error('Failed to load coins:', err)
        if (!cancelled) { setError('Failed to load payment options'); setStep('error') }
      })
    return () => { cancelled = true }
  }, [invoiceId, amountGHS])

  // ─── Select coin → get estimate ──────────────────────────
  const handleCoinSelect = useCallback(async (coin: SettlementCoin) => {
    setSelectedCoin(coin)
    setError(null)
    setStep('estimate')
    try {
      const est = await fetchEstimate(amountGHS, coin.nowpayments_ticker, invoiceId)
      if (est.error) { setError(`Estimate error: ${est.error}`); setStep('error'); return }
      if (est.isBelowMinimum) {
        setError(`Amount below minimum for ${coin.display_name}. Min: ${est.minimumPayAmount} ${coin.coin_symbol.toUpperCase()}`)
        setStep('error')
        return
      }
      setEstimate(est)
      setStep('preview')
    } catch (err: any) {
      console.error('Estimate fetch error:', err)
      setError(err.message || 'Failed to get estimate')
      setStep('error')
    }
  }, [amountGHS, invoiceId])

  // ─── Initiate NOWPayments payment ────────────────────────
  const handleInitiate = useCallback(async () => {
    if (!selectedCoin || !invoiceId) return
    setError(null)
    setStep('deposit')
    try {
      const result = await initiateCrypto(invoiceId, selectedCoin.nowpayments_ticker, selectedCoin.chain)
      setNpResult(result)
      startPolling(result.paymentId)
    } catch (err: any) {
      console.error('Initiate crypto error:', err)
      setError(err.message || 'Failed to initiate payment')
      setStep('error')
    }
  }, [selectedCoin, invoiceId])

  // ─── Poll NOWPayments status ─────────────────────────────
  const startPolling = useCallback((paymentId: number) => {
    setNpStatus('waiting')
    pollRef.current = setInterval(async () => {
      try {
        const st = await fetchNowPaymentsStatus(paymentId)
        setNpStatus(st.status)
        if (st.status === 'finished' || st.status === 'confirmed') {
          if (pollRef.current) clearInterval(pollRef.current)
          setStep('success')
        } else if (['failed', 'expired', 'refunded'].includes(st.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          setError(`Payment ${st.status}. Please try again.`)
          setStep('error')
        }
      } catch {
        /* ignore polling errors */
      }
    }, 10_000)
  }, [])

  // ─── Helpers ─────────────────────────────────────────────
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const resetFlow = () => {
    setError(null)
    setStep('select-coin')
    setSelectedCoin(null)
    setEstimate(null)
    setNpResult(null)
    setCoinSearch('')
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const filteredCoins = coinSearch.trim()
    ? coins.filter(c =>
        c.coin_symbol.toLowerCase().includes(coinSearch.toLowerCase()) ||
        (c.display_name || '').toLowerCase().includes(coinSearch.toLowerCase()) ||
        (c.chain || '').toLowerCase().includes(coinSearch.toLowerCase())
      )
    : coins

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="font-mono text-sm text-zinc-400">Loading payment options...</p>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full overflow-hidden">
          <div className="bg-black px-8 py-6 text-center">
            <h1 className="font-mono text-xl tracking-widest font-bold">
              <span className="text-amber-500">PROP</span><span className="text-white">METRIK</span>
            </h1>
          </div>
          <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-500/10 border-2 border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-5">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="font-mono text-xl text-white font-bold mb-2">Payment Confirmed</h2>
            <p className="font-mono text-sm text-zinc-400 mb-6">
              Your {selectedCoin?.coin_symbol.toUpperCase()} payment has been processed.
            </p>
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 mb-6">
              <div className="flex justify-between font-mono text-sm mb-2">
                <span className="text-zinc-400">Amount Paid</span>
                <span className="text-green-400 font-bold">{formatCurrency(amountGHS)}</span>
              </div>
              {invoiceRef && (
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-zinc-500">Invoice</span>
                  <span className="text-zinc-300">{invoiceRef}</span>
                </div>
              )}
              {selectedCoin && npResult && (
                <div className="flex justify-between font-mono text-xs mt-1">
                  <span className="text-zinc-500">Crypto</span>
                  <span className="text-zinc-300">{npResult.payAmount} {selectedCoin.coin_symbol.toUpperCase()}</span>
                </div>
              )}
            </div>
            <a href={`/payment/invoice?id=${invoiceId}&status=success`}
              className="inline-flex items-center gap-2 font-mono text-xs text-amber-500 hover:text-amber-400">
              <ArrowLeft className="w-3 h-3" /> Back to Invoice
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full overflow-hidden">
          <div className="bg-black px-8 py-6 text-center">
            <h1 className="font-mono text-xl tracking-widest font-bold">
              <span className="text-amber-500">PROP</span><span className="text-white">METRIK</span>
            </h1>
          </div>
          <div className="h-1 bg-gradient-to-r from-red-500 via-red-400 to-red-500" />
          <div className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h2 className="font-mono text-lg text-white font-bold mb-2">Payment Error</h2>
            <p className="font-mono text-sm text-zinc-400 mb-6">{error || 'An unexpected error occurred.'}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={resetFlow}
                className="px-5 py-2.5 bg-zinc-800 text-white font-mono text-sm rounded-lg hover:bg-zinc-700">
                Try Again
              </button>
              <a href={`/payment/invoice?id=${invoiceId}`}
                className="px-5 py-2.5 border border-zinc-700 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-800">
                Back to Invoice
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-black px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-mono text-xl tracking-widest font-bold">
                <span className="text-amber-500">PROP</span><span className="text-white">METRIK</span>
              </h1>
              <p className="text-zinc-600 font-mono text-[9px] mt-1 tracking-wide">CRYPTO PAYMENT</p>
            </div>
            <div className="text-right">
              {invoiceRef && <div className="font-mono text-amber-500 text-sm font-bold">{invoiceRef}</div>}
              <div className="font-mono text-zinc-400 text-xs mt-0.5">{formatCurrency(amountGHS)}</div>
            </div>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-purple-500 via-purple-400 to-purple-500" />

        <div className="p-6">
          {/* ── Step: Select Coin ── */}
          {step === 'select-coin' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-sm text-white font-medium">Choose your cryptocurrency</h3>
                <a href={`/payment/invoice?id=${invoiceId}`}
                  className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300">&larr; Back</a>
              </div>
              <p className="font-mono text-[10px] text-zinc-500">
                Select which coin you&apos;d like to pay {formatCurrency(amountGHS)} with.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search coins (BTC, ETH, SOL, LTC...)"
                  value={coinSearch}
                  onChange={e => setCoinSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg font-mono text-sm text-white placeholder-zinc-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
                  {filteredCoins.slice(0, 120).map(coin => (
                    <button
                      key={coin.id}
                      onClick={() => handleCoinSelect(coin)}
                      className="flex items-center gap-2.5 px-3 py-2.5 border border-zinc-700 rounded-lg text-left hover:border-purple-500 hover:bg-purple-500/5 transition-all"
                    >
                      <CoinIcon symbol={coin.coin_symbol} logoUrl={coin.logo_url} size={22} />
                      <div className="min-w-0">
                        <span className="block font-mono text-xs font-bold text-white">{coin.coin_symbol.toUpperCase()}</span>
                        <span className="block font-mono text-[8px] text-zinc-500 truncate">{coin.chain}</span>
                      </div>
                    </button>
                  ))}
                  {filteredCoins.length === 0 && coinSearch && (
                    <p className="col-span-full text-center font-mono text-xs text-zinc-500 py-6">
                      No coins match &quot;{coinSearch}&quot;
                    </p>
                  )}
                </div>
              </div>
              {filteredCoins.length > 120 && (
                <p className="font-mono text-[9px] text-zinc-600 text-center">Showing first 120. Use search to find more.</p>
              )}
              <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
                <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="font-mono text-[10px] text-zinc-400">Powered by NOWPayments &bull; 200+ cryptocurrencies</span>
              </div>
            </div>
          )}

          {/* ── Step: Loading Estimate ── */}
          {step === 'estimate' && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              <span className="font-mono text-sm text-zinc-400">
                Getting {selectedCoin?.coin_symbol.toUpperCase()} conversion rate...
              </span>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === 'preview' && estimate && selectedCoin && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-sm text-white font-medium">Payment Preview</h3>
                <button onClick={resetFlow} className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300">&larr; Change coin</button>
              </div>
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5 space-y-3">
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-zinc-400">Invoice Amount</span>
                  <span className="text-white font-medium">{formatCurrency(amountGHS)}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-zinc-500">USD Equivalent</span>
                  <span className="text-zinc-300">${(Number(estimate.totalChargeUsd) || 0).toFixed(2)}</span>
                </div>
                <hr className="border-purple-500/20" />
                <div className="flex justify-between items-center">
                  <span className="font-mono text-sm text-white font-medium">You Pay</span>
                  <div className="flex items-center gap-2">
                    <CoinIcon symbol={selectedCoin.coin_symbol} logoUrl={selectedCoin.logo_url} size={20} />
                    <span className="font-mono text-lg text-purple-400 font-bold">
                      {formatCrypto(estimate.estimatedPayAmount)} {selectedCoin.coin_symbol.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-3">
                <p className="font-mono text-[10px] text-zinc-400">
                  You&apos;ll get a unique deposit address. NOWPayments auto-converts your payment. The exchange rate may vary slightly.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={resetFlow}
                  className="flex-1 px-4 py-3 border border-zinc-700 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-800">
                  Back
                </button>
                <button onClick={handleInitiate}
                  className="flex-1 px-4 py-3 bg-purple-600 text-white font-mono text-sm font-bold rounded-lg hover:bg-purple-500 transition-colors">
                  Get Deposit Address
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Deposit Address + QR Code ── */}
          {step === 'deposit' && (
            <div className="space-y-5">
              {!npResult ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                  <span className="font-mono text-sm text-zinc-400">Creating payment...</span>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="font-mono text-sm text-white font-medium mb-1">Send exactly</p>
                    <p className="font-mono text-2xl text-purple-400 font-bold">
                      {npResult.payAmount} {npResult.payCurrency.toUpperCase()}
                    </p>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">to this address:</p>
                  </div>
                  <div className="flex justify-center">
                    <div className="bg-white p-3 rounded-xl">
                      <QRCodeSVG value={npResult.depositAddress} size={180} level="H" includeMargin={false}
                        bgColor="#ffffff" fgColor="#1e1b4b" />
                    </div>
                  </div>
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
                    <p className="font-mono text-xs break-all text-zinc-300 text-center mb-3">{npResult.depositAddress}</p>
                    <button onClick={() => copyToClipboard(npResult.depositAddress)}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-700 hover:bg-zinc-600 rounded font-mono text-xs text-white transition-colors">
                      {copied ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</>
                        : <><Copy className="w-3.5 h-3.5" /> Copy Address</>}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 font-mono text-xs">
                    <div className="animate-pulse w-2 h-2 bg-purple-500 rounded-full" />
                    <span className={
                      npStatus === 'waiting' ? 'text-zinc-400'
                        : npStatus === 'partially_paid' ? 'text-amber-400'
                        : npStatus === 'confirming' ? 'text-blue-400'
                        : npStatus === 'sending' ? 'text-green-400'
                        : 'text-zinc-400'
                    }>
                      {npStatus === 'waiting' ? 'Waiting for your transaction...'
                        : npStatus === 'partially_paid' ? 'Partial payment received — send remaining'
                        : npStatus === 'confirming' ? 'Transaction detected — confirming...'
                        : npStatus === 'sending' ? 'Converting and settling...'
                        : `Status: ${npStatus}`}
                    </span>
                  </div>
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                    <p className="font-mono text-[10px] text-amber-400">
                      <strong>Important:</strong> Send the exact amount. Deposit address is single-use.
                      Page auto-updates when payment is detected (every 10s).
                    </p>
                  </div>
                  {npResult.expiresAt && (
                    <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-zinc-600">
                      <Clock className="w-3 h-3" /> Expires: {new Date(npResult.expiresAt).toLocaleString()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/50 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-zinc-600" />
              <span className="font-mono text-[9px] text-zinc-600">
                {invoiceRef ? `Invoice ${invoiceRef}` : 'Crypto Payment'}
              </span>
            </div>
            <span className="font-mono text-[9px] text-purple-400/60 font-bold tracking-wider">
              Powered by NOWPayments
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PAGE EXPORT — wrap with Suspense for useSearchParams (Next.js requirement)
// ============================================================================

export default function CryptoPaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    }>
      <CryptoPaymentInner />
    </Suspense>
  )
}
