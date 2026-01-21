'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { 
    ArrowLeft, 
    Save, 
    Loader2,
    User,
    Mail,
    Phone,
    MapPin,
    Briefcase,
    Award
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({ title, icon: Icon, children, className }: { 
    title: string; 
    icon?: React.ElementType;
    children: React.ReactNode; 
    className?: string;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                {Icon && <Icon className="w-4 h-4 text-amber-500" />}
                <span className="font-mono text-[10px] text-amber-500 tracking-wider uppercase">{title}</span>
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

const SPECIALIZATION_OPTIONS = [
    { value: 'residential_sales', label: 'Residential Sales' },
    { value: 'commercial_sales', label: 'Commercial Sales' },
    { value: 'residential_rentals', label: 'Residential Rentals' },
    { value: 'commercial_rentals', label: 'Commercial Rentals' },
    { value: 'land_sales', label: 'Land Sales' },
    { value: 'property_management', label: 'Property Management' },
    { value: 'investment_advisory', label: 'Investment Advisory' },
    { value: 'valuation', label: 'Valuation' },
    { value: 'general', label: 'General' }
]

const REGION_OPTIONS = [
    'Greater Accra',
    'Ashanti',
    'Western',
    'Eastern',
    'Central',
    'Northern',
    'Volta',
    'Upper East',
    'Upper West',
    'Bono',
    'Bono East',
    'Ahafo',
    'Savannah',
    'North East',
    'Oti',
    'Western North'
]

const LANGUAGE_OPTIONS = [
    'English',
    'Twi',
    'Ga',
    'Ewe',
    'Hausa',
    'Fante',
    'Dagbani',
    'French'
]

function parsePostgresArray(value: any): string[] {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
        if (value.startsWith('{') && value.endsWith('}')) {
            return value.slice(1, -1).split(',').filter(Boolean)
        }
        try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    return []
}

export default function EditAgentPage() {
    const params = useParams()
    const router = useRouter()
    const agentId = params.id as string

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        display_name: '',
        email: '',
        phone_primary: '',
        phone_secondary: '',
        whatsapp_number: '',
        license_number: '',
        license_expiry: '',
        ghana_real_estate_board_id: '',
        specializations: [] as string[],
        regions_covered: [] as string[],
        languages: [] as string[],
        years_experience: 0,
        bio: '',
        default_commission_rate: 3.0,
        commission_split_rate: 50.0,
        base_salary: '',
        status: 'active',
        hire_date: ''
    })

    useEffect(() => {
        fetchAgent()
    }, [agentId])

    const fetchAgent = async () => {
        try {
            const res = await fetch(`http://localhost:4000/api/v1/crm/agents/${agentId}`)
            if (!res.ok) throw new Error('Failed to fetch agent')
            const agent = await res.json()
            
            setFormData({
                first_name: agent.first_name || '',
                last_name: agent.last_name || '',
                display_name: agent.display_name || '',
                email: agent.email || '',
                phone_primary: agent.phone_primary || '',
                phone_secondary: agent.phone_secondary || '',
                whatsapp_number: agent.whatsapp_number || '',
                license_number: agent.license_number || '',
                license_expiry: agent.license_expiry?.split('T')[0] || '',
                ghana_real_estate_board_id: agent.ghana_real_estate_board_id || '',
                specializations: parsePostgresArray(agent.specializations),
                regions_covered: parsePostgresArray(agent.regions_covered),
                languages: parsePostgresArray(agent.languages),
                years_experience: agent.years_experience || 0,
                bio: agent.bio || '',
                default_commission_rate: agent.default_commission_rate || 3.0,
                commission_split_rate: agent.commission_split_rate || 50.0,
                base_salary: agent.base_salary?.toString() || '',
                status: agent.status || 'active',
                hire_date: agent.hire_date?.split('T')[0] || ''
            })
        } catch (err) {
            setError('Failed to load agent')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError(null)

        try {
            const payload = {
                ...formData,
                base_salary: formData.base_salary ? parseFloat(formData.base_salary) : null,
                years_experience: parseInt(formData.years_experience.toString()),
                default_commission_rate: parseFloat(formData.default_commission_rate.toString()),
                commission_split_rate: parseFloat(formData.commission_split_rate.toString()),
                license_expiry: formData.license_expiry || null,
                hire_date: formData.hire_date || null,
                phone_secondary: formData.phone_secondary || null,
                whatsapp_number: formData.whatsapp_number || null,
                license_number: formData.license_number || null,
                ghana_real_estate_board_id: formData.ghana_real_estate_board_id || null,
                bio: formData.bio || null
            }

            const res = await fetch(`http://localhost:4000/api/v1/crm/agents/${agentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to update agent')
            }

            router.push(`/dashboard/deals/agents/${agentId}`)
        } catch (err: any) {
            setError(err.message || 'Failed to update agent')
        } finally {
            setSaving(false)
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleMultiSelect = (field: 'specializations' | 'regions_covered' | 'languages', value: string) => {
        setFormData(prev => {
            const current = prev[field]
            if (current.includes(value)) {
                return { ...prev, [field]: current.filter(v => v !== value) }
            } else {
                return { ...prev, [field]: [...current, value] }
            }
        })
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link 
                        href={`/dashboard/deals/agents/${agentId}`}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-zinc-400" />
                    </Link>
                    <div>
                        <h1 className="font-mono text-xl font-bold text-white">EDIT AGENT</h1>
                        <p className="font-mono text-xs text-zinc-500">Update agent information</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={`/dashboard/deals/agents/${agentId}`}>
                        <Button variant="outline" className="font-mono text-xs">
                            CANCEL
                        </Button>
                    </Link>
                    <Button 
                        onClick={handleSubmit}
                        disabled={saving}
                        className="font-mono text-xs bg-amber-600 hover:bg-amber-700"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                SAVING...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                SAVE CHANGES
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-800 text-red-400 font-mono text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <Panel title="Basic Information" icon={User}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">First Name *</label>
                            <Input
                                type="text"
                                name="first_name"
                                value={formData.first_name}
                                onChange={handleChange}
                                required
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Last Name *</label>
                            <Input
                                type="text"
                                name="last_name"
                                value={formData.last_name}
                                onChange={handleChange}
                                required
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Display Name</label>
                            <Input
                                type="text"
                                name="display_name"
                                value={formData.display_name}
                                onChange={handleChange}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Status</label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 text-white font-mono text-sm rounded-md"
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="suspended">Suspended</option>
                                <option value="pending_approval">Pending Approval</option>
                            </select>
                        </div>
                    </div>
                </Panel>

                {/* Contact Information */}
                <Panel title="Contact Information" icon={Mail}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Email *</label>
                            <Input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Primary Phone *</label>
                            <Input
                                type="tel"
                                name="phone_primary"
                                value={formData.phone_primary}
                                onChange={handleChange}
                                required
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Secondary Phone</label>
                            <Input
                                type="tel"
                                name="phone_secondary"
                                value={formData.phone_secondary}
                                onChange={handleChange}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">WhatsApp Number</label>
                            <Input
                                type="tel"
                                name="whatsapp_number"
                                value={formData.whatsapp_number}
                                onChange={handleChange}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                    </div>
                </Panel>

                {/* License & Credentials */}
                <Panel title="License & Credentials" icon={Award}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">License Number</label>
                            <Input
                                type="text"
                                name="license_number"
                                value={formData.license_number}
                                onChange={handleChange}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">License Expiry</label>
                            <Input
                                type="date"
                                name="license_expiry"
                                value={formData.license_expiry}
                                onChange={handleChange}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Ghana RE Board ID</label>
                            <Input
                                type="text"
                                name="ghana_real_estate_board_id"
                                value={formData.ghana_real_estate_board_id}
                                onChange={handleChange}
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                    </div>
                </Panel>

                {/* Specializations */}
                <Panel title="Specializations" icon={Briefcase}>
                    <div className="flex flex-wrap gap-2">
                        {SPECIALIZATION_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleMultiSelect('specializations', opt.value)}
                                className={cn(
                                    "px-3 py-1.5 font-mono text-xs transition-colors border",
                                    formData.specializations.includes(opt.value)
                                        ? "bg-amber-600/20 text-amber-400 border-amber-600"
                                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </Panel>

                {/* Regions */}
                <Panel title="Regions Covered" icon={MapPin}>
                    <div className="flex flex-wrap gap-2">
                        {REGION_OPTIONS.map(region => (
                            <button
                                key={region}
                                type="button"
                                onClick={() => handleMultiSelect('regions_covered', region)}
                                className={cn(
                                    "px-3 py-1.5 font-mono text-xs transition-colors border",
                                    formData.regions_covered.includes(region)
                                        ? "bg-green-600/20 text-green-400 border-green-600"
                                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"
                                )}
                            >
                                {region}
                            </button>
                        ))}
                    </div>
                </Panel>

                {/* Languages */}
                <Panel title="Languages">
                    <div className="flex flex-wrap gap-2">
                        {LANGUAGE_OPTIONS.map(lang => (
                            <button
                                key={lang}
                                type="button"
                                onClick={() => handleMultiSelect('languages', lang.toLowerCase())}
                                className={cn(
                                    "px-3 py-1.5 font-mono text-xs transition-colors border",
                                    formData.languages.includes(lang.toLowerCase())
                                        ? "bg-purple-600/20 text-purple-400 border-purple-600"
                                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"
                                )}
                            >
                                {lang}
                            </button>
                        ))}
                    </div>
                </Panel>

                {/* Experience & Compensation */}
                <Panel title="Experience & Compensation">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Years Experience</label>
                            <Input
                                type="number"
                                name="years_experience"
                                value={formData.years_experience}
                                onChange={handleChange}
                                min="0"
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Commission Rate (%)</label>
                            <Input
                                type="number"
                                name="default_commission_rate"
                                value={formData.default_commission_rate}
                                onChange={handleChange}
                                step="0.1"
                                min="0"
                                max="100"
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Split Rate (%)</label>
                            <Input
                                type="number"
                                name="commission_split_rate"
                                value={formData.commission_split_rate}
                                onChange={handleChange}
                                step="0.1"
                                min="0"
                                max="100"
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Base Salary (GHS)</label>
                            <Input
                                type="number"
                                name="base_salary"
                                value={formData.base_salary}
                                onChange={handleChange}
                                min="0"
                                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                            />
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Hire Date</label>
                        <Input
                            type="date"
                            name="hire_date"
                            value={formData.hire_date}
                            onChange={handleChange}
                            className="bg-zinc-800 border-zinc-700 text-white font-mono w-full md:w-1/4"
                        />
                    </div>
                </Panel>

                {/* Bio */}
                <Panel title="Bio">
                    <textarea
                        name="bio"
                        value={formData.bio}
                        onChange={handleChange}
                        rows={4}
                        placeholder="Agent biography and background..."
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white font-mono text-sm rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                </Panel>
            </form>
        </div>
    )
}
