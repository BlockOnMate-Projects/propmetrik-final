'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
    Building2,
    Smartphone,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Shield,
    CreditCard,
    RefreshCw,
    ExternalLink,
    Info,
    Wallet,
    Copy,
    Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    paymentConfigApi as pmPaymentConfigApi,
    PaymentAccountConfig,
    BankListItem,
} from '@/lib/property-management-api'

// Fallback mobile money providers (used if API hasn't loaded yet)
const MOMO_PROVIDERS_FALLBACK = [
    { code: 'MTN', name: 'MTN Mobile Money', color: '#FFC107' },
    { code: 'VOD', name: 'Vodafone Cash (Telecel)', color: '#E60000' },
    { code: 'ATL', name: 'AirtelTigo Money', color: '#ED1C24' },
]

type SettlementMethod = 'bank' | 'mobile_money'

/** Generic payment config API shape */
export interface PaymentConfigApiShape {
    getAccount: () => Promise<PaymentAccountConfig>;
    getBanks: () => Promise<{ status: boolean; data: BankListItem[] }>;
    resolveAccount: (accountNumber: string, bankCode: string) => Promise<any>;
    registerAccount: (data: {
        bankCode: string;
        accountNumber: string;
        businessName: string;
        contactEmail?: string;
        contactPhone?: string;
    }) => Promise<{ success: boolean; subaccountCode: string }>;
    getCryptoWallet?: () => Promise<any>;
    saveCryptoWallet?: (walletAddress: string, payoutCoin?: string, payoutChain?: string) => Promise<any>;
    getSettlementCoins?: () => Promise<any>;
}

interface PaymentSettingsProps {
    /** Which API to call. Defaults to PM payment config API */
    paymentApi?: PaymentConfigApiShape;
    /** Label shown in the card header, e.g. "Property Management" */
    serviceLabel?: string;
}

