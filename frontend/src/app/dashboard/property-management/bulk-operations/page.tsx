'use client'

import React, { useEffect, useState } from 'react'
import {
    Package,
    Upload,
    Download,
    DollarSign,
    Wrench,
    Building2,
    Users,
    FileText,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Loader2,
    ArrowUpRight,
    Plus,
    Percent,
    FileSpreadsheet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Property } from '@/types/property-management'
import { EnterpriseNav } from '@/components/layout/EnterpriseNav'

interface BulkOperationResult {
    success: boolean;
    message: string;
    processed: number;
    failed: number;
    details?: any[];
}

export default function BulkOperationsPage() {
    const [activeTab, setActiveTab] = useState('rent-increase')
    const [isLoading, setIsLoading] = useState(false)
    const [properties, setProperties] = useState<Property[]>([])
    const [selectedProperties, setSelectedProperties] = useState<string[]>([])
    const [result, setResult] = useState<BulkOperationResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Rent Increase Form
    const [rentIncreaseType, setRentIncreaseType] = useState<'percentage' | 'fixed'>('percentage')
    const [rentIncreaseValue, setRentIncreaseValue] = useState('')
    const [effectiveDate, setEffectiveDate] = useState(() => {
        const d = new Date()
        d.setMonth(d.getMonth() + 1)
        d.setDate(1)
        return d.toISOString().split('T')[0]
    })

    // Work Order Form
    const [workOrderTitle, setWorkOrderTitle] = useState('')
    const [workOrderDescription, setWorkOrderDescription] = useState('')
    const [workOrderCategory, setWorkOrderCategory] = useState('GENERAL')
    const [workOrderPriority, setWorkOrderPriority] = useState('MEDIUM')

    // Export/Import
    const [exportResource, setExportResource] = useState('properties')
    const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'excel'>('csv')
    const [importResource, setImportResource] = useState('tenants')
    const [importData, setImportData] = useState('')

    // Load properties for selection
    useEffect(() => {
        const loadProperties = async () => {
            try {
                const response = await propertyManagementApi.getProperties({ limit: 100 })
                const data = Array.isArray(response) ? response : response.data || []
                setProperties(data)
            } catch (err) {
                console.error('Failed to load properties:', err)
            }
        }
        loadProperties()
    }, [])

    const togglePropertySelection = (propertyId: string) => {
        setSelectedProperties(prev =>
            prev.includes(propertyId)
                ? prev.filter(id => id !== propertyId)
                : [...prev, propertyId]
        )
    }

    const selectAllProperties = () => {
        if (selectedProperties.length === properties.length) {
            setSelectedProperties([])
        } else {
            setSelectedProperties(properties.map(p => p.id))
        }
    }

    const handleRentIncrease = async () => {
        if (!selectedProperties.length) {
            setError('Please select at least one property')
            return
        }
        if (!rentIncreaseValue || parseFloat(rentIncreaseValue) <= 0) {
            setError('Please enter a valid increase amount')
            return
        }

        setIsLoading(true)
        setError(null)
        setResult(null)

        try {
            const data = {
                propertyIds: selectedProperties,
                percentage: rentIncreaseType === 'percentage' ? parseFloat(rentIncreaseValue) : undefined,
                fixedAmount: rentIncreaseType === 'fixed' ? parseFloat(rentIncreaseValue) : undefined,
                effectiveDate
            }

            const response = await propertyManagementApi.bulkRentIncrease(data)
            setResult({
                success: true,
                message: `Rent increase scheduled for ${selectedProperties.length} properties`,
                processed: response.updated || selectedProperties.length,
                failed: 0,
                details: response.details
            })
            setSelectedProperties([])
        } catch (err: any) {
            setError(err.message || 'Failed to process rent increase')
        } finally {
            setIsLoading(false)
        }
    }

    const handleBulkWorkOrders = async () => {
        if (!selectedProperties.length) {
            setError('Please select at least one property')
            return
        }
        if (!workOrderTitle.trim()) {
            setError('Please enter a work order title')
            return
        }

        setIsLoading(true)
        setError(null)
        setResult(null)

        try {
            const workOrders = selectedProperties.map(propertyId => ({
                propertyId,
                title: workOrderTitle,
                description: workOrderDescription,
                category: workOrderCategory,
                priority: workOrderPriority
            }))

            const response = await propertyManagementApi.bulkCreateWorkOrders(workOrders)
            setResult({
                success: true,
                message: `Created ${response.created || workOrders.length} work orders`,
                processed: response.created || workOrders.length,
                failed: response.failed || 0,
                details: response.workOrders
            })
            setWorkOrderTitle('')
            setWorkOrderDescription('')
            setSelectedProperties([])
        } catch (err: any) {
            setError(err.message || 'Failed to create work orders')
        } finally {
            setIsLoading(false)
        }
    }

    const handleExport = async () => {
        setIsLoading(true)
        setError(null)
        setResult(null)

        try {
            const response = await propertyManagementApi.bulkExport(exportResource, exportFormat)

            // If CSV or JSON, trigger download
            if (response.data) {
                const content = exportFormat === 'json'
                    ? JSON.stringify(response.data, null, 2)
                    : convertToCSV(response.data)

                const blob = new Blob([content], {
                    type: exportFormat === 'json' ? 'application/json' : 'text/csv'
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${exportResource}_export_${new Date().toISOString().split('T')[0]}.${exportFormat}`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)

                setResult({
                    success: true,
                    message: `Exported ${response.data.length} ${exportResource}`,
                    processed: response.data.length,
                    failed: 0
                })
            }
        } catch (err: any) {
            setError(err.message || 'Failed to export data')
        } finally {
            setIsLoading(false)
        }
    }

    const handleImport = async () => {
        if (!importData.trim()) {
            setError('Please paste data to import')
            return
        }

        setIsLoading(true)
        setError(null)
        setResult(null)

        try {
            // Try to parse as JSON
            let parsedData: any[]
            try {
                parsedData = JSON.parse(importData)
                if (!Array.isArray(parsedData)) {
                    parsedData = [parsedData]
                }
            } catch {
                // Try to parse as CSV
                parsedData = parseCSV(importData)
            }

            if (!parsedData.length) {
                setError('No valid data found to import')
                return
            }

            const response = await propertyManagementApi.bulkImport(importResource, parsedData)
            setResult({
                success: true,
                message: `Imported ${response.created || parsedData.length} ${importResource}`,
                processed: response.created || parsedData.length,
                failed: response.failed || 0,
                details: response.errors
            })
            setImportData('')
        } catch (err: any) {
            setError(err.message || 'Failed to import data')
        } finally {
            setIsLoading(false)
        }
    }

    // Helper functions
    const convertToCSV = (data: any[]) => {
        if (!data.length) return ''
        const headers = Object.keys(data[0])
        const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
        return [headers.join(','), ...rows].join('\n')
    }

    const parseCSV = (csv: string): any[] => {
        const lines = csv.trim().split('\n')
        if (lines.length < 2) return []
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        return lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
            return headers.reduce((obj, header, i) => {
                obj[header] = values[i]
                return obj
            }, {} as any)
        })
    }

    return (
        <div className="space-y-6">
            {/* Enterprise Navigation */}
            <EnterpriseNav />

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white font-mono">BULK OPERATIONS</h1>
                    <p className="text-sm text-zinc-500 font-mono">Mass updates, imports, and exports</p>
                </div>
            </div>

            {/* Result Banner */}
            {result && (
                <Card className={`border ${result.success ? 'bg-green-950/30 border-green-800' : 'bg-red-950/30 border-red-800'}`}>
                    <CardContent className="flex items-center gap-3 py-4">
                        {result.success ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                            <p className={`font-mono text-sm ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                                {result.message}
                            </p>
                            <p className="font-mono text-xs text-zinc-500">
                                Processed: {result.processed} | Failed: {result.failed}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setResult(null)}
                            className="ml-auto text-zinc-500"
                        >
                            Dismiss
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Error Banner */}
            {error && (
                <Card className="bg-red-950/30 border border-red-800">
                    <CardContent className="flex items-center gap-3 py-4">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        <p className="text-red-400 font-mono text-sm">{error}</p>
                        <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto text-zinc-500">
                            Dismiss
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Operation Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-zinc-900 border border-zinc-800 w-full justify-start">
                    <TabsTrigger value="rent-increase" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <DollarSign className="mr-2 h-3 w-3" />
                        Rent Increase
                    </TabsTrigger>
                    <TabsTrigger value="work-orders" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <Wrench className="mr-2 h-3 w-3" />
                        Work Orders
                    </TabsTrigger>
                    <TabsTrigger value="export" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <Download className="mr-2 h-3 w-3" />
                        Export
                    </TabsTrigger>
                    <TabsTrigger value="import" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">
                        <Upload className="mr-2 h-3 w-3" />
                        Import
                    </TabsTrigger>
                </TabsList>

                {/* Rent Increase Tab */}
                <TabsContent value="rent-increase" className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        {/* Configuration */}
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Rent Increase Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Increase Type</Label>
                                    <Select value={rentIncreaseType} onValueChange={(v: 'percentage' | 'fixed') => setRentIncreaseType(v)}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="percentage" className="font-mono">Percentage (%)</SelectItem>
                                            <SelectItem value="fixed" className="font-mono">Fixed Amount (₵)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">
                                        {rentIncreaseType === 'percentage' ? 'Percentage (%)' : 'Amount (₵)'}
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={rentIncreaseValue}
                                            onChange={(e) => setRentIncreaseValue(e.target.value)}
                                            placeholder={rentIncreaseType === 'percentage' ? '5' : '500'}
                                            className="bg-zinc-900 border-zinc-800 text-white font-mono pr-8"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">
                                            {rentIncreaseType === 'percentage' ? '%' : '₵'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Effective Date</Label>
                                    <Input
                                        type="date"
                                        value={effectiveDate}
                                        onChange={(e) => setEffectiveDate(e.target.value)}
                                        className="bg-zinc-900 border-zinc-800 text-white font-mono"
                                    />
                                </div>

                                <Button
                                    onClick={handleRentIncrease}
                                    disabled={isLoading || !selectedProperties.length}
                                    className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs uppercase"
                                >
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowUpRight className="h-4 w-4 mr-2" />}
                                    Apply to {selectedProperties.length} Properties
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Property Selection */}
                        <Card className="bg-black border border-zinc-800 md:col-span-2">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Select Properties</CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={selectAllProperties}
                                    className="text-amber-500 font-mono text-xs"
                                >
                                    {selectedProperties.length === properties.length ? 'Deselect All' : 'Select All'}
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-96 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-zinc-800">
                                                <TableHead className="w-10"></TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase">Property</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase">Location</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase text-right">Current Rent</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {properties.map((property) => (
                                                <TableRow
                                                    key={property.id}
                                                    className="border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                                                    onClick={() => togglePropertySelection(property.id)}
                                                >
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedProperties.includes(property.id)}
                                                            onCheckedChange={() => togglePropertySelection(property.id)}
                                                            className="border-zinc-600"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono text-sm text-white">{property.title}</TableCell>
                                                    <TableCell className="font-mono text-xs text-zinc-400">{property.region || '-'}</TableCell>
                                                    <TableCell className="font-mono text-sm text-right text-amber-400">
                                                        ₵{(property.price || 0).toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Work Orders Tab */}
                <TabsContent value="work-orders" className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        {/* Configuration */}
                        <Card className="bg-black border border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Work Order Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Title</Label>
                                    <Input
                                        value={workOrderTitle}
                                        onChange={(e) => setWorkOrderTitle(e.target.value)}
                                        placeholder="e.g., Annual Inspection"
                                        className="bg-zinc-900 border-zinc-800 text-white font-mono"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Description</Label>
                                    <Textarea
                                        value={workOrderDescription}
                                        onChange={(e) => setWorkOrderDescription(e.target.value)}
                                        placeholder="Work order details..."
                                        rows={3}
                                        className="bg-zinc-900 border-zinc-800 text-white font-mono resize-none"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Category</Label>
                                    <Select value={workOrderCategory} onValueChange={setWorkOrderCategory}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="GENERAL" className="font-mono">General</SelectItem>
                                            <SelectItem value="PLUMBING" className="font-mono">Plumbing</SelectItem>
                                            <SelectItem value="ELECTRICAL" className="font-mono">Electrical</SelectItem>
                                            <SelectItem value="HVAC" className="font-mono">HVAC</SelectItem>
                                            <SelectItem value="APPLIANCE" className="font-mono">Appliance</SelectItem>
                                            <SelectItem value="STRUCTURAL" className="font-mono">Structural</SelectItem>
                                            <SelectItem value="LANDSCAPING" className="font-mono">Landscaping</SelectItem>
                                            <SelectItem value="SECURITY" className="font-mono">Security</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Priority</Label>
                                    <Select value={workOrderPriority} onValueChange={setWorkOrderPriority}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="LOW" className="font-mono">Low</SelectItem>
                                            <SelectItem value="MEDIUM" className="font-mono">Medium</SelectItem>
                                            <SelectItem value="HIGH" className="font-mono">High</SelectItem>
                                            <SelectItem value="CRITICAL" className="font-mono">Critical</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    onClick={handleBulkWorkOrders}
                                    disabled={isLoading || !selectedProperties.length || !workOrderTitle.trim()}
                                    className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs uppercase"
                                >
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                    Create {selectedProperties.length} Work Orders
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Property Selection */}
                        <Card className="bg-black border border-zinc-800 md:col-span-2">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Select Properties</CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={selectAllProperties}
                                    className="text-amber-500 font-mono text-xs"
                                >
                                    {selectedProperties.length === properties.length ? 'Deselect All' : 'Select All'}
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-96 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-zinc-800">
                                                <TableHead className="w-10"></TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase">Property</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase">Location</TableHead>
                                                <TableHead className="text-zinc-500 font-mono text-xs uppercase">Type</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {properties.map((property) => (
                                                <TableRow
                                                    key={property.id}
                                                    className="border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                                                    onClick={() => togglePropertySelection(property.id)}
                                                >
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedProperties.includes(property.id)}
                                                            onCheckedChange={() => togglePropertySelection(property.id)}
                                                            className="border-zinc-600"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono text-sm text-white">{property.title}</TableCell>
                                                    <TableCell className="font-mono text-xs text-zinc-400">{property.region || '-'}</TableCell>
                                                    <TableCell className="font-mono text-xs text-zinc-400">{property.propertyType || '-'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Export Tab */}
                <TabsContent value="export" className="mt-4">
                    <Card className="bg-black border border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Export Data</CardTitle>
                            <CardDescription className="text-xs text-zinc-500 font-mono">
                                Download your property management data in various formats
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Resource</Label>
                                    <Select value={exportResource} onValueChange={setExportResource}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="properties" className="font-mono">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4" /> Properties
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="tenants" className="font-mono">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4" /> Tenants
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="tenancies" className="font-mono">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4" /> Leases
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="payments" className="font-mono">
                                                <div className="flex items-center gap-2">
                                                    <DollarSign className="h-4 w-4" /> Payments
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Format</Label>
                                    <Select value={exportFormat} onValueChange={(v: 'csv' | 'json' | 'excel') => setExportFormat(v)}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="csv" className="font-mono">CSV (.csv)</SelectItem>
                                            <SelectItem value="json" className="font-mono">JSON (.json)</SelectItem>
                                            <SelectItem value="excel" className="font-mono">Excel (.xlsx)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-end">
                                    <Button
                                        onClick={handleExport}
                                        disabled={isLoading}
                                        className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs uppercase"
                                    >
                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                                        Export {exportResource}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Import Tab */}
                <TabsContent value="import" className="mt-4">
                    <Card className="bg-black border border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Import Data</CardTitle>
                            <CardDescription className="text-xs text-zinc-500 font-mono">
                                Bulk import data from CSV or JSON format
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-500 font-mono uppercase">Resource</Label>
                                    <Select value={importResource} onValueChange={setImportResource}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="tenants" className="font-mono">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4" /> Tenants
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="properties" className="font-mono">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4" /> Properties
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-zinc-500 font-mono uppercase">Data (JSON or CSV)</Label>
                                <Textarea
                                    value={importData}
                                    onChange={(e) => setImportData(e.target.value)}
                                    placeholder={`Paste your ${importResource} data here...\n\nJSON format:\n[{"name": "John Doe", "email": "john@example.com", "phone": "+233..."}]\n\nCSV format:\nname,email,phone\nJohn Doe,john@example.com,+233...`}
                                    rows={10}
                                    className="bg-zinc-900 border-zinc-800 text-white font-mono text-xs resize-none"
                                />
                            </div>

                            <Button
                                onClick={handleImport}
                                disabled={isLoading || !importData.trim()}
                                className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs uppercase"
                            >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                Import Data
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
