'use client'

import { useState, useEffect } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import {
    Settings,
    Save,
    Shield,
    Banknote,
    FileText,
    Globe,
    Bell,
    Building2,
    Loader2,
    Check,
    RotateCcw,
    Palette,
    Key,
    GitBranch,
    Plus,
    Trash2,
    Copy,
    RotateCw,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

function getHeaders() {
    return {
        'Content-Type': 'application/json',
    }
}

async function apiFetch(path: string, opts: RequestInit = {}) {
    const res = await authedFetch(`${API_BASE}/enterprise${path}`, { ...opts, headers: { ...getHeaders(), ...opts.headers as any } })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return res.json()
}

interface ApiKey {
    id: string; name: string; key_prefix: string; key?: string; scopes: string[];
    rate_limit_per_minute: number; rate_limit_per_day: number; is_active: boolean;
    last_used_at: string | null; usage_count: number; created_at: string; revoked_at: string | null;
}

interface ApprovalChain {
    id: string; name: string; description: string; entity_type: string; is_active: boolean;
    steps: { id: string; step_order: number; name: string; required_role: string; min_approvers: number; auto_escalate_hours?: number; instructions?: string }[];
}

interface OrgBranding {
    name: string; logo_url: string; primary_color: string; secondary_color: string; accent_color: string; font_family: string;
    professional_body: string; license_number: string; license_expiry: string;
    phone: string; website: string; tax_id: string;
    address_line1: string; city: string; region: string; country: string;
}

export default function SettingsPage() {
    const [mounted, setMounted] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [activeSection, setActiveSection] = useState('general')

    const SETTINGS_KEY = 'propmetrik_valuation_settings'

    const defaultSettings = {
        // General
        companyName: 'PROPMETRIK Valuations',
        ghisRegistration: 'GhIS/REG/2024/001',
        tinNumber: 'C0012345678',
        companyAddress: 'No. 15 Independence Avenue, Accra',
        companyPhone: '+233 30 277 1234',
        companyEmail: 'valuations@propmetrik.com',

        // Fee defaults
        defaultFeeModel: 'percentage_of_value',
        percentageRate: '0.5',
        minimumFee: '500',
        vatRate: '15',
        nhilRate: '2.5',
        getfundRate: '2.5',
        covidLevyRate: '1',

        // Report settings
        defaultCurrency: 'GHS',
        reportLanguage: 'en',
        includePhotos: true,
        includeMarketData: true,
        includeComps: true,
        autoSaveInterval: '5',

        // Notifications
        emailOnNewValuation: true,
        emailOnCompletion: true,
        emailOnPayment: true,
        reminderDays: '3',
    }

    // Settings state
    const [settings, setSettings] = useState(defaultSettings)

    useEffect(() => {
        setMounted(true)
        const stored = localStorage.getItem(SETTINGS_KEY)
        if (stored) {
            try { setSettings({ ...defaultSettings, ...JSON.parse(stored) }) } catch { /* use defaults */ }
        }
    }, [])

    const handleSave = async () => {
        setSaving(true)
        await new Promise(resolve => setTimeout(resolve, 400))
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
    }

    const sections = [
        { id: 'general', label: 'GENERAL', icon: Building2 },
        { id: 'branding', label: 'BRANDING', icon: Palette },
        { id: 'fees', label: 'FEE DEFAULTS', icon: Banknote },
        { id: 'reports', label: 'REPORTS', icon: FileText },
        { id: 'approvals', label: 'APPROVALS', icon: GitBranch },
        { id: 'api-keys', label: 'API KEYS', icon: Key },
        { id: 'notifications', label: 'NOTIFICATIONS', icon: Bell },
    ]

    // Enterprise state
    const [orgBranding, setOrgBranding] = useState<OrgBranding | null>(null)
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [approvalChains, setApprovalChains] = useState<ApprovalChain[]>([])
    const [newKeyName, setNewKeyName] = useState('')
    const [newKeyVisible, setNewKeyVisible] = useState<string | null>(null)
    const [chainExpanded, setChainExpanded] = useState<string | null>(null)
    const [showNewChain, setShowNewChain] = useState(false)
    const [newChain, setNewChain] = useState({ name: '', description: '', steps: [{ step_order: 1, name: 'Review', required_role: 'senior_valuer', min_approvers: 1 }] })

    // Load enterprise data on section change
    useEffect(() => {
        if (!mounted) return
        if (activeSection === 'branding' && !orgBranding) {
            apiFetch('/settings').then(setOrgBranding).catch(() => {})
        }
        if (activeSection === 'api-keys' && apiKeys.length === 0) {
            apiFetch('/api-keys').then(setApiKeys).catch(() => setApiKeys([]))
        }
        if (activeSection === 'approvals' && approvalChains.length === 0) {
            apiFetch('/approval-chains').then(setApprovalChains).catch(() => setApprovalChains([]))
        }
    }, [activeSection, mounted])

    const saveBranding = async () => {
        if (!orgBranding) return
        setSaving(true)
        try {
            const updated = await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(orgBranding) })
            setOrgBranding(updated)
            setSaved(true); setTimeout(() => setSaved(false), 2500)
        } catch { /* handled */ }
        setSaving(false)
    }

    const createKey = async () => {
        if (!newKeyName.trim()) return
        try {
            const key = await apiFetch('/api-keys', { method: 'POST', body: JSON.stringify({ name: newKeyName, scopes: ['read', 'write'] }) })
            setApiKeys(prev => [key, ...prev])
            setNewKeyVisible(key.key)
            setNewKeyName('')
        } catch { /* handled */ }
    }

    const revokeKey = async (id: string) => {
        try {
            await apiFetch(`/api-keys/${id}`, { method: 'DELETE' })
            setApiKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false, revoked_at: new Date().toISOString() } : k))
        } catch { /* handled */ }
    }

    const createChain = async () => {
        try {
            const chain = await apiFetch('/approval-chains', { method: 'POST', body: JSON.stringify(newChain) })
            setApprovalChains(prev => [...prev, chain])
            setShowNewChain(false)
            setNewChain({ name: '', description: '', steps: [{ step_order: 1, name: 'Review', required_role: 'senior_valuer', min_approvers: 1 }] })
        } catch { /* handled */ }
    }

    const deleteChain = async (id: string) => {
        try {
            await apiFetch(`/approval-chains/${id}`, { method: 'DELETE' })
            setApprovalChains(prev => prev.filter(c => c.id !== id))
        } catch { /* handled */ }
    }

    const InputField = ({ label, value, onChange, type = 'text', suffix }: {
        label: string; value: string; onChange: (v: string) => void; type?: string; suffix?: string
    }) => (
        <div>
            <label className="font-mono text-[10px] text-zinc-500 block mb-1">{label}</label>
            <div className="relative">
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                />
                {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-zinc-500">{suffix}</span>
                )}
            </div>
        </div>
    )

    const Toggle = ({ label, description, checked, onChange }: {
        label: string; description?: string; checked: boolean; onChange: (v: boolean) => void
    }) => (
        <div className="flex items-center justify-between py-2">
            <div>
                <div className="font-mono text-xs text-white">{label}</div>
                {description && <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{description}</div>}
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-amber-500' : 'bg-zinc-700'
                    }`}
            >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${checked ? 'left-5' : 'left-0.5'
                    }`} />
            </button>
        </div>
    )

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="font-mono text-xl text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-amber-500" />
                        VALUATION SETTINGS
                    </h1>
                    <p className="font-mono text-[10px] text-zinc-500 mt-1">
                        Organization configuration • Fee defaults • Report preferences
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {saved && (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                            <Check className="w-3 h-3" /> Settings saved
                        </span>
                    )}
                    <button
                        onClick={() => { setSettings(defaultSettings); localStorage.removeItem(SETTINGS_KEY) }}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
                    >
                        <RotateCcw className="w-3 h-3" />
                        RESET
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        {saving ? 'SAVING...' : 'SAVE CHANGES'}
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar */}
                <div className="w-full lg:w-48 lg:shrink-0">
                    <div className="space-y-1">
                        {sections.map((s) => {
                            const Icon = s.icon
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 font-mono text-xs text-left transition-colors ${activeSection === s.id
                                            ? 'text-amber-500 bg-amber-500/10 border-l-2 border-amber-500'
                                            : 'text-zinc-400 hover:text-white border-l-2 border-transparent'
                                        }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {s.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 max-w-2xl">
                    {activeSection === 'general' && (
                        <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-4">
                            <div className="font-mono text-sm text-white mb-4 flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-amber-500" />
                                COMPANY INFORMATION
                            </div>
                            <InputField label="COMPANY NAME" value={settings.companyName} onChange={(v) => setSettings({ ...settings, companyName: v })} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="GhIS REGISTRATION" value={settings.ghisRegistration} onChange={(v) => setSettings({ ...settings, ghisRegistration: v })} />
                                <InputField label="TIN NUMBER" value={settings.tinNumber} onChange={(v) => setSettings({ ...settings, tinNumber: v })} />
                            </div>
                            <InputField label="ADDRESS" value={settings.companyAddress} onChange={(v) => setSettings({ ...settings, companyAddress: v })} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="PHONE" value={settings.companyPhone} onChange={(v) => setSettings({ ...settings, companyPhone: v })} />
                                <InputField label="EMAIL" value={settings.companyEmail} onChange={(v) => setSettings({ ...settings, companyEmail: v })} />
                            </div>
                        </div>
                    )}

                    {activeSection === 'fees' && (
                        <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-4">
                            <div className="font-mono text-sm text-white mb-4 flex items-center gap-2">
                                <Banknote className="w-4 h-4 text-amber-500" />
                                FEE & TAX CONFIGURATION
                            </div>
                            <div>
                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">DEFAULT FEE MODEL</label>
                                <select
                                    value={settings.defaultFeeModel}
                                    onChange={(e) => setSettings({ ...settings, defaultFeeModel: e.target.value })}
                                    className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                >
                                    <option value="percentage_of_value">Percentage of Value (GhIS)</option>
                                    <option value="man_day_rate">Man-Day Rate (MWH 2021)</option>
                                    <option value="flat_fee">Flat Fee</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="PERCENTAGE RATE" value={settings.percentageRate} type="number" suffix="%" onChange={(v) => setSettings({ ...settings, percentageRate: v })} />
                                <InputField label="MINIMUM FEE (GHS)" value={settings.minimumFee} type="number" onChange={(v) => setSettings({ ...settings, minimumFee: v })} />
                            </div>
                            <div className="font-mono text-[10px] text-zinc-500 mt-4 mb-2">GHANA TAX RATES</div>
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="VAT" value={settings.vatRate} type="number" suffix="%" onChange={(v) => setSettings({ ...settings, vatRate: v })} />
                                <InputField label="NHIL" value={settings.nhilRate} type="number" suffix="%" onChange={(v) => setSettings({ ...settings, nhilRate: v })} />
                                <InputField label="GETFund LEVY" value={settings.getfundRate} type="number" suffix="%" onChange={(v) => setSettings({ ...settings, getfundRate: v })} />
                                <InputField label="COVID LEVY" value={settings.covidLevyRate} type="number" suffix="%" onChange={(v) => setSettings({ ...settings, covidLevyRate: v })} />
                            </div>
                        </div>
                    )}

                    {activeSection === 'reports' && (
                        <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-4">
                            <div className="font-mono text-sm text-white mb-4 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-amber-500" />
                                REPORT DEFAULTS
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">DEFAULT CURRENCY</label>
                                    <select
                                        value={settings.defaultCurrency}
                                        onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value })}
                                        className="w-full px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50"
                                    >
                                        <option value="GHS">GHS — Ghana Cedi</option>
                                        <option value="USD">USD — US Dollar</option>
                                    </select>
                                </div>
                                <InputField label="AUTO-SAVE INTERVAL" value={settings.autoSaveInterval} type="number" suffix="min" onChange={(v) => setSettings({ ...settings, autoSaveInterval: v })} />
                            </div>
                            <div className="border-t border-zinc-800 pt-4 space-y-2">
                                <Toggle label="Include photographs" description="Auto-include property photos in report" checked={settings.includePhotos} onChange={(v) => setSettings({ ...settings, includePhotos: v })} />
                                <Toggle label="Include market data" description="Include market analysis section" checked={settings.includeMarketData} onChange={(v) => setSettings({ ...settings, includeMarketData: v })} />
                                <Toggle label="Include comparables" description="Include comparable sales evidence" checked={settings.includeComps} onChange={(v) => setSettings({ ...settings, includeComps: v })} />
                            </div>
                        </div>
                    )}

                    {activeSection === 'notifications' && (
                        <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-4">
                            <div className="font-mono text-sm text-white mb-4 flex items-center gap-2">
                                <Bell className="w-4 h-4 text-amber-500" />
                                NOTIFICATION PREFERENCES
                            </div>
                            <div className="space-y-2">
                                <Toggle label="New valuation assigned" description="Email when a new valuation is created or assigned" checked={settings.emailOnNewValuation} onChange={(v) => setSettings({ ...settings, emailOnNewValuation: v })} />
                                <Toggle label="Valuation completed" description="Email when a valuation report is finalized" checked={settings.emailOnCompletion} onChange={(v) => setSettings({ ...settings, emailOnCompletion: v })} />
                                <Toggle label="Payment received" description="Email when an invoice payment is confirmed" checked={settings.emailOnPayment} onChange={(v) => setSettings({ ...settings, emailOnPayment: v })} />
                            </div>
                            <InputField label="PAYMENT REMINDER (DAYS BEFORE DUE)" value={settings.reminderDays} type="number" suffix="days" onChange={(v) => setSettings({ ...settings, reminderDays: v })} />
                        </div>
                    )}

                    {/* ═══ BRANDING (Enterprise) ═══ */}
                    {activeSection === 'branding' && (
                        <div className="space-y-4">
                            <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-4">
                                <div className="font-mono text-sm text-white mb-4 flex items-center gap-2">
                                    <Palette className="w-4 h-4 text-amber-500" />
                                    FIRM BRANDING & WHITE-LABEL
                                </div>
                                {orgBranding ? (
                                    <>
                                        <InputField label="FIRM NAME" value={orgBranding.name || ''} onChange={(v) => setOrgBranding({ ...orgBranding, name: v })} />
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">PRIMARY COLOR</label>
                                                <div className="flex items-center gap-2">
                                                    <input type="color" value={orgBranding.primary_color || '#f59e0b'} onChange={(e) => setOrgBranding({ ...orgBranding, primary_color: e.target.value })}
                                                        className="w-8 h-8 border border-zinc-700 bg-transparent cursor-pointer" />
                                                    <span className="font-mono text-xs text-zinc-400">{orgBranding.primary_color}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">SECONDARY COLOR</label>
                                                <div className="flex items-center gap-2">
                                                    <input type="color" value={orgBranding.secondary_color || '#000000'} onChange={(e) => setOrgBranding({ ...orgBranding, secondary_color: e.target.value })}
                                                        className="w-8 h-8 border border-zinc-700 bg-transparent cursor-pointer" />
                                                    <span className="font-mono text-xs text-zinc-400">{orgBranding.secondary_color}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="font-mono text-[10px] text-zinc-500 block mb-1">ACCENT COLOR</label>
                                                <div className="flex items-center gap-2">
                                                    <input type="color" value={orgBranding.accent_color || '#f59e0b'} onChange={(e) => setOrgBranding({ ...orgBranding, accent_color: e.target.value })}
                                                        className="w-8 h-8 border border-zinc-700 bg-transparent cursor-pointer" />
                                                    <span className="font-mono text-xs text-zinc-400">{orgBranding.accent_color}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <InputField label="FONT FAMILY" value={orgBranding.font_family || 'Inter'} onChange={(v) => setOrgBranding({ ...orgBranding, font_family: v })} />

                                        <div className="border-t border-zinc-800 pt-4 mt-4">
                                            <div className="font-mono text-[10px] text-zinc-500 mb-3">PROFESSIONAL CREDENTIALS</div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <InputField label="PROFESSIONAL BODY" value={orgBranding.professional_body || ''} onChange={(v) => setOrgBranding({ ...orgBranding, professional_body: v })} />
                                                <InputField label="LICENSE NUMBER" value={orgBranding.license_number || ''} onChange={(v) => setOrgBranding({ ...orgBranding, license_number: v })} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 mt-4">
                                                <InputField label="TAX ID / TIN" value={orgBranding.tax_id || ''} onChange={(v) => setOrgBranding({ ...orgBranding, tax_id: v })} />
                                                <InputField label="WEBSITE" value={orgBranding.website || ''} onChange={(v) => setOrgBranding({ ...orgBranding, website: v })} />
                                            </div>
                                        </div>

                                        <div className="border-t border-zinc-800 pt-4 mt-4">
                                            <div className="font-mono text-[10px] text-zinc-500 mb-3">OFFICE ADDRESS</div>
                                            <InputField label="ADDRESS" value={orgBranding.address_line1 || ''} onChange={(v) => setOrgBranding({ ...orgBranding, address_line1: v })} />
                                            <div className="grid grid-cols-3 gap-4 mt-4">
                                                <InputField label="CITY" value={orgBranding.city || ''} onChange={(v) => setOrgBranding({ ...orgBranding, city: v })} />
                                                <InputField label="REGION" value={orgBranding.region || ''} onChange={(v) => setOrgBranding({ ...orgBranding, region: v })} />
                                                <InputField label="COUNTRY" value={orgBranding.country || 'GH'} onChange={(v) => setOrgBranding({ ...orgBranding, country: v })} />
                                            </div>
                                        </div>

                                        <button onClick={saveBranding} disabled={saving}
                                            className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50">
                                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                            {saving ? 'SAVING...' : 'SAVE BRANDING'}
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                                        <span className="font-mono text-xs text-zinc-500 ml-2">Loading branding...</span>
                                    </div>
                                )}
                            </div>

                            {/* Preview */}
                            {orgBranding && (
                                <div className="bg-zinc-900 border border-zinc-800 p-6">
                                    <div className="font-mono text-[10px] text-zinc-500 mb-3">REPORT HEADER PREVIEW</div>
                                    <div className="border border-zinc-700 p-4 bg-white text-white">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-lg font-bold" style={{ color: orgBranding.primary_color }}>{orgBranding.name || 'Your Firm'}</div>
                                                <div className="text-xs text-gray-500">{orgBranding.professional_body} • License: {orgBranding.license_number}</div>
                                            </div>
                                            <div className="text-right text-xs text-gray-500">
                                                <div>{orgBranding.address_line1}</div>
                                                <div>{orgBranding.city}, {orgBranding.region}</div>
                                                <div>{orgBranding.phone}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ APPROVAL CHAINS (Enterprise) ═══ */}
                    {activeSection === 'approvals' && (
                        <div className="space-y-4">
                            <div className="bg-zinc-900 border border-zinc-800 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-mono text-sm text-white flex items-center gap-2">
                                        <GitBranch className="w-4 h-4 text-amber-500" />
                                        APPROVAL CHAINS
                                    </div>
                                    <button onClick={() => setShowNewChain(true)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white font-mono text-[10px] font-bold hover:bg-amber-400">
                                        <Plus className="w-3 h-3" /> NEW CHAIN
                                    </button>
                                </div>

                                <p className="font-mono text-[10px] text-zinc-500 mb-4">
                                    Configure multi-level approval workflows for valuation reports. Each chain defines the sequence of roles that must approve before a report is finalized.
                                </p>

                                {approvalChains.length === 0 ? (
                                    <div className="text-center py-8 border border-dashed border-zinc-700">
                                        <GitBranch className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                                        <p className="font-mono text-xs text-zinc-500">No approval chains configured</p>
                                        <p className="font-mono text-[10px] text-zinc-600 mt-1">Create one to require multi-level sign-off on reports</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {approvalChains.map(chain => (
                                            <div key={chain.id} className="border border-zinc-700 bg-black">
                                                <button
                                                    onClick={() => setChainExpanded(chainExpanded === chain.id ? null : chain.id)}
                                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${chain.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                                        <span className="font-mono text-xs text-white">{chain.name}</span>
                                                        <span className="font-mono text-[10px] text-zinc-500">{chain.steps?.length || 0} steps</span>
                                                    </div>
                                                    {chainExpanded === chain.id ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
                                                </button>
                                                {chainExpanded === chain.id && (
                                                    <div className="px-4 pb-4 border-t border-zinc-800">
                                                        {chain.description && <p className="font-mono text-[10px] text-zinc-500 mt-2 mb-3">{chain.description}</p>}
                                                        <div className="space-y-2">
                                                            {(chain.steps || []).map((step, i) => (
                                                                <div key={step.id} className="flex items-center gap-3">
                                                                    <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 font-mono text-[10px] flex items-center justify-center font-bold">{i + 1}</div>
                                                                    <div>
                                                                        <div className="font-mono text-xs text-white">{step.name}</div>
                                                                        <div className="font-mono text-[10px] text-zinc-500">Required: {step.required_role.replace(/_/g, ' ')} • {step.min_approvers} approver(s)</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <button onClick={() => deleteChain(chain.id)}
                                                            className="mt-3 flex items-center gap-1 px-2 py-1 text-red-400 hover:text-red-300 font-mono text-[10px]">
                                                            <Trash2 className="w-3 h-3" /> DELETE CHAIN
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* New chain form */}
                                {showNewChain && (
                                    <div className="mt-4 border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                                        <div className="font-mono text-[10px] text-amber-500">CREATE APPROVAL CHAIN</div>
                                        <InputField label="CHAIN NAME" value={newChain.name} onChange={(v) => setNewChain({ ...newChain, name: v })} />
                                        <InputField label="DESCRIPTION" value={newChain.description} onChange={(v) => setNewChain({ ...newChain, description: v })} />
                                        <div className="font-mono text-[10px] text-zinc-500 mt-2">STEPS</div>
                                        {newChain.steps.map((step, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="font-mono text-[10px] text-amber-500 w-4">{i + 1}.</span>
                                                <input value={step.name} onChange={(e) => { const s = [...newChain.steps]; s[i] = { ...s[i], name: e.target.value }; setNewChain({ ...newChain, steps: s }) }}
                                                    placeholder="Step name" className="flex-1 px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs" />
                                                <select value={step.required_role} onChange={(e) => { const s = [...newChain.steps]; s[i] = { ...s[i], required_role: e.target.value }; setNewChain({ ...newChain, steps: s }) }}
                                                    className="px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs">
                                                    <option value="senior_valuer">Senior Valuer</option>
                                                    <option value="manager">Manager</option>
                                                    <option value="firm_principal">Firm Principal</option>
                                                    <option value="compliance_officer">Compliance Officer</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                                {newChain.steps.length > 1 && (
                                                    <button onClick={() => setNewChain({ ...newChain, steps: newChain.steps.filter((_, j) => j !== i) })}
                                                        className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                                                )}
                                            </div>
                                        ))}
                                        <button onClick={() => setNewChain({ ...newChain, steps: [...newChain.steps, { step_order: newChain.steps.length + 1, name: '', required_role: 'manager', min_approvers: 1 }] })}
                                            className="font-mono text-[10px] text-amber-500 hover:text-amber-400 flex items-center gap-1"><Plus className="w-3 h-3" /> ADD STEP</button>
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={createChain} className="px-3 py-1.5 bg-amber-500 text-white font-mono text-[10px] font-bold hover:bg-amber-400">CREATE</button>
                                            <button onClick={() => setShowNewChain(false)} className="px-3 py-1.5 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white">CANCEL</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ═══ API KEYS (Enterprise) ═══ */}
                    {activeSection === 'api-keys' && (
                        <div className="space-y-4">
                            <div className="bg-zinc-900 border border-zinc-800 p-6">
                                <div className="font-mono text-sm text-white mb-4 flex items-center gap-2">
                                    <Key className="w-4 h-4 text-amber-500" />
                                    API KEY MANAGEMENT
                                </div>
                                <p className="font-mono text-[10px] text-zinc-500 mb-4">
                                    Create API keys for programmatic access to your organization&apos;s valuation data. Keys are shown once on creation — store them securely.
                                </p>

                                {/* Create key */}
                                <div className="flex gap-2 mb-4">
                                    <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name (e.g. Production API)"
                                        className="flex-1 px-3 py-2 bg-black border border-zinc-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500/50" />
                                    <button onClick={createKey} disabled={!newKeyName.trim()}
                                        className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 disabled:opacity-50">
                                        <Plus className="w-3 h-3" /> GENERATE
                                    </button>
                                </div>

                                {/* Newly created key display */}
                                {newKeyVisible && (
                                    <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30">
                                        <div className="flex items-center gap-2 mb-1">
                                            <AlertTriangle className="w-3 h-3 text-emerald-400" />
                                            <span className="font-mono text-[10px] text-emerald-400 font-bold">KEY CREATED — COPY NOW (shown once)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 font-mono text-xs text-white bg-black px-2 py-1 break-all">{newKeyVisible}</code>
                                            <button onClick={() => { navigator.clipboard.writeText(newKeyVisible); }}
                                                className="px-2 py-1 bg-zinc-800 text-zinc-400 hover:text-white"><Copy className="w-3 h-3" /></button>
                                        </div>
                                        <button onClick={() => setNewKeyVisible(null)} className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 mt-2">Dismiss</button>
                                    </div>
                                )}

                                {/* Key list */}
                                <div className="space-y-2">
                                    {apiKeys.map(key => (
                                        <div key={key.id} className={`flex items-center justify-between px-4 py-3 border ${key.is_active ? 'border-zinc-700 bg-black' : 'border-zinc-800 bg-zinc-900/50 opacity-60'}`}>
                                            <div>
                                                <div className="font-mono text-xs text-white">{key.name}</div>
                                                <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                                                    {key.key_prefix}••• • {key.scopes?.join(', ')} • {key.usage_count || 0} requests
                                                    {key.last_used_at && ` • Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {key.is_active ? (
                                                    <>
                                                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                                        <button onClick={() => revokeKey(key.id)} className="px-2 py-1 text-red-400 hover:text-red-300 font-mono text-[10px]">REVOKE</button>
                                                    </>
                                                ) : (
                                                    <span className="font-mono text-[10px] text-zinc-500">REVOKED</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {apiKeys.length === 0 && (
                                        <div className="text-center py-8 border border-dashed border-zinc-700">
                                            <Key className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                                            <p className="font-mono text-xs text-zinc-500">No API keys created yet</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
