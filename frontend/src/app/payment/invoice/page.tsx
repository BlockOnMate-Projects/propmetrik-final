'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'
import {
    CreditCard,
    Smartphone,
    Wallet,
    Check,
    AlertTriangle,
    Loader2,
    FileText,
    ArrowRight,
    Shield,
    Clock,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceData {
    id: string
    invoiceNumber: string
    clientName: string
    clientEmail: string | null
    feeModel: string
    propertyAddress: string | null
    lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[]
    subtotal: number
    platformFee: number
    totalAmount: number
    currency: string
    status: string
    invoiceDate: string
    dueDate: string | null
    paymentLink: string | null
    paystackAccessCode: string | null
    paystackPublicKey: string | null
    paidAt: string | null
    notes: string | null
}

type PaymentMethod = 'momo' | 'card' | 'crypto'

declare global {
    interface Window {
        PaystackPop: any
    }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

function formatCurrency(amount: number): string {
    return `GHS ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ============================================================================
// COMPONENT
// ============================================================================

function InvoicePaymentInner() {
    const searchParams = useSearchParams()
    const invoiceId = searchParams.get('id')
    const paymentStatus = searchParams.get('status')
    const paystackRef = searchParams.get('reference') || searchParams.get('trxref')

    const [invoice, setInvoice] = useState<InvoiceData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('momo')
    const [processing, setProcessing] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [paymentSuccess, setPaymentSuccess] = useState(false)
    const [paystackReady, setPaystackReady] = useState(false)

    // Determine if we returned from a successful payment callback
    const isPaymentCallback = paymentStatus === 'success'

    // ─── Fetch invoice ───────────────────────────────────────────────
    useEffect(() => {
        if (!invoiceId) {
            setError('No invoice specified')
            setLoading(false)
            return
        }

        async function fetchInvoice() {
            try {
                const res = await fetch(`${API_BASE}/valuation-invoices/public/invoice/${invoiceId}`)
                const data = await res.json()
                if (data.success) {
                    setInvoice(data.data)
                } else {
                    setError(data.error || 'Invoice not found')
                }
            } catch {
                setError('Failed to load invoice')
            } finally {
                setLoading(false)
            }
        }

        fetchInvoice()
    }, [invoiceId])

    // ─── Verify payment on callback return ───────────────────────────
    useEffect(() => {
        if (isPaymentCallback && paystackRef && invoiceId && invoice) {
            verifyPayment(paystackRef)
        }
    }, [isPaymentCallback, paystackRef, invoiceId, invoice])

    const verifyPayment = async (reference: string) => {
        setVerifying(true)
        try {
            const res = await fetch(`${API_BASE}/valuation-invoices/public/invoice/${invoiceId}/verify-payment/${reference}`)
            const data = await res.json()
            if (data.success) {
                setPaymentSuccess(true)
            }
        } catch {
            // Even if verify fails, the webhook will handle it
            setPaymentSuccess(true)
        } finally {
            setVerifying(false)
        }
    }

    // ─── Paystack Inline Payment ─────────────────────────────────────
    const handlePaystackInline = useCallback(() => {
        if (!invoice) return

        if (!window.PaystackPop) {
            console.warn('PaystackPop not loaded yet, retrying in 500ms...')
            setTimeout(() => handlePaystackInline(), 500)
            return
        }

        setProcessing(true)

        const inlineSuccessHandler = (transaction: any) => {
            setProcessing(false)
            setVerifying(true)
            verifyPayment(transaction.reference || transaction.trxref)
        }
        const inlineCancelHandler = () => {
            setProcessing(false)
        }

        // Preferred: always use newTransaction with the public key + selected channel.
        // This creates a fresh inline checkout that doesn't depend on pre-generated
        // access codes (which can expire). The verify-payment endpoint will confirm
        // whatever reference Paystack returns.
        if (invoice.paystackPublicKey && invoice.clientEmail) {
            try {
                const popup = new window.PaystackPop()
                popup.newTransaction({
                    key: invoice.paystackPublicKey,
                    email: invoice.clientEmail,
                    amount: Math.round(invoice.totalAmount * 100), // pesewas
                    currency: 'GHS',
                    ref: `PM-INV-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                    channels: paymentMethod === 'momo'
                        ? ['mobile_money']
                        : paymentMethod === 'card'
                        ? ['card']
                        : ['mobile_money', 'card', 'bank_transfer', 'bank', 'ussd', 'qr'],
                    metadata: {
                        invoice_id: invoice.id,
                        invoice_number: invoice.invoiceNumber,
                        client_name: invoice.clientName,
                        custom_fields: [
                            { display_name: 'Invoice', variable_name: 'invoice_number', value: invoice.invoiceNumber },
                        ],
                    },
                    onSuccess: inlineSuccessHandler,
                    onCancel: inlineCancelHandler,
                })
                return // Inline opened successfully
            } catch (err) {
                console.error('Paystack newTransaction failed:', err)
            }
        }

        // Fallback: resumeTransaction with server-side access code
        if (invoice.paystackAccessCode) {
            try {
                const popup = new window.PaystackPop()
                popup.resumeTransaction(invoice.paystackAccessCode, {
                    onSuccess: inlineSuccessHandler,
                    onCancel: inlineCancelHandler,
                })
                return // Inline opened successfully
            } catch (err) {
                console.error('Paystack resumeTransaction failed:', err)
            }
        }

        // Last resort: show error (do NOT silently redirect)
        setError('Unable to open payment window. Please try refreshing the page.')
        setProcessing(false)
    }, [invoice, paymentMethod])

    // ─── Handle Crypto payment ───────────────────────────────────────
    const handleCryptoPay = () => {
        if (!invoice) return
        setProcessing(true)
        window.location.href = `/payment/crypto?invoiceId=${invoice.id}&amount=${invoice.totalAmount}&ref=${invoice.invoiceNumber}`
    }

    // ─── Loading state ───────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-4" />
                    <p className="font-mono text-sm text-zinc-400">Loading invoice...</p>
                </div>
            </div>
        )
    }

    // ─── Error state ─────────────────────────────────────────────────
    if (error || !invoice) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md w-full text-center">
                    <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                    <h1 className="font-mono text-lg text-white font-bold mb-2">Invoice Not Found</h1>
                    <p className="font-mono text-sm text-zinc-400">{error || 'This invoice link may be invalid or expired.'}</p>
                </div>
            </div>
        )
    }

    // ─── Verifying payment ───────────────────────────────────────────
    if (verifying) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-green-500 animate-spin mx-auto mb-4" />
                    <p className="font-mono text-sm text-zinc-400">Verifying payment...</p>
                </div>
            </div>
        )
    }

    // ─── Already paid / Payment success ──────────────────────────────
    if (invoice.status === 'paid' || paymentSuccess || isPaymentCallback) {
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
                            Thank you, {invoice.clientName}. Your payment for invoice <span className="text-amber-500">{invoice.invoiceNumber}</span> has been received.
                        </p>

                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 mb-6">
                            <div className="flex justify-between font-mono text-sm mb-2">
                                <span className="text-zinc-400">Amount Paid</span>
                                <span className="text-green-400 font-bold">{formatCurrency(invoice.totalAmount)}</span>
                            </div>
                            <div className="flex justify-between font-mono text-xs">
                                <span className="text-zinc-500">Invoice</span>
                                <span className="text-zinc-300">{invoice.invoiceNumber}</span>
                            </div>
                            {invoice.paidAt && (
                                <div className="flex justify-between font-mono text-xs mt-1">
                                    <span className="text-zinc-500">Date</span>
                                    <span className="text-zinc-300">{new Date(invoice.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                </div>
                            )}
                        </div>

                        <p className="font-mono text-[10px] text-zinc-600">
                            A receipt has been recorded. You may close this window.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Cancelled invoice ───────────────────────────────────────────
    if (invoice.status === 'cancelled') {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md w-full text-center">
                    <AlertTriangle className="w-10 h-10 text-zinc-500 mx-auto mb-4" />
                    <h1 className="font-mono text-lg text-white font-bold mb-2">Invoice Cancelled</h1>
                    <p className="font-mono text-sm text-zinc-400">This invoice has been cancelled and is no longer payable.</p>
                </div>
            </div>
        )
    }

    const isOverdue = invoice.status === 'overdue'
    const dueDate = invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null

    // ─── Payment Page ────────────────────────────────────────────────
    return (
        <>
            {/* Load Paystack Inline JS */}
            <Script
                src="https://js.paystack.co/v2/inline.js"
                onLoad={() => setPaystackReady(true)}
                strategy="afterInteractive"
            />

            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full overflow-hidden">
                    {/* Header */}
                    <div className="bg-black px-8 py-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="font-mono text-xl tracking-widest font-bold">
                                    <span className="text-amber-500">PROP</span><span className="text-white">METRIK</span>
                                </h1>
                                <p className="text-zinc-600 font-mono text-[9px] mt-1 tracking-wide">PROFESSIONAL VALUATION SERVICES</p>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-zinc-400 text-xs">INVOICE</div>
                                <div className="font-mono text-amber-500 text-sm font-bold">{invoice.invoiceNumber}</div>
                                {isOverdue && (
                                    <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded font-mono text-[9px] text-red-400 font-bold">
                                        <AlertTriangle className="w-2.5 h-2.5" /> OVERDUE
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />

                    {/* Invoice Summary */}
                    <div className="px-8 py-5 border-b border-zinc-800">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <div className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Bill To</div>
                                <div className="font-mono text-sm text-white font-medium">{invoice.clientName}</div>
                                {invoice.clientEmail && <div className="font-mono text-xs text-zinc-500 mt-0.5">{invoice.clientEmail}</div>}
                            </div>
                            <div className="text-right space-y-1">
                                <div className="flex justify-end gap-6">
                                    <div>
                                        <div className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Date</div>
                                        <div className="font-mono text-xs text-zinc-300">
                                            {new Date(invoice.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </div>
                                    </div>
                                    {dueDate && (
                                        <div>
                                            <div className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Due</div>
                                            <div className={`font-mono text-xs ${isOverdue ? 'text-red-400 font-bold' : 'text-zinc-300'}`}>{dueDate}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="mt-4">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-700">
                                        <th className="text-left py-1.5 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Description</th>
                                        <th className="text-center py-1.5 font-mono text-[9px] text-zinc-500 uppercase tracking-wider w-16">Qty</th>
                                        <th className="text-right py-1.5 font-mono text-[9px] text-zinc-500 uppercase tracking-wider w-28">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-xs">
                                    {invoice.lineItems.map((item, i) => (
                                        <tr key={i} className="border-b border-zinc-800/50">
                                            <td className="py-2 text-zinc-300">{item.description}</td>
                                            <td className="py-2 text-center text-zinc-500">{item.quantity}</td>
                                            <td className="py-2 text-right text-zinc-300">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div className="flex justify-end mt-3">
                            <div className="w-56 space-y-1">
                                <div className="flex justify-between font-mono text-xs">
                                    <span className="text-zinc-500">Subtotal</span>
                                    <span className="text-zinc-300">{formatCurrency(invoice.subtotal)}</span>
                                </div>
                                {invoice.platformFee > 0 && (
                                    <div className="flex justify-between font-mono text-[10px]">
                                        <span className="text-zinc-500">Platform Fee</span>
                                        <span className="text-zinc-400">{formatCurrency(invoice.platformFee)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-mono text-base font-bold border-t border-zinc-700 pt-2 mt-1">
                                    <span className="text-white">Total Due</span>
                                    <span className="text-amber-500">{formatCurrency(invoice.totalAmount)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Payment Method Selection */}
                    <div className="px-8 py-6">
                        <h3 className="font-mono text-xs text-zinc-400 uppercase tracking-wider mb-4">Choose Payment Method</h3>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {([
                                { key: 'momo' as const, label: 'Mobile Money', sublabel: 'MTN, Vodafone, AirtelTigo', icon: Smartphone },
                                { key: 'card' as const, label: 'Card', sublabel: 'Visa, Mastercard', icon: CreditCard },
                                { key: 'crypto' as const, label: 'Crypto', sublabel: 'BTC, ETH, USDT & 200+', icon: Wallet },
                            ]).map(method => (
                                <button
                                    key={method.key}
                                    onClick={() => setPaymentMethod(method.key)}
                                    className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                                        paymentMethod === method.key
                                            ? method.key === 'crypto' ? 'border-purple-500 bg-purple-500/5' : 'border-amber-500 bg-amber-500/5'
                                            : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                                    }`}
                                >
                                    {paymentMethod === method.key && (
                                        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${method.key === 'crypto' ? 'bg-purple-500' : 'bg-amber-500'}`} />
                                    )}
                                    <method.icon className={`w-5 h-5 mb-2 ${
                                        paymentMethod === method.key
                                            ? method.key === 'crypto' ? 'text-purple-400' : 'text-amber-500'
                                            : 'text-zinc-400'
                                    }`} />
                                    <div className="font-mono text-xs text-white font-medium">{method.label}</div>
                                    <div className="font-mono text-[9px] text-zinc-500 mt-0.5">{method.sublabel}</div>
                                </button>
                            ))}
                        </div>

                        {/* Payment Details */}
                        <div className="bg-zinc-800/30 border border-zinc-700 rounded-lg p-5 mb-5">
                            {paymentMethod === 'momo' && (
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <Smartphone className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-mono text-sm text-white font-medium">Pay with Mobile Money</div>
                                            <p className="font-mono text-[10px] text-zinc-400 mt-1">
                                                A secure payment window will open where you can pay with MTN MoMo, Vodafone Cash, or AirtelTigo Money.
                                                You&apos;ll receive an approval prompt on your phone.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900/50 border border-zinc-700/50 rounded p-3 flex items-center gap-2">
                                        <Shield className="w-3.5 h-3.5 text-green-500" />
                                        <span className="font-mono text-[10px] text-zinc-400">Secured by Paystack &bull; 256-bit encryption</span>
                                    </div>
                                </div>
                            )}

                            {paymentMethod === 'card' && (
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <CreditCard className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-mono text-sm text-white font-medium">Pay with Card</div>
                                            <p className="font-mono text-[10px] text-zinc-400 mt-1">
                                                A secure payment window will open where you can enter your Visa or Mastercard details.
                                                Your card information never touches our servers.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900/50 border border-zinc-700/50 rounded p-3 flex items-center gap-2">
                                        <Shield className="w-3.5 h-3.5 text-green-500" />
                                        <span className="font-mono text-[10px] text-zinc-400">PCI DSS Compliant &bull; Secured by Paystack</span>
                                    </div>
                                </div>
                            )}

                            {paymentMethod === 'crypto' && (
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <Wallet className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-mono text-sm text-white font-medium">Pay with Crypto</div>
                                            <p className="font-mono text-[10px] text-zinc-400 mt-1">
                                                Choose from 200+ cryptocurrencies including BTC, ETH, USDT, USDC, SOL, and more.
                                                NOWPayments will generate a deposit address and QR code for you.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900/50 border border-zinc-700/50 rounded p-3 flex items-center gap-2">
                                        <Shield className="w-3.5 h-3.5 text-purple-400" />
                                        <span className="font-mono text-[10px] text-zinc-400">Powered by NOWPayments &bull; Auto-conversion</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Amount Summary + Pay Button */}
                        <div className="flex items-center justify-between bg-black border border-zinc-700 rounded-lg p-4">
                            <div>
                                <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Amount to Pay</div>
                                <div className="font-mono text-xl text-amber-500 font-bold">{formatCurrency(invoice.totalAmount)}</div>
                            </div>
                            <button
                                onClick={paymentMethod === 'crypto' ? handleCryptoPay : handlePaystackInline}
                                disabled={processing || (paymentMethod !== 'crypto' && !paystackReady && !invoice.paymentLink)}
                                className={`flex items-center gap-2 px-6 py-3 font-mono text-sm font-bold rounded-lg transition-all ${
                                    paymentMethod === 'crypto'
                                        ? 'bg-purple-600 text-white hover:bg-purple-500'
                                        : 'bg-amber-500 text-black hover:bg-amber-400'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                {processing ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                                ) : (
                                    <>
                                        PAY {formatCurrency(invoice.totalAmount)}
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-4 bg-black/50 border-t border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-zinc-600" />
                                <span className="font-mono text-[9px] text-zinc-600">Invoice {invoice.invoiceNumber}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-[9px] text-zinc-600">Powered by</span>
                                <span className="font-mono text-[9px] text-amber-500/60 font-bold tracking-wider">PROPMETRIK</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

// ============================================================================
// PAGE EXPORT — wrap with Suspense for useSearchParams (Next.js requirement)
// ============================================================================

export default function InvoicePaymentPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
        }>
            <InvoicePaymentInner />
        </Suspense>
    )
}
