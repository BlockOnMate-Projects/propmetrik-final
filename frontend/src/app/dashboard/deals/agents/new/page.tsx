'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    ArrowLeft,
    Loader2,
    Save,
    User,
    Phone,
    Mail,
    MapPin,
    Briefcase,
    Award,
    Percent
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { agentsApi } from '@/lib/crm-api'
import { AgentStatus, AgentSpecialization } from '@/types/crm'

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
                {Icon && <Icon className="h-3 w-3 text-amber-500" />}
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

// Specialization options
const SPECIALIZATIONS = [
    { value: 'residential_sales', label: 'Residential Sales' },
    { value: 'commercial_sales', label: 'Commercial Sales' },
    { value: 'residential_rentals', label: 'Residential Rentals' },
    { value: 'commercial_rentals', label: 'Commercial Rentals' },
    { value: 'land_sales', label: 'Land Sales' },
    { value: 'property_management', label: 'Property Management' },
    { value: 'investment_advisory', label: 'Investment Advisory' },
    { value: 'valuation', label: 'Valuation' },
    { value: 'general', label: 'General' },
]

// Ghana regions
const GHANA_REGIONS = [
    'Greater Accra',
    'Ashanti',
    'Western',
    'Central',
    'Eastern',
    'Volta',
    'Northern',
    'Upper East',
    'Upper West',
    'Bono',
    'Bono East',
    'Ahafo',
    'Savannah',
    'North East',
    'Oti',
    'Western North',
]

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function NewAgentPage() {
    const router = useRouter()

    // Form state - Personal
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [email, setEmail] = useState('')
    const [phonePrimary, setPhonePrimary] = useState('')
    const [phoneSecondary, setPhoneSecondary] = useState('')
    const [whatsappNumber, setWhatsappNumber] = useState('')

    // Form state - Professional
    const [licenseNumber, setLicenseNumber] = useState('')
    const [licenseExpiry, setLicenseExpiry] = useState('')
    const [grebId, setGrebId] = useState('')
    const [yearsExperience, setYearsExperience] = useState('')
    const [bio, setBio] = useState('')

    // Form state - Specializations & Regions
    const [specializations, setSpecializations] = useState<string[]>([])
    const [regionsCovered, setRegionsCovered] = useState<string[]>([])

    // Form state - Commission
    const [commissionRate, setCommissionRate] = useState('5')
    const [commissionSplit, setCommissionSplit] = useState('60')

    // UI state
    const [isSaving, setIsSaving] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Toggle specialization
    const toggleSpecialization = (value: string) => {
        setSpecializations(prev => 
            prev.includes(value) 
                ? prev.filter(s => s !== value)
                : [...prev, value]
        )
    }

    // Toggle region
    const toggleRegion = (region: string) => {
        setRegionsCovered(prev =>
            prev.includes(region)
                ? prev.filter(r => r !== region)
                : [...prev, region]
        )
    }

    // Validate form
    const validate = (): boolean => {
        const newErrors: Record<string, string> = {}

        if (!firstName.trim()) {
            newErrors.firstName = 'First name is required'
        }
        if (!lastName.trim()) {
            newErrors.lastName = 'Last name is required'
        }
        if (!email.trim()) {
            newErrors.email = 'Email is required'
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            newErrors.email = 'Invalid email format'
        }
        if (!phonePrimary.trim()) {
            newErrors.phonePrimary = 'Primary phone is required'
        }
        if (specializations.length === 0) {
            newErrors.specializations = 'Select at least one specialization'
        }
        if (regionsCovered.length === 0) {
            newErrors.regions = 'Select at least one region'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    // Handle save
    const handleSave = async () => {
        if (!validate()) return

        try {
            setIsSaving(true)

            const agent = await agentsApi.create({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim(),
                phone_primary: phonePrimary.trim(),
                phone_secondary: phoneSecondary.trim() || undefined,
                whatsapp_number: whatsappNumber.trim() || undefined,
                license_number: licenseNumber.trim() || undefined,
                license_expiry: licenseExpiry || undefined,
                ghana_real_estate_board_id: grebId.trim() || undefined,
                years_experience: yearsExperience ? parseInt(yearsExperience) : undefined,
                bio: bio.trim() || undefined,
                specializations: specializations as AgentSpecialization[],
                regions_covered: regionsCovered,
                default_commission_rate: commissionRate ? parseFloat(commissionRate) : 5,
                commission_split_percentage: commissionSplit ? parseFloat(commissionSplit) : 60,
                status: AgentStatus.ACTIVE,
            })

            router.push(`/dashboard/deals/agents/${agent.id}`)
        } catch (err) {
            console.error('Failed to create agent:', err)
            setErrors({ submit: 'Failed to create agent. Please try again.' })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        className="text-zinc-400 hover:text-white"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="font-mono text-xl text-white">NEW AGENT</h1>
                        <p className="font-mono text-[10px] text-zinc-500">Add a new agent to your team</p>
                    </div>
                </div>
                <Button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    CREATE AGENT
                </Button>
            </div>

            {/* Error message */}
            {errors.submit && (
                <div className="border border-red-900 bg-red-900/20 p-3 text-center">
                    <p className="font-mono text-xs text-red-400">{errors.submit}</p>
                </div>
            )}

            {/* Personal Information */}
            <Panel title="PERSONAL INFORMATION" icon={User}>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">FIRST NAME *</Label>
                        <Input
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Enter first name"
                            className={cn(
                                "mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                errors.firstName && "border-red-500"
                            )}
                        />
                        {errors.firstName && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.firstName}</p>}
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">LAST NAME *</Label>
                        <Input
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Enter last name"
                            className={cn(
                                "mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                errors.lastName && "border-red-500"
                            )}
                        />
                        {errors.lastName && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.lastName}</p>}
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">EMAIL ADDRESS *</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="agent@company.com"
                                className={cn(
                                    "mt-1 pl-9 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                    errors.email && "border-red-500"
                                )}
                            />
                        </div>
                        {errors.email && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">PRIMARY PHONE *</Label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                            <Input
                                value={phonePrimary}
                                onChange={(e) => setPhonePrimary(e.target.value)}
                                placeholder="+233 XX XXX XXXX"
                                className={cn(
                                    "mt-1 pl-9 bg-zinc-800 border-zinc-700 text-white font-mono text-xs",
                                    errors.phonePrimary && "border-red-500"
                                )}
                            />
                        </div>
                        {errors.phonePrimary && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.phonePrimary}</p>}
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">SECONDARY PHONE</Label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                            <Input
                                value={phoneSecondary}
                                onChange={(e) => setPhoneSecondary(e.target.value)}
                                placeholder="+233 XX XXX XXXX"
                                className="mt-1 pl-9 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                            />
                        </div>
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">WHATSAPP NUMBER</Label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500" />
                            <Input
                                value={whatsappNumber}
                                onChange={(e) => setWhatsappNumber(e.target.value)}
                                placeholder="+233 XX XXX XXXX"
                                className="mt-1 pl-9 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                            />
                        </div>
                    </div>
                </div>
            </Panel>

            {/* Professional Information */}
            <Panel title="PROFESSIONAL CREDENTIALS" icon={Briefcase}>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">LICENSE NUMBER</Label>
                        <Input
                            value={licenseNumber}
                            onChange={(e) => setLicenseNumber(e.target.value)}
                            placeholder="GRE-XXXX-XXX"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">LICENSE EXPIRY DATE</Label>
                        <Input
                            type="date"
                            value={licenseExpiry}
                            onChange={(e) => setLicenseExpiry(e.target.value)}
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">GREB REGISTRATION ID</Label>
                        <Input
                            value={grebId}
                            onChange={(e) => setGrebId(e.target.value)}
                            placeholder="Ghana Real Estate Board ID"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">YEARS OF EXPERIENCE</Label>
                        <Input
                            type="number"
                            value={yearsExperience}
                            onChange={(e) => setYearsExperience(e.target.value)}
                            placeholder="0"
                            min="0"
                            max="50"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                    </div>

                    <div className="col-span-2">
                        <Label className="font-mono text-[10px] text-zinc-500">BIO / DESCRIPTION</Label>
                        <Textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Brief professional bio..."
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs resize-none"
                            rows={3}
                        />
                    </div>
                </div>
            </Panel>

            {/* Specializations */}
            <Panel title="SPECIALIZATIONS" icon={Award}>
                <div className="space-y-3">
                    <p className="font-mono text-[10px] text-zinc-500">
                        Select the areas this agent specializes in *
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {SPECIALIZATIONS.map((spec) => (
                            <label
                                key={spec.value}
                                className={cn(
                                    "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors",
                                    specializations.includes(spec.value)
                                        ? "bg-amber-500/20 border border-amber-500/50"
                                        : "bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600"
                                )}
                            >
                                <Checkbox
                                    checked={specializations.includes(spec.value)}
                                    onCheckedChange={() => toggleSpecialization(spec.value)}
                                    className="border-zinc-600"
                                />
                                <span className="font-mono text-xs text-zinc-300">
                                    {spec.label}
                                </span>
                            </label>
                        ))}
                    </div>
                    {errors.specializations && (
                        <p className="font-mono text-[10px] text-red-400">{errors.specializations}</p>
                    )}
                </div>
            </Panel>

            {/* Regions Covered */}
            <Panel title="REGIONS COVERED" icon={MapPin}>
                <div className="space-y-3">
                    <p className="font-mono text-[10px] text-zinc-500">
                        Select the regions this agent operates in *
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                        {GHANA_REGIONS.map((region) => (
                            <label
                                key={region}
                                className={cn(
                                    "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors",
                                    regionsCovered.includes(region)
                                        ? "bg-amber-500/20 border border-amber-500/50"
                                        : "bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600"
                                )}
                            >
                                <Checkbox
                                    checked={regionsCovered.includes(region)}
                                    onCheckedChange={() => toggleRegion(region)}
                                    className="border-zinc-600"
                                />
                                <span className="font-mono text-[10px] text-zinc-300">
                                    {region}
                                </span>
                            </label>
                        ))}
                    </div>
                    {errors.regions && (
                        <p className="font-mono text-[10px] text-red-400">{errors.regions}</p>
                    )}
                </div>
            </Panel>

            {/* Commission Settings */}
            <Panel title="COMMISSION SETTINGS" icon={Percent}>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">DEFAULT COMMISSION RATE (%)</Label>
                        <Input
                            type="number"
                            value={commissionRate}
                            onChange={(e) => setCommissionRate(e.target.value)}
                            placeholder="5"
                            min="0"
                            max="100"
                            step="0.5"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                        <p className="font-mono text-[10px] text-zinc-600 mt-1">
                            Percentage of deal value as commission
                        </p>
                    </div>

                    <div>
                        <Label className="font-mono text-[10px] text-zinc-500">COMMISSION SPLIT (%)</Label>
                        <Input
                            type="number"
                            value={commissionSplit}
                            onChange={(e) => setCommissionSplit(e.target.value)}
                            placeholder="60"
                            min="0"
                            max="100"
                            step="5"
                            className="mt-1 bg-zinc-800 border-zinc-700 text-white font-mono text-xs"
                        />
                        <p className="font-mono text-[10px] text-zinc-600 mt-1">
                            Agent's share of the commission (vs. company)
                        </p>
                    </div>
                </div>
            </Panel>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
                <Button 
                    variant="outline"
                    onClick={() => router.back()}
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                    Cancel
                </Button>
                <Button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs"
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    CREATE AGENT
                </Button>
            </div>
        </div>
    )
}