export default function PaymentSettings({ paymentApi, serviceLabel }: PaymentSettingsProps = {}) {
    const api = paymentApi || pmPaymentConfigApi;
    const label = serviceLabel || 'Property Management';

    // Service-specific copy
    const serviceCopy = {
        bannerText: label === 'Deal Management'
            ? 'Connect a bank account or mobile money wallet to receive deal commission payouts. Once configured, payments will be automatically split — you receive the principal and PROPMETRIK retains a small service fee.'
            : label === 'Project Management'
            ? 'Connect a bank account or mobile money wallet to receive buyer payments and contractor settlements. Once configured, payments will be automatically split — you receive the principal and PROPMETRIK retains a small service fee.'
            : label === 'Valuation Services'
            ? 'Connect a bank account or mobile money wallet to receive valuation fee payments from clients. Once configured, payments will be automatically split — you receive the principal and PROPMETRIK retains the 2.5% platform fee.'
            : 'Connect a bank account or mobile money wallet to receive rent payments from tenants. Once configured, payments will be automatically split — you receive the principal and PROPMETRIK retains a small service fee.',
        formSubtitle: label === 'Deal Management'
            ? 'Choose how you want to receive deal payouts'
            : label === 'Project Management'
            ? 'Choose how you want to receive project payments'
            : label === 'Valuation Services'
            ? 'Choose how you want to receive valuation fee payments'
            : 'Choose how you want to receive payments from tenants',
        configuredSubtitle: label === 'Deal Management'
            ? 'Where deal commission payouts are deposited'
            : label === 'Project Management'
            ? 'Where project payments are deposited'
            : label === 'Valuation Services'
            ? 'Where valuation fee payments are deposited'
            : 'Where tenant rent payments are deposited',
        splitNote: label === 'Deal Management'
            ? 'Deal payments are automatically split: you receive the principal, PROPMETRIK retains the service fee.'
            : label === 'Project Management'
            ? 'Buyer payments are automatically split: you receive the principal, PROPMETRIK retains the service fee.'
            : label === 'Valuation Services'
            ? 'Valuation payments are automatically split: you receive the principal, PROPMETRIK retains the 2.5% platform fee.'
            : 'Rent paid by tenants is automatically split: landlord receives principal, PROPMETRIK retains the service fee.',
        feeNote: label === 'Deal Management'
            ? 'per deal payment'
            : label === 'Project Management'
            ? 'per project payment'
            : label === 'Valuation Services'
            ? 'per valuation invoice payment'
            : 'per rent payment',
        feeDescription: label === 'Deal Management'
            ? 'This fee is added on top of the deal amount, paid by the buyer.'
            : label === 'Project Management'
            ? 'This fee is added on top of the invoice amount, paid by the client.'
            : label === 'Valuation Services'
            ? 'This fee is added on top of the valuation invoice, paid by the client.'
            : 'This fee is added on top of the rent amount, paid by the tenant.',
        feeExample: label === 'Deal Management'
            ? 'Example: GHS 2,500 deal → buyer pays GHS 2,525 → you receive GHS 2,500.'
            : label === 'Project Management'
            ? 'Example: GHS 2,500 invoice → client pays GHS 2,525 → you receive GHS 2,500.'
            : label === 'Valuation Services'
            ? 'Example: GHS 19,000 valuation → client pays GHS 19,475 → you receive GHS 19,000.'
            : 'Example: GHS 2,500 rent → tenant pays GHS 2,525 → you receive GHS 2,500.',
    };
    // Account status
    const [account, setAccount] = useState<PaymentAccountConfig | null>(null)
    const [loading, setLoading] = useState(true)

    // Form state
    const [isEditing, setIsEditing] = useState(false)
    const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>('bank')
    const [banks, setBanks] = useState<BankListItem[]>([])
    const [momoProviders, setMomoProviders] = useState<BankListItem[]>([])
    const [banksLoading, setBanksLoading] = useState(false)
    const [banksLoaded, setBanksLoaded] = useState(false)

    // Bank fields
    const [bankCode, setBankCode] = useState('')
    const [accountNumber, setAccountNumber] = useState('')
    const [businessName, setBusinessName] = useState('')
    const [contactEmail, setContactEmail] = useState('')

    // Mobile money fields
    const [momoProvider, setMomoProvider] = useState('')
    const [momoNumber, setMomoNumber] = useState('')

    // Account resolution
    const [resolvedName, setResolvedName] = useState<string | null>(null)
    const [resolving, setResolving] = useState(false)
    const [resolveError, setResolveError] = useState<string | null>(null)

    // Registration
    const [registering, setRegistering] = useState(false)
    const [registerError, setRegisterError] = useState<string | null>(null)
    const [registerSuccess, setRegisterSuccess] = useState(false)

    // Load current account config
    const loadAccount = useCallback(async () => {
        try {
            setLoading(true)
            const config = await api.getAccount()
            setAccount(config)
        } catch (err) {
            console.error('Failed to load payment account:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadAccount()
    }, [loadAccount])

    // Load all Paystack banks/mobile money on mount — split by type
    useEffect(() => {
        if (banksLoaded) return
        setBanksLoading(true)
        api.getBanks()
            .then(res => {
                const bankList: BankListItem[] = res?.data || []
                const active = bankList.filter((b) => b.active)

                // Separate banks from mobile money by Paystack 'type' field
                const mobileMoney = active.filter((b) => b.type === 'mobile_money')
                const bankOnly = active.filter((b) => b.type !== 'mobile_money')

                // Deduplicate banks by code — keep shortest name (cleaner)
                const bankMap = new Map<string, BankListItem>()
                bankOnly.forEach((b) => {
                    const existing = bankMap.get(b.code)
                    if (!existing || b.name.length < existing.name.length) {
                        bankMap.set(b.code, b)
                    }
                })
                setBanks(Array.from(bankMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
                setMomoProviders(mobileMoney)
                setBanksLoaded(true)
            })
            .catch(() => { setBanks([]); setMomoProviders([]) })
            .finally(() => setBanksLoading(false))
    }, [banksLoaded])

    // Resolve bank account when both fields are filled
    const handleResolve = async () => {
        const code = settlementMethod === 'bank' ? bankCode : momoProvider
        const number = settlementMethod === 'bank' ? accountNumber : momoNumber

        if (!code || !number || number.length < 10) return

        setResolving(true)
        setResolveError(null)
        setResolvedName(null)

        try {
            const result = await api.resolveAccount(number, code)
            if (result.status && result.data?.account_name) {
                setResolvedName(result.data.account_name)
            } else {
                setResolveError(result.error || result.message || 'Could not verify this account. Please check the details.')
            }
        } catch (err: any) {
            // Extract the error message from the API response (fetchApi throws Error with backend message)
            const apiError = err?.message || ''
            if (apiError.toLowerCase().includes('test mode') || apiError.toLowerCase().includes('daily limit')) {
                setResolveError('Paystack test mode: daily bank resolve limit exceeded. Use test bank code 001 with account 0000000000, or try again tomorrow.')
            } else if (apiError.toLowerCase().includes('could not resolve')) {
                setResolveError('Could not verify this account. Please double-check the bank and account number.')
            } else {
                setResolveError(apiError || 'Account verification failed. Please check the number and try again.')
            }
        } finally {
            setResolving(false)
        }
    }

    // Register the account
    const handleRegister = async () => {
        if (!resolvedName) return

        const code = settlementMethod === 'bank' ? bankCode : momoProvider
        const number = settlementMethod === 'bank' ? accountNumber : momoNumber

        if (!code || !number || !businessName.trim()) {
            setRegisterError('Please fill in all required fields.')
            return
        }

        setRegistering(true)
        setRegisterError(null)

        try {
            const result = await api.registerAccount({
                bankCode: code,
                accountNumber: number,
                businessName: businessName.trim(),
                contactEmail: contactEmail || undefined,
            })

            if (result.success) {
                setRegisterSuccess(true)
                setIsEditing(false)
                // Reload account config
                await loadAccount()
                // Reset form
                resetForm()
            } else {
                setRegisterError('Failed to register account. Please try again.')
            }
        } catch (err: any) {
            setRegisterError(err.message || 'Registration failed. Please try again.')
        } finally {
            setRegistering(false)
        }
    }

    const resetForm = () => {
        setBankCode('')
        setAccountNumber('')
        setBusinessName('')
        setContactEmail('')
        setMomoProvider('')
        setMomoNumber('')
        setResolvedName(null)
        setResolveError(null)
        setRegisterError(null)
        setRegisterSuccess(false)
    }

    const startEditing = () => {
        resetForm()
        setIsEditing(true)
        setRegisterSuccess(false)
    }

    const maskAccount = (num: string) => {
        if (!num || num.length < 6) return num
        return num.slice(0, 3) + '****' + num.slice(-3)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
        )
    }

    // ─── Configured View ────────────────────────────────────────────
    if (account?.configured && !isEditing) {
        return (
            <div className="space-y-6">
                {registerSuccess && (
                    <div className="flex items-center gap-2 p-3 bg-green-950/30 border border-green-800 rounded-lg">
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <p className="text-green-400 text-sm font-mono">Payout account configured successfully. Tenant payments will now be split automatically.</p>
                    </div>
                )}

                <Card className="bg-black border border-zinc-800">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-mono uppercase tracking-wider text-amber-500 flex items-center gap-2">
                                    <CreditCard className="h-4 w-4" />
                                    Payout Account
                                </CardTitle>
                                <CardDescription className="text-zinc-500 font-mono text-xs mt-1">
                                    {serviceCopy.configuredSubtitle}
                                </CardDescription>
                            </div>
                            <Badge
                                variant="outline"
                                className={`font-mono text-[10px] uppercase ${
                                    account.isVerified
                                        ? 'border-green-800 text-green-400 bg-green-900/20'
                                        : 'border-yellow-800 text-yellow-400 bg-yellow-900/20'
                                }`}
                            >
                                <Shield className="h-3 w-3 mr-1" />
                                {account.isVerified ? 'Verified' : 'Pending'}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Method</p>
                                <p className="text-sm text-white font-mono flex items-center gap-2">
                                    {account.settlementMethod === 'mobile_money' ? (
                                        <><Smartphone className="h-3.5 w-3.5 text-amber-500" /> Mobile Money</>
                                    ) : (
                                        <><Building2 className="h-3.5 w-3.5 text-amber-500" /> Bank Transfer</>
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">
                                    {account.settlementMethod === 'mobile_money' ? 'Provider' : 'Bank'}
                                </p>
                                <p className="text-sm text-white font-mono">
                                    {account.settlementMethod === 'mobile_money'
                                        ? (momoProviders.find(p => p.code === account.momoProvider)?.name || MOMO_PROVIDERS_FALLBACK.find(p => p.code === account.momoProvider)?.name || account.momoProvider)
                                        : account.bankName || '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Account</p>
                                <p className="text-sm text-white font-mono">
                                    {maskAccount(
                                        account.settlementMethod === 'mobile_money'
                                            ? account.momoNumber || ''
                                            : account.accountNumber || ''
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Account Name</p>
                                <p className="text-sm text-white font-mono">{account.accountName || '—'}</p>
                            </div>
                        </div>

                        <div className="border-t border-zinc-800 pt-4">
                            <div className="flex items-center gap-6">
                                <div>
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Service Fee</p>
                                    <p className="text-xs text-zinc-300 font-mono">
                                        max({account.platformFeePercentage || 1}%, GHS {(account.platformFeeFlat || 25).toFixed(2)})
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Configured</p>
                                    <p className="text-xs text-zinc-300 font-mono">
                                        {account.createdAt ? new Date(account.createdAt).toLocaleDateString('en-GH') : '—'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                            <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-mono">
                                <Info className="h-3 w-3" />
                                {serviceCopy.splitNote}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={startEditing}
                                className="border-zinc-800 text-zinc-400 hover:text-amber-500 hover:border-amber-900 font-mono text-[10px] uppercase"
                            >
                                <RefreshCw className="h-3 w-3 mr-1" /> Update
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Crypto Wallet Section */}
                <CryptoWalletSettings serviceLabel={label} api={api} />
            </div>
        )
    }

    // ─── Setup / Edit Form ──────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Intro Banner */}
            {!account?.configured && (
                <Card className="bg-amber-950/20 border border-amber-900/50">
                    <CardContent className="flex items-start gap-3 py-4">
                        <CreditCard className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-amber-400 font-mono text-sm font-bold">Set up your payout account</p>
                            <p className="text-amber-600 font-mono text-xs mt-1">
                                {serviceCopy.bannerText}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-black border border-zinc-800">
                <CardHeader>
                    <CardTitle className="text-sm font-mono uppercase tracking-wider text-amber-500 flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        {account?.configured ? 'Update Payout Account' : 'Configure Payout Account'}
                    </CardTitle>
                    <CardDescription className="text-zinc-500 font-mono text-xs">
                        {serviceCopy.formSubtitle}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Settlement Method Toggle */}
                    <div>
                        <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-2">Payout Method</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { setSettlementMethod('bank'); resetForm() }}
                                className={`p-4 rounded-lg border text-left transition-all ${
                                    settlementMethod === 'bank'
                                        ? 'border-amber-700 bg-amber-950/20'
                                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                                }`}
                            >
                                <Building2 className={`h-5 w-5 mb-2 ${settlementMethod === 'bank' ? 'text-amber-500' : 'text-zinc-500'}`} />
                                <p className={`font-mono text-sm font-bold ${settlementMethod === 'bank' ? 'text-white' : 'text-zinc-400'}`}>
                                    Bank Account
                                </p>
                                <p className="text-[10px] text-zinc-600 font-mono mt-1">Receive to your GHS bank account</p>
                            </button>
                            <button
                                onClick={() => { setSettlementMethod('mobile_money'); resetForm() }}
                                className={`p-4 rounded-lg border text-left transition-all ${
                                    settlementMethod === 'mobile_money'
                                        ? 'border-amber-700 bg-amber-950/20'
                                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                                }`}
                            >
                                <Smartphone className={`h-5 w-5 mb-2 ${settlementMethod === 'mobile_money' ? 'text-amber-500' : 'text-zinc-500'}`} />
                                <p className={`font-mono text-sm font-bold ${settlementMethod === 'mobile_money' ? 'text-white' : 'text-zinc-400'}`}>
                                    Mobile Money
                                </p>
                                <p className="text-[10px] text-zinc-600 font-mono mt-1">MTN, Vodafone, or AirtelTigo</p>
                            </button>
                        </div>
                    </div>

                    {/* Bank Account Form */}
                    {settlementMethod === 'bank' && (
                        <div className="space-y-4 animate-in fade-in">
                            <div>
                                <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">Bank *</label>
                                {banksLoading ? (
                                    <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono py-2">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Loading banks...
                                    </div>
                                ) : (
                                    <Select value={bankCode} onValueChange={(v) => { setBankCode(v); setResolvedName(null); setResolveError(null) }}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono text-sm h-10">
                                            <SelectValue placeholder="Select your bank" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white font-mono text-sm max-h-60">
                                            {banks.map(bank => (
                                                <SelectItem key={`bank-${bank.id}`} value={bank.code}>{bank.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">Account Number *</label>
                                <input
                                    type="text"
                                    value={accountNumber}
                                    onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, '')); setResolvedName(null); setResolveError(null) }}
                                    placeholder="Enter account number"
                                    maxLength={16}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-white font-mono text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Mobile Money Form */}
                    {settlementMethod === 'mobile_money' && (
                        <div className="space-y-4 animate-in fade-in">
                            <div>
                                <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">Provider *</label>
                                <Select value={momoProvider} onValueChange={(v) => { setMomoProvider(v); setResolvedName(null); setResolveError(null) }}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono text-sm h-10">
                                        <SelectValue placeholder="Select provider" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white font-mono text-sm">
                                        {(momoProviders.length > 0 ? momoProviders : MOMO_PROVIDERS_FALLBACK.map(p => ({ ...p, id: 0, slug: p.code, active: true, country: 'ghana', currency: 'GHS', type: 'mobile_money' }))).map(p => (
                                            <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">Phone Number *</label>
                                <input
                                    type="tel"
                                    value={momoNumber}
                                    onChange={(e) => { setMomoNumber(e.target.value.replace(/\D/g, '')); setResolvedName(null); setResolveError(null) }}
                                    placeholder="024 XXX XXXX"
                                    maxLength={10}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-white font-mono text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Verify Button — always visible when form has fields, disabled until ready */}
                    {!resolvedName && (
                        <div className="space-y-3">
                            <Button
                                onClick={handleResolve}
                                disabled={
                                    resolving ||
                                    (settlementMethod === 'bank' && (!bankCode || accountNumber.length < 10)) ||
                                    (settlementMethod === 'mobile_money' && (!momoProvider || momoNumber.length < 10))
                                }
                                className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-mono text-xs uppercase font-bold"
                            >
                                {resolving ? (
                                    <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Verifying...</>
                                ) : (
                                    <><Shield className="h-3 w-3 mr-2" /> Verify &amp; Continue</>
                                )}
                            </Button>
                            {account?.configured && (
                                <Button
                                    variant="outline"
                                    onClick={() => { setIsEditing(false); resetForm() }}
                                    className="w-full border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs uppercase"
                                >
                                    Cancel
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Resolve Error */}
                    {resolveError && (
                        <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-800 rounded-lg">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                            <p className="text-red-400 text-xs font-mono">{resolveError}</p>
                        </div>
                    )}

                    {/* Resolved Name + Business Details */}
                    {resolvedName && (
                        <div className="space-y-4 animate-in fade-in">
                            <div className="flex items-center gap-2 p-3 bg-green-950/30 border border-green-800 rounded-lg">
                                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                <div>
                                    <p className="text-green-400 text-sm font-mono font-bold">{resolvedName}</p>
                                    <p className="text-green-600 text-[10px] font-mono">Account verified successfully</p>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">Business / Property Name *</label>
                                <input
                                    type="text"
                                    value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)}
                                    placeholder="e.g. Sunrise Properties Ltd"
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-white font-mono text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">Contact Email (optional)</label>
                                <input
                                    type="email"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    placeholder="payments@yourcompany.com"
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-white font-mono text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                />
                            </div>

                            {/* Fee Info */}
                            <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">Platform Service Fee</p>
                                <p className="text-xs text-zinc-300 font-mono">
                                    PROPMETRIK charges <span className="text-amber-500 font-bold">max(1%, GHS 25.00)</span> {serviceCopy.feeNote}.
                                    {' '}{serviceCopy.feeDescription}
                                </p>
                                <p className="text-[10px] text-zinc-600 font-mono mt-2">
                                    {serviceCopy.feeExample}
                                </p>
                            </div>

                            {registerError && (
                                <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-800 rounded-lg">
                                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                    <p className="text-red-400 text-xs font-mono">{registerError}</p>
                                </div>
                            )}

                            {/* Action Buttons — always visible after verification */}
                            <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                                {account?.configured && (
                                    <Button
                                        variant="outline"
                                        onClick={() => { setIsEditing(false); resetForm() }}
                                        className="border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs uppercase flex-1"
                                    >
                                        Cancel
                                    </Button>
                                )}
                                <Button
                                    onClick={handleRegister}
                                    disabled={registering || !businessName.trim()}
                                    className="bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-mono text-xs uppercase font-bold flex-1 h-10"
                                >
                                    {registering ? (
                                        <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Saving...</>
                                    ) : (
                                        <><CheckCircle2 className="h-3 w-3 mr-2" /> {account?.configured ? 'Save Changes' : 'Save & Activate Payouts'}</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Security Note */}
            <div className="flex items-start gap-2 px-2">
                <Shield className="h-3.5 w-3.5 text-zinc-700 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">
                    Your account details are verified via Paystack and encrypted in transit. PROPMETRIK never stores your full account credentials.
                    Payments are processed securely through Paystack&apos;s PCI-DSS compliant infrastructure.
                </p>
            </div>

            {/* Crypto Wallet Section */}
            <CryptoWalletSettings serviceLabel={label} api={api} />
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════════════
// CRYPTO WALLET SETTINGS — Configure receiving wallet for multi-token payments
// ═══════════════════════════════════════════════════════════════════════

/** Payout coins grouped by category for the dropdown */
const PAYOUT_COINS = [
    // On-chain (Polygon) — settled via smart contract
    { symbol: 'usdt', name: 'USDT (Tether)', chain: 'polygon', category: 'On-Chain (Polygon)', color: 'text-green-400', bg: 'bg-green-900/30', placeholder: '0x...', isEvm: true },
    { symbol: 'usdc', name: 'USDC (USD Coin)', chain: 'polygon', category: 'On-Chain (Polygon)', color: 'text-blue-400', bg: 'bg-blue-900/30', placeholder: '0x...', isEvm: true },
    { symbol: 'weth', name: 'WETH (Wrapped Ether)', chain: 'polygon', category: 'On-Chain (Polygon)', color: 'text-purple-400', bg: 'bg-purple-900/30', placeholder: '0x...', isEvm: true },
    { symbol: 'wbtc', name: 'WBTC (Wrapped Bitcoin)', chain: 'polygon', category: 'On-Chain (Polygon)', color: 'text-orange-400', bg: 'bg-orange-900/30', placeholder: '0x...', isEvm: true },
    { symbol: 'matic', name: 'POL (Polygon)', chain: 'polygon', category: 'On-Chain (Polygon)', color: 'text-purple-400', bg: 'bg-purple-900/30', placeholder: '0x...', isEvm: true },
    // Off-chain — settled via NOWPayments
    { symbol: 'btc', name: 'BTC (Bitcoin)', chain: 'bitcoin', category: 'Off-Chain (via NOWPayments)', color: 'text-orange-400', bg: 'bg-orange-900/30', placeholder: 'bc1q... or 1... or 3...', isEvm: false },
    { symbol: 'eth', name: 'ETH (Ethereum L1)', chain: 'ethereum', category: 'Off-Chain (via NOWPayments)', color: 'text-blue-300', bg: 'bg-blue-900/30', placeholder: '0x...', isEvm: false },
    { symbol: 'sol', name: 'SOL (Solana)', chain: 'solana', category: 'Off-Chain (via NOWPayments)', color: 'text-cyan-400', bg: 'bg-cyan-900/30', placeholder: 'Base58 address', isEvm: false },
    { symbol: 'ltc', name: 'LTC (Litecoin)', chain: 'litecoin', category: 'Off-Chain (via NOWPayments)', color: 'text-gray-400', bg: 'bg-gray-900/30', placeholder: 'L... or ltc1...', isEvm: false },
    { symbol: 'trx', name: 'TRX (Tron)', chain: 'tron', category: 'Off-Chain (via NOWPayments)', color: 'text-red-400', bg: 'bg-red-900/30', placeholder: 'T...', isEvm: false },
    { symbol: 'bnb', name: 'BNB (BSC)', chain: 'bsc', category: 'Off-Chain (via NOWPayments)', color: 'text-yellow-400', bg: 'bg-yellow-900/30', placeholder: '0x...', isEvm: false },
    { symbol: 'usdt', name: 'USDT (ERC-20)', chain: 'ethereum', category: 'Off-Chain (via NOWPayments)', color: 'text-green-400', bg: 'bg-green-900/30', placeholder: '0x...', isEvm: false },
    { symbol: 'usdt', name: 'USDT (TRC-20)', chain: 'tron', category: 'Off-Chain (via NOWPayments)', color: 'text-green-400', bg: 'bg-green-900/30', placeholder: 'T...', isEvm: false },
] as const

function CryptoWalletSettings({ serviceLabel, api }: { serviceLabel: string; api: PaymentConfigApiShape }) {
    const [walletAddress, setWalletAddress] = useState('')
    const [selectedCoinKey, setSelectedCoinKey] = useState('') // format: "symbol:chain"
    const [currentWallet, setCurrentWallet] = useState<{
        walletAddress: string
        isVerified: boolean
        registeredAt: string | null
        payoutCoin?: string
        payoutChain?: string
        useNowPayments?: boolean
    } | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [copied, setCopied] = useState(false)

    const selectedCoin = PAYOUT_COINS.find(c => `${c.symbol}:${c.chain}` === selectedCoinKey) || null

    // Load existing wallet config via the service's own API
    useEffect(() => {
        const load = async () => {
            try {
                if (!api.getCryptoWallet) {
                    setLoading(false)
                    return
                }
                const wallet = await api.getCryptoWallet()
                if (wallet.configured) {
                    setCurrentWallet({
                        walletAddress: wallet.payoutWalletAddress || wallet.walletAddress,
                        isVerified: wallet.isVerified,
                        registeredAt: wallet.registeredAt,
                        payoutCoin: wallet.payoutCoin,
                        payoutChain: wallet.payoutChain,
                        useNowPayments: wallet.useNowPayments,
                    })
                }
            } catch {
                // Endpoint may not exist yet — show setup form
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [api])

    const handleSave = async () => {
        setError(null)

        if (!selectedCoin) {
            setError('Please select a payout currency')
            return
        }

        if (!walletAddress) {
            setError('Please enter your wallet address')
            return
        }

        if (!api.saveCryptoWallet) {
            setError('Crypto wallet configuration is not available for this service')
            return
        }

        setSaving(true)
        try {
            const result = await api.saveCryptoWallet(walletAddress, selectedCoin.symbol, selectedCoin.chain)
            setCurrentWallet({
                walletAddress: result.walletAddress,
                isVerified: result.isVerified,
                registeredAt: result.registeredAt,
                payoutCoin: result.payoutCoin,
                payoutChain: result.payoutChain,
                useNowPayments: result.useNowPayments,
            })
            setSuccess(true)
            setIsEditing(false)
            setWalletAddress('')
            setSelectedCoinKey('')
        } catch (err: any) {
            setError(err.message || 'Failed to save wallet configuration')
        } finally {
            setSaving(false)
        }
    }

    const shortAddr = (addr: string) => {
        if (addr.length <= 14) return addr
        return `${addr.slice(0, 8)}...${addr.slice(-6)}`
    }

    const copyAddress = () => {
        if (currentWallet?.walletAddress) {
            navigator.clipboard.writeText(currentWallet.walletAddress)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    if (loading) {
        return (
            <div className="mt-6 flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            </div>
        )
    }

    // Service-specific copy
    const paymentNoun = serviceLabel === 'Deal Management' ? 'deal payouts'
        : serviceLabel === 'Project Management' ? 'project payments'
        : 'rent payments'
    const payerNoun = serviceLabel === 'Deal Management' ? 'buyers'
        : serviceLabel === 'Project Management' ? 'clients'
        : 'tenants'

    const displayCoin = currentWallet?.payoutCoin
        ? PAYOUT_COINS.find(c => c.symbol === currentWallet.payoutCoin && c.chain === currentWallet.payoutChain)
        : null

    const explorerUrl = (addr: string, chain?: string) => {
        switch (chain) {
            case 'polygon': return `https://polygonscan.com/address/${addr}`
            case 'ethereum': return `https://etherscan.io/address/${addr}`
            case 'bitcoin': return `https://mempool.space/address/${addr}`
            case 'solana': return `https://solscan.io/account/${addr}`
            case 'bsc': return `https://bscscan.com/address/${addr}`
            case 'tron': return `https://tronscan.org/#/address/${addr}`
            case 'litecoin': return `https://blockchair.com/litecoin/address/${addr}`
            default: return `https://polygonscan.com/address/${addr}`
        }
    }

    // Configured view — show the wallet card
    if (currentWallet && !isEditing) {
        return (
            <div className="space-y-3 mt-6">
                {success && (
                    <div className="flex items-center gap-2 p-3 bg-green-950/30 border border-green-800 rounded-lg">
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <p className="text-green-400 text-sm font-mono">Crypto payout wallet saved successfully.</p>
                    </div>
                )}

                <Card className="bg-black border border-zinc-800">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-mono uppercase tracking-wider text-purple-500 flex items-center gap-2">
                                    <Wallet className="h-4 w-4" />
                                    Crypto Payout Wallet
                                </CardTitle>
                                <CardDescription className="text-zinc-500 font-mono text-xs mt-1">
                                    Receive {paymentNoun} in {displayCoin?.name || currentWallet.payoutCoin?.toUpperCase() || 'crypto'}
                                </CardDescription>
                            </div>
                            <Badge
                                variant="outline"
                                className={`font-mono text-[10px] uppercase ${
                                    currentWallet.useNowPayments
                                        ? 'border-purple-800 text-purple-400 bg-purple-900/20'
                                        : currentWallet.isVerified
                                        ? 'border-green-800 text-green-400 bg-green-900/20'
                                        : 'border-yellow-800 text-yellow-400 bg-yellow-900/20'
                                }`}
                            >
                                <Shield className="h-3 w-3 mr-1" />
                                {currentWallet.useNowPayments ? 'NOWPayments' : currentWallet.isVerified ? 'On-Chain Verified' : 'Pending'}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Payout Currency</p>
                                {displayCoin ? (
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded ${displayCoin.bg} ${displayCoin.color} font-mono text-xs font-bold`}>
                                            {displayCoin.symbol.toUpperCase()}
                                        </span>
                                        <span className="text-xs text-zinc-400 font-mono">{displayCoin.chain}</span>
                                    </div>
                                ) : (
                                    <p className="text-sm text-white font-mono">{currentWallet.payoutCoin?.toUpperCase() || 'USDT'} on {currentWallet.payoutChain || 'polygon'}</p>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Settlement</p>
                                <p className="text-xs text-zinc-300 font-mono">
                                    {currentWallet.useNowPayments
                                        ? 'Via NOWPayments (auto-converted)'
                                        : 'Direct on-chain (smart contract)'}
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Wallet Address</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-white font-mono">{shortAddr(currentWallet.walletAddress)}</p>
                                    <button onClick={copyAddress} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                                        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                    <a
                                        href={explorerUrl(currentWallet.walletAddress, currentWallet.payoutChain)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-zinc-600 hover:text-purple-400 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                        {currentWallet.registeredAt && (
                            <div>
                                <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Configured</p>
                                <p className="text-xs text-zinc-300 font-mono">
                                    {new Date(currentWallet.registeredAt).toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                            <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-mono">
                                <Info className="h-3 w-3" />
                                {currentWallet.useNowPayments
                                    ? `Payers send any crypto → NOWPayments converts → you receive ${currentWallet.payoutCoin?.toUpperCase()}`
                                    : `Payers on Polygon pay directly via smart contract → you receive ${currentWallet.payoutCoin?.toUpperCase()}`}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setIsEditing(true)
                                    setWalletAddress(currentWallet.walletAddress)
                                    if (currentWallet.payoutCoin && currentWallet.payoutChain) {
                                        setSelectedCoinKey(`${currentWallet.payoutCoin}:${currentWallet.payoutChain}`)
                                    }
                                    setSuccess(false)
                                }}
                                className="border-zinc-800 text-zinc-400 hover:text-purple-500 hover:border-purple-900 font-mono text-[10px] uppercase"
                            >
                                <RefreshCw className="h-3 w-3 mr-1" /> Change
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Setup / Edit form
    return (
        <div className="space-y-3 mt-6">
            <Card className="bg-black border border-zinc-800">
                <CardHeader>
                    <CardTitle className="text-sm font-mono uppercase tracking-wider text-purple-500 flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        {currentWallet ? 'Update Crypto Payout' : 'Configure Crypto Payout'}
                    </CardTitle>
                    <CardDescription className="text-zinc-500 font-mono text-xs">
                        Choose your payout currency and enter your wallet address
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Info Banner */}
                    {!currentWallet && (
                        <div className="p-3 bg-purple-950/20 border border-purple-900/50 rounded-lg">
                            <p className="text-purple-400 font-mono text-xs">
                                <Wallet className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                                Select which currency you want to receive {paymentNoun} in. {payerNoun.charAt(0).toUpperCase() + payerNoun.slice(1)} can pay with any coin — it will be auto-converted to your chosen currency.
                            </p>
                        </div>
                    )}

                    {/* Step 1: Payout Currency Dropdown */}
                    <div>
                        <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">
                            1. Payout Currency *
                        </label>
                        <Select
                            value={selectedCoinKey}
                            onValueChange={(val) => {
                                setSelectedCoinKey(val)
                                setWalletAddress('')
                                setError(null)
                            }}
                        >
                            <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono text-sm h-11">
                                <SelectValue placeholder="Select your payout currency..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                {/* On-Chain group */}
                                <div className="px-2 py-1.5">
                                    <p className="text-[9px] text-purple-500 font-mono uppercase font-bold tracking-wider">On-Chain (Polygon) — Direct Smart Contract</p>
                                </div>
                                {PAYOUT_COINS.filter(c => c.isEvm).map(c => (
                                    <SelectItem
                                        key={`${c.symbol}:${c.chain}`}
                                        value={`${c.symbol}:${c.chain}`}
                                        className="text-white font-mono text-sm"
                                    >
                                        <span className={c.color}>{c.symbol.toUpperCase()}</span>
                                        <span className="text-zinc-500 ml-2">{c.name}</span>
                                    </SelectItem>
                                ))}
                                {/* Off-Chain group */}
                                <div className="px-2 py-1.5 mt-1 border-t border-zinc-800">
                                    <p className="text-[9px] text-amber-500 font-mono uppercase font-bold tracking-wider">Off-Chain — Via NOWPayments</p>
                                </div>
                                {PAYOUT_COINS.filter(c => !c.isEvm).map(c => (
                                    <SelectItem
                                        key={`${c.symbol}:${c.chain}`}
                                        value={`${c.symbol}:${c.chain}`}
                                        className="text-white font-mono text-sm"
                                    >
                                        <span className={c.color}>{c.symbol.toUpperCase()}</span>
                                        <span className="text-zinc-500 ml-2">{c.name}</span>
                                        <span className="text-zinc-700 ml-1 text-[10px]">({c.chain})</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedCoin && (
                            <p className={`text-[10px] font-mono mt-1 ${selectedCoin.isEvm ? 'text-purple-500' : 'text-amber-500'}`}>
                                {selectedCoin.isEvm
                                    ? '✓ Settled directly via PROPMETRIK smart contract on Polygon — no intermediary'
                                    : '✓ Settled via NOWPayments — payers\' crypto is auto-converted to ' + selectedCoin.symbol.toUpperCase()}
                            </p>
                        )}
                    </div>

                    {/* Step 2: Wallet Address (shown after currency selection) */}
                    {selectedCoin && (
                        <div>
                            <label className="text-[10px] text-zinc-500 font-mono uppercase block mb-1.5">
                                2. Your {selectedCoin.symbol.toUpperCase()} Wallet Address ({selectedCoin.chain}) *
                            </label>
                            <input
                                type="text"
                                value={walletAddress}
                                onChange={(e) => { setWalletAddress(e.target.value.trim()); setError(null) }}
                                placeholder={selectedCoin.placeholder}
                                className={`w-full px-3 py-2.5 bg-zinc-900 border rounded-md text-white font-mono text-sm focus:ring-1 outline-none transition-colors ${
                                    error
                                        ? 'border-red-700 focus:ring-red-500 focus:border-red-500'
                                        : walletAddress
                                        ? 'border-green-700 focus:ring-green-500 focus:border-green-500'
                                        : 'border-zinc-800 focus:ring-purple-500 focus:border-purple-500'
                                }`}
                            />
                            {walletAddress && (
                                <p className="text-[10px] text-zinc-600 font-mono mt-1">
                                    Address will be validated on save by the server
                                </p>
                            )}
                        </div>
                    )}

                    {/* How it works */}
                    {selectedCoin && (
                        <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">How It Works</p>
                            {selectedCoin.isEvm ? (
                                <div className="space-y-1.5 text-[10px] text-zinc-400 font-mono">
                                    <p>1. {payerNoun.charAt(0).toUpperCase() + payerNoun.slice(1)} pay using any ERC-20 token on Polygon</p>
                                    <p>2. PROPMETRIK smart contract swaps to {selectedCoin.symbol.toUpperCase()} via QuickSwap</p>
                                    <p>3. {selectedCoin.symbol.toUpperCase()} arrives directly in your wallet — atomically, no custody</p>
                                </div>
                            ) : (
                                <div className="space-y-1.5 text-[10px] text-zinc-400 font-mono">
                                    <p>1. {payerNoun.charAt(0).toUpperCase() + payerNoun.slice(1)} pay using any cryptocurrency on any chain</p>
                                    <p>2. NOWPayments receives &amp; auto-converts to {selectedCoin.symbol.toUpperCase()}</p>
                                    <p>3. {selectedCoin.symbol.toUpperCase()} is sent to your {selectedCoin.chain} wallet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-800 rounded-lg">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                            <p className="text-red-400 text-xs font-mono">{error}</p>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                        {currentWallet && (
                            <Button
                                variant="outline"
                                onClick={() => { setIsEditing(false); setWalletAddress(''); setSelectedCoinKey(''); setError(null) }}
                                className="border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs uppercase flex-1"
                            >
                                Cancel
                            </Button>
                        )}
                        <Button
                            onClick={handleSave}
                            disabled={saving || !walletAddress || !selectedCoin}
                            className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-mono text-xs uppercase font-bold flex-1 h-10"
                        >
                            {saving ? (
                                <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Saving...</>
                            ) : (
                                <><Wallet className="h-3 w-3 mr-2" /> {currentWallet ? 'Update Payout' : 'Save Payout'}</>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Security Note */}
            <div className="flex items-start gap-2 px-2">
                <Shield className="h-3.5 w-3.5 text-zinc-700 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">
                    On-chain Polygon tokens (USDT, USDC, WETH, WBTC) settle atomically via the PROPMETRIK smart contract — no funds held by platform.
                    Off-chain coins (BTC, ETH, SOL, etc.) are auto-converted and settled through NOWPayments to your chosen wallet.
                </p>
            </div>
        </div>
    )
}
