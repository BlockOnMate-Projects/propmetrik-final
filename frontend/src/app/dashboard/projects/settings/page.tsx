'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { humanize } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/providers/i18n-provider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    Settings,
    DollarSign,
    Bell,
    Tags,
    Save,
    ChevronDown,
    Loader2,
    User,
    Shield,
    Palette,
    Globe,
    Columns,
    PenLine,
} from 'lucide-react'
import { EsignSettingsManager } from '@/components/projects/EsignSettingsManager'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const API = process.env.NEXT_PUBLIC_API_URL || ''

const defaultCostCategories = [
    'Site Preparation', 'Foundation', 'Structural', 'Roofing',
    'Plumbing', 'Electrical', 'HVAC', 'Interior Finishing',
    'Exterior Finishing', 'Landscaping', 'Professional Fees',
    'Permits & Licenses', 'Contingency',
]

const notificationItems = [
    { key: 'budget_alerts', label: 'Budget Alerts', desc: 'When spending exceeds thresholds' },
    { key: 'milestone_reminders', label: 'Milestone Reminders', desc: 'Upcoming milestone deadlines' },
    { key: 'contractor_updates', label: 'Contractor Updates', desc: 'Status changes & approvals' },
    { key: 'weekly_digest', label: 'Weekly Digest', desc: 'Summary report every Monday' },
    { key: 'email_notifications', label: 'Email Notifications', desc: 'Receive notifications via email' },
    { key: 'in_app_notifications', label: 'In-App Notifications', desc: 'Show in-app notification popups' },
    { key: 'push_notifications', label: 'Push Notifications', desc: 'Browser push notifications' },
] as const

