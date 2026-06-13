'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    ExternalLink,
    RefreshCw,
    Search,
    Calculator,
    TrendingUp,
    Users,
    Landmark,
    Briefcase,
    HardHat,
    AlertTriangle,
    Copy,
    Check,
    DollarSign,
    Fuel,
    BarChart3,
    Settings,
    Shield,
    Plus,
    Power,
    Trash2,
    Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

const SUPPORTED_TOKENS = [
    { symbol: 'USDT', name: 'Tether USD', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
    { symbol: 'USDC', name: 'USD Coin', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { symbol: 'WETH', name: 'Wrapped Ether', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
] as const

const SUPPORTED_NETWORKS = [
    { name: 'Polygon', chainId: 137, color: 'bg-purple-500', explorer: 'polygonscan.com' },
    { name: 'Ethereum', chainId: 1, color: 'bg-blue-500', explorer: 'etherscan.io' },
] as const

// ─── Types ──────────────────────────────────────────────────────

interface CryptoMetrics {
    period: string
    summary: {
        totalTransactions: number
        successful: number
        pending: number
        failed: number
        totalVolumeUSDT: number
        totalFeesUSDT: number
        totalGasMatic: number
        avgPaymentUSDT: number
        totalVolumeGHS: number
        totalFeesGHS: number
        uniquePayers: number
        uniqueRecipients: number
    }
    volumeByType: Array<{
        paymentType: string
        count: number
        volumeUSDT: number
        feesUSDT: number
        volumeGHS?: number
        feesGHS?: number
    }>
    dailyVolume: Array<{
        date: string
        count: number
        volumeUSDT: number
        feesUSDT: number
        volumeGHS?: number
        feesGHS?: number
    }>
    recentTransactions: CryptoTransaction[]
}

interface CryptoTransaction {
    id: string
    reference: string
    paymentType: string
    txHash: string | null
    payerWallet: string | null
    recipientWallet: string | null
    principalCrypto: number | null
    feeCrypto: number | null
    exchangeRate: number | null
    status: string
    createdAt: string
    verifiedAt: string | null
    grossAmount?: number
    principalAmount?: number
    serviceFee?: number
    currency?: string
    channel?: string
    recipientType?: string
    payerEmail?: string
    metadata?: any
    // NOWPayments enrichment
    payCurrency?: string | null
    payAmount?: number | null
    payAddress?: string | null
    outcomeCurrency?: string | null
    outcomeAmount?: number | null
    usdAmount?: number | null
}

interface CryptoWallet {
    id: string
    entityType: string
    entityId: string
    walletAddress: string
    isVerified: boolean
    registeredAt: string | null
    accountName: string | null
    organizationName: string | null
    isActive: boolean
    settlementCoin?: string | null
    settlementChain?: string | null
}

interface PlatformConfig {
    platformWallet: string
    acceptedTokens: Array<{ address: string; symbol: string; decimals: number; enabled: boolean }>
    contractAddress?: string
    chainId?: number
    isMultiToken?: boolean
    contractVersion?: string
    settlement?: {
        configured: boolean
        coinSymbol?: string
        chain?: string
        walletAddress?: string
        useNowPayments?: boolean
        coinName?: string
        updatedAt?: string
    }
}

interface FeeBreakdown {
    paymentType: string
    feeMode: string
    principalGHS: number
    feeGHS: number
    totalGHS: number
    principalUSDT: number | null
    feeUSDT: number | null
    totalUSDT: number | null
    exchangeRate: number | null
}

interface CryptoStatus {
    configured: boolean
    contractAddress?: string
    chainId?: number
    network?: string
    acceptedTokens?: Array<{ symbol: string; address: string; decimals: number; enabled: boolean }>
    usdtAddress?: string
    hasAdminSigner?: boolean
    onChainFees?: any
    onChainFeeError?: string
}

// ─── Helpers ────────────────────────────────────────────────────

const shortAddr = (addr: string | null) => {
    if (!addr) return '—'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const formatUSDT = (v: number | null) => {
    if (v === null || v === undefined) return '—'
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatGHS = (v: number | null) => {
    if (v === null || v === undefined) return '—'
    return `₵${v.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const paymentTypeIcon: Record<string, React.ElementType> = {
    rent: Landmark,
    deal: Briefcase,
    project: HardHat,
}

const paymentTypeColor: Record<string, string> = {
    rent: 'text-amber-500',
    deal: 'text-blue-500',
    project: 'text-green-500',
}

const statusConfig: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
    success: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/20 border-green-800', icon: CheckCircle2 },
    pending: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-800', icon: Clock },
    failed: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/20 border-red-800', icon: XCircle },
}

const explorerUrl = (chainId: number | undefined, txHash: string) => {
    const base = chainId === 137
        ? 'https://polygonscan.com'
        : chainId === 1
        ? 'https://etherscan.io'
        : chainId === 11155111
        ? 'https://sepolia.etherscan.io'
        : 'https://amoy.polygonscan.com'
    return `${base}/tx/${txHash}`
}

// ─── Sub-Components ─────────────────────────────────────────────

function StatCard({ title, value, subtitle, icon: Icon, color = 'text-red-500' }: {
    title: string
    value: string | number
    subtitle?: string
    icon: React.ElementType
    color?: string
}) {
    return (
        <div className="border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{title}</span>
                <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="font-mono text-xl text-foreground font-bold">{value}</p>
            {subtitle && <p className="font-mono text-[10px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>
    )
}

function CopiedButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }
    return (
        <button onClick={copy} className="text-muted-foreground hover:text-muted-foreground transition-colors">
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </button>
    )
}

// ─── Main Page ──────────────────────────────────────────────────

export default function AdminCryptoPage() {
    const [activeTab, setActiveTab] = useState('overview')
    const [metrics, setMetrics] = useState<CryptoMetrics | null>(null)
    const [cryptoStatus, setCryptoStatus] = useState<CryptoStatus | null>(null)
    const [transactions, setTransactions] = useState<CryptoTransaction[]>([])
    const [txTotal, setTxTotal] = useState(0)
    const [txPage, setTxPage] = useState(1)
    const [txFilter, setTxFilter] = useState({ status: '', paymentType: '', search: '' })
    const [wallets, setWallets] = useState<CryptoWallet[]>([])
    const [walletTotal, setWalletTotal] = useState(0)
    const [period, setPeriod] = useState('30d')
    const [loading, setLoading] = useState(true)
    const [txLoading, setTxLoading] = useState(false)
    const [walletLoading, setWalletLoading] = useState(false)

    // Fee calculator state
    const [calcAmount, setCalcAmount] = useState('2500')
    const [calcResult, setCalcResult] = useState<FeeBreakdown[] | null>(null)
    const [calcLoading, setCalcLoading] = useState(false)

    // Platform config state
    const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null)
    const [platformLoading, setPlatformLoading] = useState(false)
    const [newWalletAddress, setNewWalletAddress] = useState('')
    const [walletSaving, setWalletSaving] = useState(false)
    const [walletSuccess, setWalletSuccess] = useState<string | null>(null)
    const [walletError, setWalletError] = useState<string | null>(null)
    const [tokenToggling, setTokenToggling] = useState<string | null>(null)
    const [addTokenForm, setAddTokenForm] = useState({ address: '', symbol: '', decimals: '18' })
    const [addingToken, setAddingToken] = useState(false)
    const [tokenError, setTokenError] = useState<string | null>(null)
    const [tokenSuccess, setTokenSuccess] = useState<string | null>(null)

    // Settlement wallet config state (coin selector + wallet address)
    const [settlementCoinKey, setSettlementCoinKey] = useState('')
    const [settlementAddress, setSettlementAddress] = useState('')
    const [settlementSaving, setSettlementSaving] = useState(false)
    const [settlementError, setSettlementError] = useState<string | null>(null)
    const [settlementSuccess, setSettlementSuccess] = useState<string | null>(null)
    const [isEditingSettlement, setIsEditingSettlement] = useState(false)

    // ─── Data Fetchers ──────────────────────────────
    const loadMetrics = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/metrics?period=${period}`, { credentials: 'include' })
            if (!res.ok) throw new Error(`${res.status}`)
            const data = await res.json()
            setMetrics(data)
        } catch (err) {
            console.error('Failed to load crypto metrics:', err)
        }
    }, [period])

    const loadStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/status`, { credentials: 'include' })
            if (!res.ok) throw new Error(`${res.status}`)
            const data = await res.json()
            setCryptoStatus(data)
        } catch (err) {
            console.error('Failed to load crypto status:', err)
        }
    }, [])

    const loadTransactions = useCallback(async (page = 1) => {
        setTxLoading(true)
        try {
            const params = new URLSearchParams({ page: String(page), limit: '20' })
            if (txFilter.status) params.set('status', txFilter.status)
            if (txFilter.paymentType) params.set('paymentType', txFilter.paymentType)
            if (txFilter.search) params.set('search', txFilter.search)

            const res = await fetch(`${API_BASE}/admin/crypto/transactions?${params}`, { credentials: 'include' })
            if (!res.ok) throw new Error(`${res.status}`)
            const data = await res.json()
            setTransactions(data.data)
            setTxTotal(data.total)
            setTxPage(data.page)
        } catch (err) {
            console.error('Failed to load crypto transactions:', err)
        } finally {
            setTxLoading(false)
        }
    }, [txFilter])

    const loadWallets = useCallback(async () => {
        setWalletLoading(true)
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/wallets`, { credentials: 'include' })
            if (!res.ok) throw new Error(`${res.status}`)
            const data = await res.json()
            setWallets(data.data)
            setWalletTotal(data.total)
        } catch (err) {
            console.error('Failed to load crypto wallets:', err)
        } finally {
            setWalletLoading(false)
        }
    }, [])

    const calculateFees = async () => {
        setCalcLoading(true)
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/fee-calculator`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amountGHS: parseFloat(calcAmount) }),
            })
            if (!res.ok) throw new Error(`${res.status}`)
            const data = await res.json()
            setCalcResult(data.breakdown)
        } catch (err) {
            console.error('Failed to calculate fees:', err)
        } finally {
            setCalcLoading(false)
        }
    }

    // Platform config fetcher
    const loadPlatformConfig = useCallback(async () => {
        setPlatformLoading(true)
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/platform-config`, { credentials: 'include' })
            if (!res.ok) throw new Error(`${res.status}`)
            const data = await res.json()
            setPlatformConfig(data)
        } catch (err) {
            console.error('Failed to load platform config:', err)
        } finally {
            setPlatformLoading(false)
        }
    }, [])

    const handleUpdatePlatformWallet = async () => {
        if (!newWalletAddress || !/^0x[a-fA-F0-9]{40}$/.test(newWalletAddress)) {
            setWalletError('Invalid EVM address')
            return
        }
        setWalletSaving(true)
        setWalletError(null)
        setWalletSuccess(null)
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/platform-wallet`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: newWalletAddress }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || `${res.status}`)
            }
            const data = await res.json()
            setWalletSuccess(`Wallet updated! Tx: ${data.txHash?.slice(0, 12)}...`)
            setNewWalletAddress('')
            loadPlatformConfig()
        } catch (err: any) {
            setWalletError(err.message || 'Failed to update wallet')
        } finally {
            setWalletSaving(false)
        }
    }

    // ─── Settlement wallet save handler ──────────────
    const SETTLEMENT_COINS = [
        // On-Chain (Polygon) — direct smart contract settlement
        { key: 'usdt:polygon', symbol: 'USDT', chain: 'polygon', name: 'Tether USD', group: 'On-Chain (Polygon)', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', placeholder: '0x... (Polygon)' },
        { key: 'usdc:polygon', symbol: 'USDC', chain: 'polygon', name: 'USD Coin', group: 'On-Chain (Polygon)', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', placeholder: '0x... (Polygon)' },
        { key: 'weth:polygon', symbol: 'WETH', chain: 'polygon', name: 'Wrapped Ether', group: 'On-Chain (Polygon)', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', placeholder: '0x... (Polygon)' },
        { key: 'wbtc:polygon', symbol: 'WBTC', chain: 'polygon', name: 'Wrapped Bitcoin', group: 'On-Chain (Polygon)', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', placeholder: '0x... (Polygon)' },
        { key: 'pol:polygon', symbol: 'POL', chain: 'polygon', name: 'Polygon', group: 'On-Chain (Polygon)', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30', placeholder: '0x... (Polygon)' },
        // Off-Chain (via NOWPayments) — multi-chain
        { key: 'btc:bitcoin', symbol: 'BTC', chain: 'bitcoin', name: 'Bitcoin', group: 'Off-Chain (via NOWPayments)', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', placeholder: 'bc1... or 1... or 3...' },
        { key: 'eth:ethereum', symbol: 'ETH', chain: 'ethereum', name: 'Ethereum', group: 'Off-Chain (via NOWPayments)', color: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/30', placeholder: '0x... (Ethereum mainnet)' },
        { key: 'sol:solana', symbol: 'SOL', chain: 'solana', name: 'Solana', group: 'Off-Chain (via NOWPayments)', color: 'text-gradient-to-r from-purple-400 to-blue-400', bg: 'bg-purple-100 dark:bg-purple-900/30', placeholder: 'Solana address...' },
        { key: 'ltc:litecoin', symbol: 'LTC', chain: 'litecoin', name: 'Litecoin', group: 'Off-Chain (via NOWPayments)', color: 'text-gray-300', bg: 'bg-gray-900/30', placeholder: 'ltc1... or L... or M...' },
        { key: 'trx:tron', symbol: 'TRX', chain: 'tron', name: 'Tron', group: 'Off-Chain (via NOWPayments)', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', placeholder: 'T... (Tron address)' },
        { key: 'bnb:bsc', symbol: 'BNB', chain: 'bsc', name: 'BNB Chain', group: 'Off-Chain (via NOWPayments)', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', placeholder: '0x... (BSC)' },
        { key: 'usdt:ethereum', symbol: 'USDT', chain: 'ethereum', name: 'Tether (ERC-20)', group: 'Off-Chain (via NOWPayments)', color: 'text-green-600 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/20', placeholder: '0x... (Ethereum)' },
        { key: 'usdt:tron', symbol: 'USDT', chain: 'tron', name: 'Tether (TRC-20)', group: 'Off-Chain (via NOWPayments)', color: 'text-green-600 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/20', placeholder: 'T... (Tron)' },
    ]

    const selectedSettlementCoin = SETTLEMENT_COINS.find(c => c.key === settlementCoinKey)
    const settlementGroups = [...new Set(SETTLEMENT_COINS.map(c => c.group))]

    const handleSaveSettlement = async () => {
        if (!selectedSettlementCoin || !settlementAddress) return
        setSettlementSaving(true)
        setSettlementError(null)
        setSettlementSuccess(null)
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/platform-settlement`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coinSymbol: selectedSettlementCoin.symbol,
                    chain: selectedSettlementCoin.chain,
                    walletAddress: settlementAddress,
                }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || `${res.status}`)
            }
            const data = await res.json()
            const txInfo = data.txHash ? ` (tx: ${data.txHash.slice(0, 12)}...)` : ''
            setSettlementSuccess(`Platform settlement wallet saved — ${data.coinSymbol?.toUpperCase()} on ${data.chain}${txInfo}`)
            setIsEditingSettlement(false)
            loadPlatformConfig()
        } catch (err: any) {
            setSettlementError(err.message || 'Failed to save settlement wallet')
        } finally {
            setSettlementSaving(false)
        }
    }

    const handleToggleToken = async (tokenAddress: string, enabled: boolean) => {
        setTokenToggling(tokenAddress)
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/tokens/${tokenAddress}/toggle`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || `${res.status}`)
            }
            loadPlatformConfig()
        } catch (err: any) {
            console.error('Failed to toggle token:', err)
        } finally {
            setTokenToggling(null)
        }
    }

    const handleAddToken = async () => {
        if (!addTokenForm.address || !/^0x[a-fA-F0-9]{40}$/.test(addTokenForm.address)) {
            setTokenError('Invalid token contract address')
            return
        }
        if (!addTokenForm.symbol) {
            setTokenError('Symbol is required')
            return
        }
        setAddingToken(true)
        setTokenError(null)
        setTokenSuccess(null)
        try {
            const res = await fetch(`${API_BASE}/admin/crypto/tokens`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tokenAddress: addTokenForm.address,
                    symbol: addTokenForm.symbol.toUpperCase(),
                    decimals: parseInt(addTokenForm.decimals, 10),
                }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || `${res.status}`)
            }
            const data = await res.json()
            setTokenSuccess(`${addTokenForm.symbol.toUpperCase()} added! Tx: ${data.txHash?.slice(0, 12)}...`)
            setAddTokenForm({ address: '', symbol: '', decimals: '18' })
            loadPlatformConfig()
        } catch (err: any) {
            setTokenError(err.message || 'Failed to add token')
        } finally {
            setAddingToken(false)
        }
    }

    useEffect(() => {
        Promise.all([loadMetrics(), loadStatus()]).finally(() => setLoading(false))
    }, [loadMetrics, loadStatus])

    useEffect(() => {
        if (activeTab === 'transactions') loadTransactions(1)
    }, [activeTab, loadTransactions])

    useEffect(() => {
        if (activeTab === 'wallets') loadWallets()
    }, [activeTab, loadWallets])

    useEffect(() => {
        if (activeTab === 'platform') loadPlatformConfig()
    }, [activeTab, loadPlatformConfig])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-6 w-6 animate-spin text-red-500" />
            </div>
        )
    }

    const s = metrics?.summary

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="font-mono text-lg font-bold tracking-wider text-foreground flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-red-500" />
                        CRYPTO PAYMENTS
                    </h1>
                    <p className="font-mono text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                        {cryptoStatus?.configured ? (
                            <>
                                <span className="text-green-500">● CONNECTED</span> — {cryptoStatus.network} — {shortAddr(cryptoStatus.contractAddress || null)}
                            </>
                        ) : (
                            <span className="text-red-500">● NOT CONFIGURED — Set POLYGON_RPC_URL and PROPMETRIK_CONTRACT_ADDRESS in backend .env</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={period} onValueChange={(v) => setPeriod(v)}>
                        <SelectTrigger className="bg-card border-border text-foreground font-mono text-[10px] h-8 w-24 uppercase">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-foreground font-mono text-xs">
                            <SelectItem value="24h">24 Hours</SelectItem>
                            <SelectItem value="7d">7 Days</SelectItem>
                            <SelectItem value="30d">30 Days</SelectItem>
                            <SelectItem value="90d">90 Days</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { loadMetrics(); loadStatus() }}
                        className="border-border text-muted-foreground hover:text-red-400 hover:border-red-900 font-mono text-[10px] h-8"
                    >
                        <RefreshCw className="w-3 h-3" />
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-card/50 border border-border mb-6">
                    <TabsTrigger value="overview" className="font-mono text-[10px] uppercase data-[state=active]:bg-red-600 data-[state=active]:text-foreground">
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="transactions" className="font-mono text-[10px] uppercase data-[state=active]:bg-red-600 data-[state=active]:text-foreground">
                        Transactions
                    </TabsTrigger>
                    <TabsTrigger value="wallets" className="font-mono text-[10px] uppercase data-[state=active]:bg-red-600 data-[state=active]:text-foreground">
                        Wallets
                    </TabsTrigger>
                    <TabsTrigger value="calculator" className="font-mono text-[10px] uppercase data-[state=active]:bg-red-600 data-[state=active]:text-foreground">
                        Fee Calculator
                    </TabsTrigger>
                    <TabsTrigger value="platform" className="font-mono text-[10px] uppercase data-[state=active]:bg-red-600 data-[state=active]:text-foreground">
                        <Settings className="w-3 h-3 mr-1" /> Platform Config
                    </TabsTrigger>
                </TabsList>

                {/* ━━━ OVERVIEW TAB ━━━ */}
                <TabsContent value="overview" className="space-y-6">
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard
                            title="Total Volume (Crypto)"
                            value={(s?.totalVolumeUSDT ?? 0) > 0 ? formatUSDT(s?.totalVolumeUSDT ?? 0) : formatGHS(s?.totalVolumeGHS ?? 0)}
                            subtitle={(s?.totalVolumeUSDT ?? 0) > 0 ? `${formatGHS(s?.totalVolumeGHS ?? 0)} equivalent` : `${s?.totalTransactions ?? 0} crypto payments`}
                            icon={DollarSign}
                            color="text-green-500"
                        />
                        <StatCard
                            title="Fees Earned (Crypto)"
                            value={(s?.totalFeesUSDT ?? 0) > 0 ? formatUSDT(s?.totalFeesUSDT ?? 0) : formatGHS(s?.totalFeesGHS ?? 0)}
                            subtitle={(s?.totalFeesUSDT ?? 0) > 0 ? `${formatGHS(s?.totalFeesGHS ?? 0)} equivalent` : 'platform fees collected'}
                            icon={TrendingUp}
                            color="text-amber-500"
                        />
                        <StatCard
                            title="Transactions"
                            value={s?.totalTransactions ?? 0}
                            subtitle={`${s?.successful ?? 0} successful · ${s?.pending ?? 0} pending · ${s?.failed ?? 0} failed`}
                            icon={Activity}
                            color="text-blue-500"
                        />
                        <StatCard
                            title="Gas Spent (POL)"
                            value={s?.totalGasMatic?.toFixed(4) ?? '0'}
                            subtitle={`${s?.uniquePayers ?? 0} payers · ${s?.uniqueRecipients ?? 0} recipients`}
                            icon={Fuel}
                            color="text-purple-500"
                        />
                    </div>

                    {/* Volume by Type + Contract Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Volume by Payment Type */}
                        <div className="md:col-span-2 border border-border bg-card/50">
                            <div className="px-4 py-2 bg-muted/50 border-b border-border">
                                <span className="font-mono text-[10px] text-red-500 uppercase tracking-wider">Volume by Type</span>
                            </div>
                            <div className="p-4">
                                {(metrics?.volumeByType?.length || 0) === 0 ? (
                                    <p className="text-muted-foreground font-mono text-xs text-center py-8">No transactions in this period</p>
                                ) : (
                                    <div className="space-y-3">
                                        {metrics?.volumeByType?.map(vt => {
                                            const Icon = paymentTypeIcon[vt.paymentType] || Activity
                                            const color = paymentTypeColor[vt.paymentType] || 'text-muted-foreground'
                                            const useGHS = (vt.volumeUSDT || 0) === 0 && (vt.volumeGHS || 0) > 0
                                            const displayVol = useGHS ? formatGHS(vt.volumeGHS || 0) : formatUSDT(vt.volumeUSDT)
                                            const displayFee = useGHS ? formatGHS(vt.feesGHS || 0) : formatUSDT(vt.feesUSDT)
                                            const maxVol = Math.max(...(metrics.volumeByType?.map(v => useGHS ? (v.volumeGHS || 0) : v.volumeUSDT) || [1]), 1)
                                            const pct = ((useGHS ? (vt.volumeGHS || 0) : vt.volumeUSDT) / maxVol) * 100

                                            return (
                                                <div key={vt.paymentType}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-2">
                                                            <Icon className={`w-3.5 h-3.5 ${color}`} />
                                                            <span className="font-mono text-xs text-foreground uppercase">{vt.paymentType}</span>
                                                            <Badge variant="outline" className="font-mono text-[9px] border-border text-muted-foreground">
                                                                {vt.count} tx
                                                            </Badge>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="font-mono text-xs text-foreground">{displayVol}</span>
                                                            <span className="font-mono text-[10px] text-muted-foreground ml-2">fee: {displayFee}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full bg-muted h-1.5 rounded-full">
                                                        <div
                                                            className={`h-1.5 rounded-full ${vt.paymentType === 'rent' ? 'bg-amber-500' : vt.paymentType === 'deal' ? 'bg-blue-500' : 'bg-green-500'}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Contract Status Card */}
                        <div className="border border-border bg-card/50">
                            <div className="px-4 py-2 bg-muted/50 border-b border-border">
                                <span className="font-mono text-[10px] text-red-500 uppercase tracking-wider">Contract Status</span>
                            </div>
                            <div className="p-4 space-y-3">
                                <div>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Network</p>
                                    <p className="text-xs text-foreground font-mono">{cryptoStatus?.network || 'Not configured'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Contract</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-foreground font-mono">{shortAddr(cryptoStatus?.contractAddress || null)}</p>
                                        {cryptoStatus?.contractAddress && <CopiedButton text={cryptoStatus.contractAddress} />}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Accepted Tokens</p>
                                    {cryptoStatus?.acceptedTokens && cryptoStatus.acceptedTokens.length > 0 ? (
                                        <div className="space-y-1 mt-1">
                                            {cryptoStatus.acceptedTokens.map(t => (
                                                <div key={t.symbol} className="flex items-center justify-between">
                                                    <span className="font-mono text-xs text-foreground">{t.symbol}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-[9px] text-muted-foreground">{shortAddr(t.address)}</span>
                                                        <span className={`text-[9px] font-mono ${t.enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {t.enabled ? '✓' : '✗'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {SUPPORTED_TOKENS.map(t => (
                                                <span key={t.symbol} className={`px-1.5 py-0.5 rounded ${t.bg} ${t.color} font-mono text-[9px] font-bold`}>
                                                    {t.symbol}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Supported Networks</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        {SUPPORTED_NETWORKS.map(net => (
                                            <span key={net.name} className="flex items-center gap-1 font-mono text-xs text-foreground">
                                                <span className={`w-2 h-2 rounded-full ${net.color} inline-block`} />
                                                {net.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Chain ID</p>
                                    <p className="text-xs text-foreground font-mono">{cryptoStatus?.chainId || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Admin Signer</p>
                                    <Badge variant="outline" className={`font-mono text-[9px] ${cryptoStatus?.hasAdminSigner ? 'border-green-800 text-green-600 dark:text-green-400' : 'border-red-800 text-red-600 dark:text-red-400'}`}>
                                        {cryptoStatus?.hasAdminSigner ? '● Available' : '● Missing'}
                                    </Badge>
                                </div>
                                {cryptoStatus?.onChainFees && (
                                    <div className="border-t border-border pt-3">
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase mb-2">On-Chain Fee Config</p>
                                        {Object.entries(cryptoStatus.onChainFees).map(([key, val]: [string, any]) => (
                                            <div key={key} className="flex items-center justify-between py-0.5">
                                                <span className="text-[10px] text-muted-foreground font-mono uppercase">{key}</span>
                                                <span className="text-[10px] text-foreground font-mono">
                                                    {val?.bps ? `${val.bps}bps` : '—'} {val?.enabled ? '✓' : '✗'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Recent Transactions */}
                    <div className="border border-border bg-card/50">
                        <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
                            <span className="font-mono text-[10px] text-red-500 uppercase tracking-wider">Recent Transactions</span>
                            <button
                                onClick={() => setActiveTab('transactions')}
                                className="font-mono text-[10px] text-muted-foreground hover:text-red-400 transition-colors uppercase"
                            >
                                View All →
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Type</th>
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Tx Hash</th>
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">From</th>
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">To</th>
                                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Amount</th>
                                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Fee</th>
                                        <th className="text-center px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
                                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(metrics?.recentTransactions?.length || 0) === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-12 text-center font-mono text-xs text-muted-foreground">
                                                No crypto transactions yet
                                            </td>
                                        </tr>
                                    ) : (
                                        metrics?.recentTransactions?.map(tx => {
                                            const sc = statusConfig[tx.status] || statusConfig.pending
                                            const TypeIcon = paymentTypeIcon[tx.paymentType] || Activity
                                            const isNowPayments = tx.channel === 'crypto_nowpayments'
                                            return (
                                                <tr key={tx.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <TypeIcon className={`w-3 h-3 ${paymentTypeColor[tx.paymentType] || 'text-muted-foreground'}`} />
                                                            <span className="font-mono text-[10px] text-foreground uppercase">{tx.paymentType}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {tx.txHash ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-mono text-xs text-muted-foreground">{shortAddr(tx.txHash)}</span>
                                                                <CopiedButton text={tx.txHash} />
                                                                <a
                                                                    href={explorerUrl(cryptoStatus?.chainId, tx.txHash)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-muted-foreground hover:text-red-400"
                                                                >
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <Badge variant="outline" className="font-mono text-[9px] border-cyan-700/40 text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/10">
                                                                {isNowPayments ? 'NOWPayments' : 'No Hash'}
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="font-mono text-[10px] text-muted-foreground">{shortAddr(tx.payerWallet)}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="font-mono text-[10px] text-muted-foreground">{shortAddr(tx.recipientWallet)}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        {tx.principalCrypto != null ? (
                                                            <span className="font-mono text-xs text-foreground">{formatUSDT(tx.principalCrypto)}</span>
                                                        ) : tx.principalAmount != null ? (
                                                            <span className="font-mono text-xs text-foreground">{formatGHS(tx.principalAmount / 100)}</span>
                                                        ) : (
                                                            <span className="font-mono text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        {tx.feeCrypto != null ? (
                                                            <span className="font-mono text-[10px] text-amber-500">{formatUSDT(tx.feeCrypto)}</span>
                                                        ) : tx.serviceFee != null ? (
                                                            <span className="font-mono text-[10px] text-amber-500">{formatGHS(tx.serviceFee / 100)}</span>
                                                        ) : (
                                                            <span className="font-mono text-[10px] text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <Badge variant="outline" className={`font-mono text-[9px] ${sc.bg} ${sc.color}`}>
                                                            {tx.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <span className="font-mono text-[10px] text-muted-foreground">
                                                            {new Date(tx.createdAt).toLocaleString('en-GH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabsContent>

                {/* ━━━ TRANSACTIONS TAB ━━━ */}
                <TabsContent value="transactions" className="space-y-4">
                    {/* Filters */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search by tx hash, wallet, reference..."
                                value={txFilter.search}
                                onChange={(e) => setTxFilter(f => ({ ...f, search: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && loadTransactions(1)}
                                className="pl-9 bg-card border-border text-foreground font-mono text-xs h-9"
                            />
                        </div>
                        <Select value={txFilter.status} onValueChange={(v) => setTxFilter(f => ({ ...f, status: v === 'all' ? '' : v }))}>
                            <SelectTrigger className="bg-card border-border text-foreground font-mono text-[10px] h-9 w-32 uppercase">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground font-mono text-xs">
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="success">Success</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={txFilter.paymentType} onValueChange={(v) => setTxFilter(f => ({ ...f, paymentType: v === 'all' ? '' : v }))}>
                            <SelectTrigger className="bg-card border-border text-foreground font-mono text-[10px] h-9 w-32 uppercase">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground font-mono text-xs">
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="rent">Rent</SelectItem>
                                <SelectItem value="deal">Deal</SelectItem>
                                <SelectItem value="project">Project</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            onClick={() => loadTransactions(1)}
                            className="bg-red-600 hover:bg-red-700 text-foreground font-mono text-[10px] h-9 uppercase"
                        >
                            <Search className="w-3 h-3 mr-1" /> Search
                        </Button>
                    </div>

                    {/* Transactions Table */}
                    <div className="border border-border bg-card/50">
                        <div className="overflow-x-auto">
                            {txLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Reference</th>
                                            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Type</th>
                                            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Tx Hash</th>
                                            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Payer</th>
                                            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Recipient</th>
                                            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Principal</th>
                                            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Fee</th>
                                            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Rate</th>
                                            <th className="text-center px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
                                            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={10} className="px-4 py-16 text-center font-mono text-xs text-muted-foreground">
                                                    No crypto transactions found
                                                </td>
                                            </tr>
                                        ) : (
                                            transactions.map(tx => {
                                                const sc = statusConfig[tx.status] || statusConfig.pending
                                                const TypeIcon = paymentTypeIcon[tx.paymentType] || Activity
                                                const isNowPayments = tx.channel === 'crypto_nowpayments'
                                                return (
                                                    <tr key={tx.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                                                        <td className="px-4 py-2.5">
                                                            <span className="font-mono text-[10px] text-muted-foreground">{tx.reference?.slice(0, 12)}...</span>
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <TypeIcon className={`w-3 h-3 ${paymentTypeColor[tx.paymentType]}`} />
                                                                <span className="font-mono text-[10px] text-foreground uppercase">{tx.paymentType}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            {tx.txHash ? (
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-mono text-xs text-muted-foreground">{shortAddr(tx.txHash)}</span>
                                                                    <CopiedButton text={tx.txHash} />
                                                                    <a
                                                                        href={explorerUrl(cryptoStatus?.chainId, tx.txHash)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-muted-foreground hover:text-red-400"
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                </div>
                                                            ) : (
                                                                <Badge variant="outline" className="font-mono text-[9px] border-cyan-700/40 text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/10">
                                                                    {isNowPayments ? 'NOWPayments' : 'No Hash'}
                                                                </Badge>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <div>
                                                                <span className="font-mono text-[10px] text-muted-foreground">{shortAddr(tx.payerWallet)}</span>
                                                                {tx.payerEmail && (
                                                                    <p className="font-mono text-[9px] text-muted-foreground">{tx.payerEmail}</p>
                                                                )}
                                                                {!tx.payerWallet && tx.payCurrency && (
                                                                    <Badge variant="outline" className="font-mono text-[9px] border-border text-muted-foreground mt-0.5">
                                                                        {tx.payCurrency}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            {tx.recipientWallet ? (
                                                                <span className="font-mono text-[10px] text-muted-foreground">{shortAddr(tx.recipientWallet)}</span>
                                                            ) : tx.recipientType === 'organization' ? (
                                                                <div>
                                                                    <span className="font-mono text-[10px] text-muted-foreground">Organization</span>
                                                                    {tx.outcomeCurrency && (
                                                                        <Badge variant="outline" className="font-mono text-[9px] border-green-800/40 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/10 ml-1">
                                                                            → {tx.outcomeCurrency}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="font-mono text-[10px] text-muted-foreground">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            {tx.principalCrypto != null ? (
                                                                <span className="font-mono text-xs text-foreground">{formatUSDT(tx.principalCrypto)}</span>
                                                            ) : tx.principalAmount != null ? (
                                                                <span className="font-mono text-xs text-foreground">{formatGHS(tx.principalAmount / 100)}</span>
                                                            ) : (
                                                                <span className="font-mono text-xs text-muted-foreground">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            {tx.feeCrypto != null ? (
                                                                <span className="font-mono text-[10px] text-amber-500">{formatUSDT(tx.feeCrypto)}</span>
                                                            ) : tx.serviceFee != null ? (
                                                                <span className="font-mono text-[10px] text-amber-500">{formatGHS(tx.serviceFee / 100)}</span>
                                                            ) : (
                                                                <span className="font-mono text-[10px] text-muted-foreground">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                                {tx.exchangeRate ? `₵${tx.exchangeRate.toFixed(2)}/USD` : '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-center">
                                                            <Badge variant="outline" className={`font-mono text-[9px] ${sc.bg} ${sc.color}`}>
                                                                {tx.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                                {new Date(tx.createdAt).toLocaleString('en-GH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                )
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pagination */}
                        {txTotal > 20 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                                <span className="font-mono text-[10px] text-muted-foreground">
                                    Showing {(txPage - 1) * 20 + 1}–{Math.min(txPage * 20, txTotal)} of {txTotal}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={txPage <= 1}
                                        onClick={() => loadTransactions(txPage - 1)}
                                        className="border-border text-muted-foreground font-mono text-[10px] h-7"
                                    >
                                        ← Prev
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={txPage * 20 >= txTotal}
                                        onClick={() => loadTransactions(txPage + 1)}
                                        className="border-border text-muted-foreground font-mono text-[10px] h-7"
                                    >
                                        Next →
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* ━━━ WALLETS TAB ━━━ */}
                <TabsContent value="wallets" className="space-y-4">
                    <div className="border border-border bg-card/50">
                        <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
                            <span className="font-mono text-[10px] text-red-500 uppercase tracking-wider">
                                Registered Crypto Wallets ({walletTotal})
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadWallets}
                                className="border-border text-muted-foreground hover:text-red-400 font-mono text-[10px] h-7"
                            >
                                <RefreshCw className="w-3 h-3" />
                            </Button>
                        </div>
                        {walletLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                            </div>
                        ) : wallets.length === 0 ? (
                            <div className="py-16 text-center">
                                <Wallet className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                                <p className="font-mono text-xs text-muted-foreground">No crypto wallets registered yet</p>
                                <p className="font-mono text-[10px] text-muted-foreground mt-1">
                                    Users can configure wallets in their Payment Settings under the Crypto tab
                                </p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Entity</th>
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Organization</th>
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Wallet Address</th>
                                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Settlement</th>
                                        <th className="text-center px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Verified</th>
                                        <th className="text-center px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Active</th>
                                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Registered</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wallets.map(w => (
                                        <tr key={w.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <Badge variant="outline" className="font-mono text-[9px] border-border text-muted-foreground uppercase">
                                                    {w.entityType}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className="font-mono text-xs text-foreground">{w.organizationName || w.accountName || '—'}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-xs text-muted-foreground">{shortAddr(w.walletAddress)}</span>
                                                    <CopiedButton text={w.walletAddress} />
                                                    <a
                                                        href={`https://polygonscan.com/address/${w.walletAddress}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-muted-foreground hover:text-red-400"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {w.settlementCoin ? (
                                                    <div className="flex items-center gap-1">
                                                        <Badge variant="outline" className="font-mono text-[9px] border-green-800/40 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/10 uppercase">
                                                            {w.settlementCoin}
                                                        </Badge>
                                                        {w.settlementChain && (
                                                            <span className="font-mono text-[9px] text-muted-foreground">{w.settlementChain}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="font-mono text-[10px] text-muted-foreground">Not configured</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                {w.isVerified ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
                                                ) : (
                                                    <Clock className="w-3.5 h-3.5 text-yellow-500 mx-auto" />
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`font-mono text-[10px] ${w.isActive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    {w.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                    {w.registeredAt ? new Date(w.registeredAt).toLocaleDateString('en-GH') : '—'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </TabsContent>

                {/* ━━━ FEE CALCULATOR TAB ━━━ */}
                <TabsContent value="calculator" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Input */}
                        <Card className="bg-background border border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase tracking-wider text-red-500 flex items-center gap-2">
                                    <Calculator className="h-4 w-4" />
                                    Fee Calculator
                                </CardTitle>
                                <CardDescription className="text-muted-foreground font-mono text-xs">
                                    Enter a GHS amount to see real-time fee breakdown across all payment types
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="text-[10px] text-muted-foreground font-mono uppercase block mb-1.5">Payment Amount (GHS)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted-foreground text-sm">₵</span>
                                        <Input
                                            type="number"
                                            value={calcAmount}
                                            onChange={(e) => setCalcAmount(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && calculateFees()}
                                            placeholder="2500"
                                            className="pl-8 bg-card border-border text-foreground font-mono text-lg h-12"
                                        />
                                    </div>
                                </div>

                                {/* Quick amounts */}
                                <div className="flex flex-wrap gap-2">
                                    {[500, 1000, 2500, 5000, 10000, 50000].map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => { setCalcAmount(String(amt)); }}
                                            className={`px-3 py-1 rounded font-mono text-[10px] border transition-colors ${
                                                calcAmount === String(amt)
                                                    ? 'border-red-700 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                    : 'border-border bg-card text-muted-foreground hover:border-border'
                                            }`}
                                        >
                                            ₵{amt.toLocaleString()}
                                        </button>
                                    ))}
                                </div>

                                <Button
                                    onClick={calculateFees}
                                    disabled={calcLoading || !calcAmount || parseFloat(calcAmount) <= 0}
                                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-muted text-foreground font-mono text-xs uppercase font-bold h-10"
                                >
                                    {calcLoading ? (
                                        <><Loader2 className="w-3 h-3 animate-spin mr-2" /> Calculating...</>
                                    ) : (
                                        <><Calculator className="w-3 h-3 mr-2" /> Calculate Fees</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Results */}
                        <div className="space-y-3">
                            {!calcResult ? (
                                <div className="flex items-center justify-center h-full border border-border bg-card/50 rounded-lg">
                                    <div className="text-center py-16">
                                        <BarChart3 className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                                        <p className="font-mono text-xs text-muted-foreground">Enter an amount and click Calculate</p>
                                    </div>
                                </div>
                            ) : (
                                calcResult.map(br => {
                                    const Icon = paymentTypeIcon[br.paymentType] || Activity
                                    const color = paymentTypeColor[br.paymentType] || 'text-muted-foreground'
                                    const colorMap: Record<string, string> = {
                                        rent: 'border-amber-800 bg-amber-950/20',
                                        deal: 'border-blue-800 bg-blue-950/20',
                                        project: 'border-green-800 bg-green-950/20',
                                    }

                                    return (
                                        <Card key={br.paymentType} className={`bg-background border ${colorMap[br.paymentType] || 'border-border'}`}>
                                            <CardContent className="py-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Icon className={`w-4 h-4 ${color}`} />
                                                    <span className="font-mono text-xs text-foreground uppercase font-bold">{br.paymentType}</span>
                                                    <Badge variant="outline" className="font-mono text-[9px] border-border text-muted-foreground ml-auto">
                                                        {br.feeMode}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div>
                                                        <p className="text-[9px] text-muted-foreground font-mono uppercase">Principal</p>
                                                        <p className="text-sm text-foreground font-mono font-bold">{formatGHS(br.principalGHS)}</p>
                                                        {br.principalUSDT !== null && (
                                                            <p className="text-[10px] text-muted-foreground font-mono">{formatUSDT(br.principalUSDT)}</p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] text-muted-foreground font-mono uppercase">Platform Fee</p>
                                                        <p className="text-sm text-amber-500 font-mono font-bold">{formatGHS(br.feeGHS)}</p>
                                                        {br.feeUSDT !== null && (
                                                            <p className="text-[10px] text-muted-foreground font-mono">{formatUSDT(br.feeUSDT)}</p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] text-muted-foreground font-mono uppercase">Total</p>
                                                        <p className="text-sm text-foreground font-mono font-bold">{formatGHS(br.totalGHS)}</p>
                                                        {br.totalUSDT !== null && (
                                                            <p className="text-[10px] text-muted-foreground font-mono">{formatUSDT(br.totalUSDT)}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                {br.exchangeRate && (
                                                    <p className="text-[9px] text-muted-foreground font-mono mt-2">
                                                        Exchange rate: ₵{br.exchangeRate.toFixed(2)} / USD
                                                    </p>
                                                )}
                                            </CardContent>
                                        </Card>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* ━━━ PLATFORM CONFIG TAB ━━━ */}
                <TabsContent value="platform" className="space-y-6">
                    {platformLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                        </div>
                    ) : (
                        <>
                            {/* ── Platform Settlement Wallet ────────── */}
                            <Card className="bg-background border border-border">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-sm font-mono uppercase tracking-wider text-red-500 flex items-center gap-2">
                                                <Wallet className="h-4 w-4" />
                                                Platform Fee Settlement Wallet
                                            </CardTitle>
                                            <CardDescription className="text-muted-foreground font-mono text-xs mt-1">
                                                Select which coin and wallet address to receive all platform fees. All fees are auto-converted to your preferred currency.
                                            </CardDescription>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={loadPlatformConfig}
                                            className="border-border text-muted-foreground hover:text-red-400 font-mono text-[10px] h-7"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Current Settlement Display */}
                                    {platformConfig?.settlement?.configured && !isEditingSettlement ? (
                                        <div className="p-4 bg-card/80 border border-border rounded-lg space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Current Fee Wallet</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                                            SETTLEMENT_COINS.find(c => c.symbol.toLowerCase() === platformConfig.settlement?.coinSymbol)?.bg || 'bg-muted'
                                                        } ${
                                                            SETTLEMENT_COINS.find(c => c.symbol.toLowerCase() === platformConfig.settlement?.coinSymbol)?.color || 'text-muted-foreground'
                                                        }`}>
                                                            {platformConfig.settlement.coinSymbol?.toUpperCase()}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground font-mono">
                                                            on {platformConfig.settlement.chain}
                                                        </span>
                                                        {platformConfig.settlement.useNowPayments && (
                                                            <Badge variant="outline" className="font-mono text-[8px] border-yellow-800 text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20">
                                                                via NOWPayments
                                                            </Badge>
                                                        )}
                                                        {!platformConfig.settlement.useNowPayments && (
                                                            <Badge variant="outline" className="font-mono text-[8px] border-green-800 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20">
                                                                <Shield className="h-2.5 w-2.5 mr-0.5" /> On-Chain
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm text-foreground font-mono font-bold">
                                                            {platformConfig.settlement.walletAddress}
                                                        </p>
                                                        <CopiedButton text={platformConfig.settlement.walletAddress || ''} />
                                                    </div>
                                                    {platformConfig.settlement.updatedAt && (
                                                        <p className="text-[9px] text-muted-foreground font-mono">
                                                            Configured {new Date(platformConfig.settlement.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                        </p>
                                                    )}
                                                </div>
                                                <Badge variant="outline" className="font-mono text-[9px] border-green-800 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20 h-fit">
                                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Configured
                                                </Badge>
                                            </div>
                                            <div className="pt-3 border-t border-border">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setIsEditingSettlement(true)
                                                        setSettlementAddress(platformConfig.settlement?.walletAddress || '')
                                                        const matched = SETTLEMENT_COINS.find(
                                                            c => c.symbol.toLowerCase() === platformConfig.settlement?.coinSymbol &&
                                                                 c.chain.toLowerCase() === platformConfig.settlement?.chain
                                                        )
                                                        setSettlementCoinKey(matched?.key || '')
                                                        setSettlementError(null)
                                                        setSettlementSuccess(null)
                                                    }}
                                                    className="border-border text-muted-foreground hover:text-red-400 font-mono text-[10px] uppercase"
                                                >
                                                    <Settings className="w-3 h-3 mr-1" /> Change Settlement Wallet
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Not configured or editing */}
                                    {(!platformConfig?.settlement?.configured || isEditingSettlement) && (
                                        <div className="space-y-4">
                                            {!platformConfig?.settlement?.configured && (
                                                <div className="flex items-start gap-2 p-3 bg-yellow-950/20 border border-yellow-900/50 rounded-lg">
                                                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <p className="text-yellow-600 dark:text-yellow-400 font-mono text-xs font-bold">No Settlement Wallet Configured</p>
                                                        <p className="text-yellow-600 font-mono text-[10px] mt-0.5">
                                                            Select your preferred coin and enter your wallet address. All platform fees will be auto-converted and sent to this wallet.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Step 1: Select Coin */}
                                            <div className="space-y-2">
                                                <p className="text-[10px] text-muted-foreground font-mono uppercase flex items-center gap-1">
                                                    <span className="w-4 h-4 rounded-full bg-red-600 text-foreground flex items-center justify-center text-[8px] font-bold">1</span>
                                                    Select Payout Currency
                                                </p>
                                                <Select
                                                    value={settlementCoinKey}
                                                    onValueChange={(v) => {
                                                        setSettlementCoinKey(v)
                                                        setSettlementAddress('')
                                                        setSettlementError(null)
                                                        setSettlementSuccess(null)
                                                    }}
                                                >
                                                    <SelectTrigger className="bg-card border-border text-foreground font-mono text-sm h-10">
                                                        <SelectValue placeholder="Choose coin for fee collection..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border text-foreground font-mono text-sm max-h-80">
                                                        {settlementGroups.map(group => (
                                                            <React.Fragment key={group}>
                                                                <div className="px-3 py-1.5 text-[9px] text-muted-foreground uppercase tracking-wider font-bold border-b border-border bg-background">
                                                                    {group}
                                                                </div>
                                                                {SETTLEMENT_COINS.filter(c => c.group === group).map(coin => (
                                                                    <SelectItem key={coin.key} value={coin.key}>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${coin.bg} ${coin.color}`}>
                                                                                {coin.symbol}
                                                                            </span>
                                                                            <span className="text-muted-foreground">{coin.name}</span>
                                                                            <span className="text-muted-foreground text-[10px]">({coin.chain})</span>
                                                                        </div>
                                                                    </SelectItem>
                                                                ))}
                                                            </React.Fragment>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Step 2: Enter Wallet Address */}
                                            {selectedSettlementCoin && (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-muted-foreground font-mono uppercase flex items-center gap-1">
                                                        <span className="w-4 h-4 rounded-full bg-red-600 text-foreground flex items-center justify-center text-[8px] font-bold">2</span>
                                                        Enter {selectedSettlementCoin.symbol} Wallet Address
                                                    </p>
                                                    <input
                                                        type="text"
                                                        value={settlementAddress}
                                                        onChange={(e) => { setSettlementAddress(e.target.value.trim()); setSettlementError(null) }}
                                                        placeholder={selectedSettlementCoin.placeholder}
                                                        className="w-full px-3 py-2 bg-card border border-border rounded-md text-foreground font-mono text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none"
                                                    />
                                                    <p className="text-[9px] text-muted-foreground font-mono">
                                                        This wallet will receive all platform fees. Make sure you own this address and it supports {selectedSettlementCoin.symbol} on {selectedSettlementCoin.chain}.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Save Button */}
                                            <div className="flex items-center gap-3 pt-2">
                                                <Button
                                                    onClick={handleSaveSettlement}
                                                    disabled={settlementSaving || !selectedSettlementCoin || !settlementAddress}
                                                    className="bg-red-600 hover:bg-red-700 disabled:bg-muted disabled:text-muted-foreground text-foreground font-mono text-[10px] uppercase font-bold h-10 px-8"
                                                >
                                                    {settlementSaving ? (
                                                        <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Saving...</>
                                                    ) : (
                                                        <><Save className="w-3 h-3 mr-1" /> Save Settlement Wallet</>
                                                    )}
                                                </Button>
                                                {isEditingSettlement && (
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => { setIsEditingSettlement(false); setSettlementError(null); setSettlementSuccess(null) }}
                                                        className="border-border text-muted-foreground hover:text-foreground font-mono text-[10px] uppercase h-10"
                                                    >
                                                        Cancel
                                                    </Button>
                                                )}
                                            </div>

                                            {settlementError && (
                                                <div className="flex items-center gap-2 p-2 bg-red-950/30 border border-red-800 rounded text-red-600 dark:text-red-400 text-xs font-mono">
                                                    <XCircle className="w-3 h-3 flex-shrink-0" /> {settlementError}
                                                </div>
                                            )}
                                            {settlementSuccess && (
                                                <div className="flex items-center gap-2 p-2 bg-green-950/30 border border-green-800 rounded text-green-600 dark:text-green-400 text-xs font-mono">
                                                    <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> {settlementSuccess}
                                                </div>
                                            )}

                                            {/* Info */}
                                            <div className="flex items-start gap-2 pt-3 border-t border-border">
                                                <Shield className="h-3.5 w-3.5 text-zinc-700 mt-0.5 flex-shrink-0" />
                                                <p className="text-[9px] text-muted-foreground font-mono leading-relaxed">
                                                    For Polygon tokens (USDT, USDC, WETH, WBTC, POL), the wallet is also updated on-chain via the smart contract and
                                                    the preferred token is set for automatic fee conversion. For off-chain coins (BTC, ETH, SOL, etc.),
                                                    fees are routed through NOWPayments to your wallet.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* ── Contract Version Banner ───────── */}
                            {platformConfig && !platformConfig.isMultiToken && (
                                <Card className="bg-yellow-950/20 border border-yellow-900/50">
                                    <CardContent className="flex items-start gap-3 py-4">
                                        <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-yellow-600 dark:text-yellow-400 font-mono text-sm font-bold">Contract v1 Detected — Single Token (USDT Only)</p>
                                            <p className="text-yellow-600 font-mono text-xs mt-1">
                                                The deployed contract at {shortAddr(platformConfig.contractAddress || null)} does not support multi-token management.
                                                Deploy the v2 contract to enable USDT, USDC, WETH, and WBTC token management from this panel.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ── Accepted Tokens ─────────────────── */}
                            {platformConfig && (
                            <Card className="bg-background border border-border">
                                <CardHeader>
                                    <CardTitle className="text-sm font-mono uppercase tracking-wider text-red-500 flex items-center gap-2">
                                        <Activity className="h-4 w-4" />
                                        Accepted Tokens (On-Chain)
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground font-mono text-xs">
                                        {platformConfig.isMultiToken
                                            ? 'Tokens that can be used for payments. Toggle to enable/disable receiving fees in each token.'
                                            : 'Multi-token management requires the v2 contract. Current contract only supports USDT.'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Tokens Table */}
                                    {platformConfig.acceptedTokens.length === 0 ? (
                                        <div className="py-8 text-center border border-border rounded-lg">
                                            <p className="text-muted-foreground font-mono text-xs">No tokens registered on-chain yet</p>
                                            <p className="text-muted-foreground font-mono text-[10px] mt-1">Use the form below to add tokens</p>
                                        </div>
                                    ) : (
                                        <div className="border border-border rounded-lg overflow-hidden">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="bg-card/80 border-b border-border">
                                                        <th className="text-left px-4 py-2.5 font-mono text-[10px] text-muted-foreground uppercase">Token</th>
                                                        <th className="text-left px-4 py-2.5 font-mono text-[10px] text-muted-foreground uppercase">Contract Address</th>
                                                        <th className="text-center px-4 py-2.5 font-mono text-[10px] text-muted-foreground uppercase">Decimals</th>
                                                        <th className="text-center px-4 py-2.5 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
                                                        <th className="text-center px-4 py-2.5 font-mono text-[10px] text-muted-foreground uppercase">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {platformConfig.acceptedTokens.map(token => {
                                                        const tokenMeta = SUPPORTED_TOKENS.find(t => t.symbol === token.symbol)
                                                        return (
                                                            <tr key={token.address} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                                                                <td className="px-4 py-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${tokenMeta?.bg || 'bg-muted'} ${tokenMeta?.color || 'text-muted-foreground'}`}>
                                                                            {token.symbol}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-mono text-xs text-muted-foreground">{shortAddr(token.address)}</span>
                                                                        <CopiedButton text={token.address} />
                                                                        <a
                                                                            href={`https://${platformConfig.chainId === 137 ? 'polygonscan.com' : platformConfig.chainId === 1 ? 'etherscan.io' : 'amoy.polygonscan.com'}/token/${token.address}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-muted-foreground hover:text-red-400"
                                                                        >
                                                                            <ExternalLink className="w-3 h-3" />
                                                                        </a>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className="font-mono text-xs text-muted-foreground">{token.decimals}</span>
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={`font-mono text-[9px] ${token.enabled
                                                                            ? 'border-green-800 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20'
                                                                            : 'border-red-800 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20'
                                                                        }`}
                                                                    >
                                                                        {token.enabled ? '● Enabled' : '● Disabled'}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleToggleToken(token.address, !token.enabled)}
                                                                        disabled={tokenToggling === token.address}
                                                                        className={`font-mono text-[10px] h-7 ${token.enabled
                                                                            ? 'border-red-800 text-red-600 dark:text-red-400 hover:bg-red-950/30'
                                                                            : 'border-green-800 text-green-600 dark:text-green-400 hover:bg-green-950/30'
                                                                        }`}
                                                                    >
                                                                        {tokenToggling === token.address ? (
                                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                                        ) : token.enabled ? (
                                                                            <><Power className="w-3 h-3 mr-1" /> Disable</>
                                                                        ) : (
                                                                            <><Power className="w-3 h-3 mr-1" /> Enable</>
                                                                        )}
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Add Token Form */}
                                    <div className="pt-4 border-t border-border space-y-3">
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase flex items-center gap-1.5">
                                            <Plus className="w-3 h-3" /> Add New Token
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                            <div className="md:col-span-2">
                                                <label className="text-[9px] text-muted-foreground font-mono uppercase block mb-1">Token Contract Address *</label>
                                                <input
                                                    type="text"
                                                    value={addTokenForm.address}
                                                    onChange={(e) => { setAddTokenForm(f => ({ ...f, address: e.target.value.trim() })); setTokenError(null) }}
                                                    placeholder="0x..."
                                                    maxLength={42}
                                                    className="w-full px-3 py-2 bg-card border border-border rounded-md text-foreground font-mono text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-muted-foreground font-mono uppercase block mb-1">Symbol *</label>
                                                <input
                                                    type="text"
                                                    value={addTokenForm.symbol}
                                                    onChange={(e) => setAddTokenForm(f => ({ ...f, symbol: e.target.value }))}
                                                    placeholder="e.g. USDT"
                                                    maxLength={10}
                                                    className="w-full px-3 py-2 bg-card border border-border rounded-md text-foreground font-mono text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none uppercase"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-muted-foreground font-mono uppercase block mb-1">Decimals *</label>
                                                <Select value={addTokenForm.decimals} onValueChange={(v) => setAddTokenForm(f => ({ ...f, decimals: v }))}>
                                                    <SelectTrigger className="bg-card border-border text-foreground font-mono text-sm h-[38px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border text-foreground font-mono text-sm">
                                                        <SelectItem value="6">6 (USDT, USDC)</SelectItem>
                                                        <SelectItem value="8">8 (WBTC)</SelectItem>
                                                        <SelectItem value="18">18 (WETH, standard)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Button
                                                onClick={handleAddToken}
                                                disabled={addingToken || !addTokenForm.address || !addTokenForm.symbol}
                                                className="bg-red-600 hover:bg-red-700 disabled:bg-muted disabled:text-muted-foreground text-foreground font-mono text-[10px] uppercase font-bold h-9 px-6"
                                            >
                                                {addingToken ? (
                                                    <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Adding...</>
                                                ) : (
                                                    <><Plus className="w-3 h-3 mr-1" /> Add Token On-Chain</>
                                                )}
                                            </Button>
                                        </div>
                                        {tokenError && (
                                            <div className="flex items-center gap-2 p-2 bg-red-950/30 border border-red-800 rounded text-red-600 dark:text-red-400 text-xs font-mono">
                                                <XCircle className="w-3 h-3 flex-shrink-0" /> {tokenError}
                                            </div>
                                        )}
                                        {tokenSuccess && (
                                            <div className="flex items-center gap-2 p-2 bg-green-950/30 border border-green-800 rounded text-green-600 dark:text-green-400 text-xs font-mono">
                                                <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> {tokenSuccess}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex items-start gap-2 pt-3 border-t border-border">
                                        <Shield className="h-3.5 w-3.5 text-zinc-700 mt-0.5 flex-shrink-0" />
                                        <p className="text-[9px] text-muted-foreground font-mono leading-relaxed">
                                            Token management is an on-chain operation and requires the admin signer private key.
                                            Adding or toggling tokens sends a transaction to the PROPMETRIK smart contract.
                                            Only the contract owner (Safe multisig) can modify the token allowlist.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                            )}
                        </>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