export default function ProjectSettingsPage() {
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)
    const [currency, setCurrency] = useState('GHS')
    const [profile, setProfile] = useState<any>(null)
    const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '', displayName: '' })
    const [profileDirty, setProfileDirty] = useState(false)
    const [notifications, setNotifications] = useState<Record<string, boolean>>({
        budget_alerts: true,
        milestone_reminders: true,
        contractor_updates: true,
        weekly_digest: false,
        email_notifications: true,
        in_app_notifications: true,
        push_notifications: false,
    })
    const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' })

    useEffect(() => {
        const load = async () => {
            try {
                const [profileRes, notifRes] = await Promise.all([
                    authedFetch(`${API}/user/profile`),
                    authedFetch(`${API}/user/notification-preferences`),
                ])
                if (profileRes.ok) {
                    const p = await profileRes.json()
                    const data = p.data || p.profile || p
                    setProfile(data)
                    setProfileForm({
                        firstName: data.firstName || data.first_name || '',
                        lastName: data.lastName || data.last_name || '',
                        phone: data.phone || '',
                        displayName: data.displayName || data.display_name || '',
                    })
                }
                if (notifRes.ok) {
                    const n = await notifRes.json()
                    const prefs = n.data || n
                    if (prefs) {
                        setNotifications(prev => ({ ...prev, ...prefs }))
                    }
                }
            } catch (e) { console.error('Failed to load settings', e) }
            setLoading(false)
        }
        load()
    }, [])

    const toggleNotification = (key: string) => {
        setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const updateProfileField = (field: string, value: string) => {
        setProfileForm(prev => ({ ...prev, [field]: value }))
        setProfileDirty(true)
    }

    const saveProfile = async () => {
        setSaving(true)
        try {
            const res = await authedFetch(`${API}/user/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: profileForm.firstName,
                    last_name: profileForm.lastName,
                    phone: profileForm.phone,
                    display_name: profileForm.displayName,
                }),
            })
            if (res.ok) {
                toast({ title: 'Profile updated successfully' })
                setProfileDirty(false)
                const updated = await res.json()
                if (updated.profile) setProfile(updated.profile)
            } else {
                const err = await res.json().catch(() => ({}))
                toast({ title: err.message || 'Failed to update profile', variant: 'destructive' })
            }
        } catch (e) {
            toast({ title: 'Failed to update profile', variant: 'destructive' })
        }
        setSaving(false)
    }

    const saveNotifications = async () => {
        setSaving(true)
        try {
            const res = await authedFetch(`${API}/user/notification-preferences`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notifications),
            })
            if (res.ok) {
                toast({ title: 'Notification preferences saved' })
            } else {
                toast({ title: 'Failed to save preferences', variant: 'destructive' })
            }
        } catch (e) {
            toast({ title: 'Failed to save preferences', variant: 'destructive' })
        }
        setSaving(false)
    }

    const changePassword = async () => {
        if (passwordForm.newPass !== passwordForm.confirm) {
            toast({ title: 'Passwords do not match', variant: 'destructive' })
            return
        }
        if (passwordForm.newPass.length < 8) {
            toast({ title: 'Password must be at least 8 characters', variant: 'destructive' })
            return
        }
        setSaving(true)
        try {
            const res = await authedFetch(`${API}/user/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: passwordForm.current,
                    newPassword: passwordForm.newPass,
                }),
            })
            if (res.ok) {
                toast({ title: 'Password changed successfully' })
                setPasswordForm({ current: '', newPass: '', confirm: '' })
            } else {
                const err = await res.json().catch(() => ({}))
                toast({ title: err.error || 'Failed to change password', variant: 'destructive' })
            }
        } catch (e) {
            toast({ title: 'Failed to change password', variant: 'destructive' })
        }
        setSaving(false)
    }

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-mono font-bold text-foreground tracking-tight">SETTINGS</h1>
                    <p className="text-muted-foreground font-mono text-xs mt-1">
                        Manage preferences, notifications &amp; security
                    </p>
                </div>
            </div>

            <Tabs defaultValue="general">
                <TabsList className="bg-muted border border-border">
                    <TabsTrigger value="general" className="font-mono text-xs"><Settings className="h-3 w-3 mr-1" />General</TabsTrigger>
                    <TabsTrigger value="notifications" className="font-mono text-xs"><Bell className="h-3 w-3 mr-1" />Notifications</TabsTrigger>
                    <TabsTrigger value="security" className="font-mono text-xs"><Shield className="h-3 w-3 mr-1" />Security</TabsTrigger>
                    <TabsTrigger value="display" className="font-mono text-xs"><Palette className="h-3 w-3 mr-1" />Display</TabsTrigger>
                    <TabsTrigger value="custom-fields" className="font-mono text-xs"><Columns className="h-3 w-3 mr-1" />Custom Fields</TabsTrigger>
                    <TabsTrigger value="esign" className="font-mono text-xs"><PenLine className="h-3 w-3 mr-1" />E-Signature</TabsTrigger>
                </TabsList>

                {/* General Tab */}
                <TabsContent value="general" className="space-y-6 mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* User Info */}
                        <Card className="bg-card/80 border-border">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-blue-500/10 rounded-lg"><User className="h-4 w-4 text-blue-500" /></div>
                                        <div>
                                            <CardTitle className="text-sm font-mono text-foreground">USER PROFILE</CardTitle>
                                            <CardDescription className="text-[10px] font-mono text-muted-foreground">Edit your personal details</CardDescription>
                                        </div>
                                    </div>
                                    {profileDirty && (
                                        <Button onClick={saveProfile} disabled={saving} size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground font-mono text-xs">
                                            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}Save
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-[10px] font-mono text-muted-foreground">FIRST NAME</Label>
                                        <Input value={profileForm.firstName} onChange={(e) => updateProfileField('firstName', e.target.value)} className="bg-muted border-border text-foreground" />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-mono text-muted-foreground">LAST NAME</Label>
                                        <Input value={profileForm.lastName} onChange={(e) => updateProfileField('lastName', e.target.value)} className="bg-muted border-border text-foreground" />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-muted-foreground">DISPLAY NAME</Label>
                                    <Input value={profileForm.displayName} onChange={(e) => updateProfileField('displayName', e.target.value)} placeholder={`${profileForm.firstName} ${profileForm.lastName}`.trim() || 'Display name'} className="bg-muted border-border text-foreground" />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-mono text-muted-foreground">PHONE</Label>
                                    <Input value={profileForm.phone} onChange={(e) => updateProfileField('phone', e.target.value)} placeholder="+233 XX XXX XXXX" className="bg-muted border-border text-foreground" />
                                </div>
                                <div className="flex items-center justify-between p-3 bg-muted/50 border border-border/50 rounded-lg">
                                    <div><p className="text-[10px] font-mono text-muted-foreground">EMAIL</p><p className="text-sm text-foreground">{profile?.email}</p></div>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-muted/50 border border-border/50 rounded-lg">
                                    <div><p className="text-[10px] font-mono text-muted-foreground">ROLE</p><p className="text-sm text-foreground">{humanize(profile?.role) || 'User'}</p></div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Default Currency */}
                        <Card className="bg-card/80 border-border">
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-amber-500/10 rounded-lg"><DollarSign className="h-4 w-4 text-amber-500" /></div>
                                    <div>
                                        <CardTitle className="text-sm font-mono text-foreground">DEFAULT CURRENCY</CardTitle>
                                        <CardDescription className="text-[10px] font-mono text-muted-foreground">Currency used for new projects</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="relative">
                                    <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-sm font-mono text-foreground appearance-none focus:outline-none focus:border-amber-500/50">
                                        <option value="GHS">GH₵ — Ghana Cedi (GHS)</option>
                                        <option value="USD">$ — US Dollar (USD)</option>
                                        <option value="EUR">€ — Euro (EUR)</option>
                                        <option value="GBP">£ — British Pound (GBP)</option>
                                        <option value="NGN">₦ — Nigerian Naira (NGN)</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="bg-card/80 border-border">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-500/10 rounded-lg"><Tags className="h-4 w-4 text-emerald-500" /></div>
                                <div>
                                    <CardTitle className="text-sm font-mono text-foreground">COST CATEGORIES</CardTitle>
                                    <CardDescription className="text-[10px] font-mono text-muted-foreground">Default categories applied to new projects</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {defaultCostCategories.map((cat) => (
                                    <Badge key={cat} variant="outline" className="border-border text-muted-foreground text-[10px] font-mono px-3 py-1.5 hover:border-amber-500/50 hover:text-amber-400 transition-colors cursor-default">{cat}</Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Notifications Tab */}
                <TabsContent value="notifications" className="space-y-6 mt-6">
                    <Card className="bg-card/80 border-border">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-500/10 rounded-lg"><Bell className="h-4 w-4 text-blue-500" /></div>
                                    <div>
                                        <CardTitle className="text-sm font-mono text-foreground">NOTIFICATION PREFERENCES</CardTitle>
                                        <CardDescription className="text-[10px] font-mono text-muted-foreground">Configure alerts and notification delivery</CardDescription>
                                    </div>
                                </div>
                                <Button onClick={saveNotifications} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-foreground font-mono text-xs">
                                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Save
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {notificationItems.map((item) => (
                                    <label key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50 cursor-pointer hover:bg-muted/80 transition-colors">
                                        <div>
                                            <p className="text-xs font-mono text-foreground">{item.label}</p>
                                            <p className="text-[10px] font-mono text-muted-foreground">{item.desc}</p>
                                        </div>
                                        <div className="relative">
                                            <input type="checkbox" checked={notifications[item.key] ?? false} onChange={() => toggleNotification(item.key)} className="sr-only peer" />
                                            <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-amber-500 transition-colors" />
                                            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full transition-transform peer-checked:translate-x-4" />
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Security Tab */}
                <TabsContent value="security" className="space-y-6 mt-6">
                    <Card className="bg-card/80 border-border">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-red-500/10 rounded-lg"><Shield className="h-4 w-4 text-red-500" /></div>
                                <div>
                                    <CardTitle className="text-sm font-mono text-foreground">CHANGE PASSWORD</CardTitle>
                                    <CardDescription className="text-[10px] font-mono text-muted-foreground">Update your account password</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 max-w-md">
                            <div>
                                <Label className="text-muted-foreground text-xs font-mono">Current Password</Label>
                                <Input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} className="bg-muted border-border" />
                            </div>
                            <div>
                                <Label className="text-muted-foreground text-xs font-mono">New Password</Label>
                                <Input type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm({ ...passwordForm, newPass: e.target.value })} className="bg-muted border-border" />
                            </div>
                            <div>
                                <Label className="text-muted-foreground text-xs font-mono">Confirm New Password</Label>
                                <Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} className="bg-muted border-border" />
                            </div>
                            <Button onClick={changePassword} disabled={saving || !passwordForm.current || !passwordForm.newPass} className="bg-amber-500 hover:bg-amber-600 text-foreground font-mono text-xs">
                                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Shield className="h-3.5 w-3.5 mr-1.5" />}Update Password
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Display Tab */}
                <TabsContent value="display" className="space-y-6 mt-6">
                    <Card className="bg-card/80 border-border">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-purple-500/10 rounded-lg"><Palette className="h-4 w-4 text-purple-500" /></div>
                                <div>
                                    <CardTitle className="text-sm font-mono text-foreground">DISPLAY PREFERENCES</CardTitle>
                                    <CardDescription className="text-[10px] font-mono text-muted-foreground">Customize the look and feel</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-muted/50 border border-border/50 rounded-lg">
                                <div><p className="text-xs font-mono text-foreground">Theme</p><p className="text-[10px] font-mono text-muted-foreground">Application color scheme</p></div>
                                <Badge variant="outline" className="border-amber-800 text-amber-600 dark:text-amber-400">Dark</Badge>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-muted/50 border border-border/50 rounded-lg">
                                <div><p className="text-xs font-mono text-foreground">Date Format</p><p className="text-[10px] font-mono text-muted-foreground">How dates are displayed</p></div>
                                <select className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-foreground">
                                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-muted/50 border border-border/50 rounded-lg">
                                <div><p className="text-xs font-mono text-foreground">Compact View</p><p className="text-[10px] font-mono text-muted-foreground">Reduce spacing in tables and lists</p></div>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only peer" defaultChecked={false} />
                                    <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-amber-500 transition-colors cursor-pointer" />
                                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full transition-transform peer-checked:translate-x-4 pointer-events-none" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Custom Fields Tab */}
                <TabsContent value="custom-fields" className="space-y-6 mt-6">
                    <CustomFieldsManager />
                </TabsContent>

                {/* E-Signature Tab */}
                <TabsContent value="esign" className="space-y-6 mt-6">
                    <EsignSettingsManager />
                </TabsContent>
            </Tabs>
        </div>
    )
}

// ---------- Custom Fields Manager ----------

const FIELD_TYPES = ['text', 'textarea', 'number', 'currency', 'date', 'select', 'multi_select', 'checkbox', 'url', 'email', 'phone'] as const;
const ENTITY_TYPES = ['project', 'unit', 'contractor', 'cost_item', 'punch_list', 'document', 'issue', 'drawing', 'meeting', 'equipment', 'bid_package', 'warranty'] as const;

function CustomFieldsManager() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [showCreate, setShowCreate] = useState(false);
    const [filterEntity, setFilterEntity] = useState('');
    const [form, setForm] = useState<any>({});

    const { data: fields, isLoading } = useQuery({
        queryKey: ['custom-fields', filterEntity],
        queryFn: () => authedFetch(`/api/custom-fields${filterEntity ? `?entity_type=${filterEntity}` : ''}`).then(r => r.json()),
    });

    const createField = useMutation({
        mutationFn: (data: any) => authedFetch('/api/custom-fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); setShowCreate(false); setForm({}); toast({ title: 'Custom field created' }); },
    });

    const deleteField = useMutation({
        mutationFn: (id: string) => authedFetch(`/api/custom-fields/${id}`, { method: 'DELETE' }).then(r => r.json()),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); toast({ title: 'Field deleted' }); },
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-mono font-bold text-foreground">CUSTOM FIELD DEFINITIONS</h3>
                    <p className="text-[10px] font-mono text-muted-foreground">Define reusable fields for any entity type</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={filterEntity || 'all'} onValueChange={v => setFilterEntity(v === 'all' ? '' : v)}>
                        <SelectTrigger className="bg-muted border-border text-foreground w-40 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                        <SelectContent className="bg-muted border-border">
                            <SelectItem value="all">All Types</SelectItem>
                            {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Dialog open={showCreate} onOpenChange={setShowCreate}>
                        <DialogTrigger asChild><Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs">+ ADD FIELD</Button></DialogTrigger>
                        <DialogContent className="bg-card border-border max-w-md">
                            <DialogHeader><DialogTitle className="text-foreground">Add Custom Field</DialogTitle></DialogHeader>
                            <div className="space-y-3">
                                <div><Label className="text-[10px] font-mono text-muted-foreground">FIELD NAME</Label><Input className="bg-muted border-border text-foreground" value={form.field_name || ''} onChange={e => setForm({ ...form, field_name: e.target.value })} /></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-[10px] font-mono text-muted-foreground">ENTITY TYPE</Label>
                                        <Select value={form.entity_type || 'project'} onValueChange={v => setForm({ ...form, entity_type: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border">{ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
                                    <div><Label className="text-[10px] font-mono text-muted-foreground">FIELD TYPE</Label>
                                        <Select value={form.field_type || 'text'} onValueChange={v => setForm({ ...form, field_type: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border">{FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
                                </div>
                                <div><Label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION (OPTIONAL)</Label><Input className="bg-muted border-border text-foreground" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                                {(form.field_type === 'select' || form.field_type === 'multi_select') && (
                                    <div><Label className="text-[10px] font-mono text-muted-foreground">OPTIONS (ONE PER LINE)</Label><Textarea className="bg-muted border-border text-foreground" rows={3} value={form.options_text || ''} onChange={e => setForm({ ...form, options_text: e.target.value })} /></div>
                                )}
                                <div className="flex items-center gap-2"><input type="checkbox" checked={form.is_required || false} onChange={e => setForm({ ...form, is_required: e.target.checked })} /><span className="text-xs text-muted-foreground">Required field</span></div>
                                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => {
                                    const payload = { ...form };
                                    if (payload.options_text) { payload.options = payload.options_text.split('\n').filter(Boolean); delete payload.options_text; }
                                    createField.mutate(payload);
                                }}>Create Field</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-amber-500" /></div>
            ) : (
                <div className="space-y-2">
                    {(fields?.data || []).map((f: any) => (
                        <Card key={f.id} className="bg-card/80 border-border">
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-foreground font-medium">{f.field_name}</span>
                                        <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">{f.field_type}</Badge>
                                        <Badge variant="outline" className="border-amber-800 text-amber-600 dark:text-amber-400 text-[10px]">{f.entity_type}</Badge>
                                        {f.is_required && <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px]">Required</Badge>}
                                    </div>
                                    {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                                    {f.options?.length > 0 && <p className="text-[10px] text-muted-foreground">Options: {(f.options || []).join(', ')}</p>}
                                </div>
                                <Button size="sm" variant="outline" className="border-red-500/50 text-red-600 dark:text-red-400 text-xs" onClick={() => deleteField.mutate(f.id)}>Delete</Button>
                            </CardContent>
                        </Card>
                    ))}
                    {!fields?.data?.length && <p className="text-center text-muted-foreground py-8 text-sm">No custom fields defined</p>}
                </div>
            )}
        </div>
    );
}
