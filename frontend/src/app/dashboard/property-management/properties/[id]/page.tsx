'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Building2,
    MapPin,
    TrendingUp,
    Users,
    Wrench,
    FileText,
    ArrowLeft,
    Pencil,
    Trash2,
    Loader2,
    BedDouble,
    Bath,
    Square,
    Calendar,
    DollarSign,
    Download,
    Plus,
    Activity,
    Image as ImageIcon,
    Camera,
    AlertTriangle,
    Share2,
    ExternalLink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { propertyManagementApi } from '@/lib/property-management-api'
import {
    Property,
    Tenancy,
    WorkOrder,
    PropertyDocument,
    FinancialRecord
} from '@/types/property-management'
import { format } from 'date-fns'

export default function PropertyDetailPage() {
    const params = useParams()
    const router = useRouter()
    const propertyId = params.id as string

    const [property, setProperty] = useState<Property | null>(null)
    const [tenancies, setTenancies] = useState<Tenancy[]>([])
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
    const [documents, setDocuments] = useState<PropertyDocument[]>([])
    const [financials, setFinancials] = useState<FinancialRecord[]>([])
    const [roiData, setRoiData] = useState<any>(null)
    const [assetPhotos, setAssetPhotos] = useState<PropertyDocument[]>([])

    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [newPhotoUrl, setNewPhotoUrl] = useState('')
    const [newPhotoTitle, setNewPhotoTitle] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
    
    // Delete confirmation state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    
    // Work order dialog state
    const [isWorkOrderDialogOpen, setIsWorkOrderDialogOpen] = useState(false)
    const [isCreatingWorkOrder, setIsCreatingWorkOrder] = useState(false)
    const [newWorkOrder, setNewWorkOrder] = useState({
        title: '',
        description: '',
        category: 'general_maintenance',
        priority: 'medium'
    })
    
    // Financial entry dialog state
    const [isFinancialDialogOpen, setIsFinancialDialogOpen] = useState(false)
    const [isCreatingFinancial, setIsCreatingFinancial] = useState(false)
    const [newFinancial, setNewFinancial] = useState({
        recordType: 'income' as 'income' | 'expense',
        category: 'rent',
        amount: '',
        currency: 'GHS',
        description: ''
    })

    const loadData = async () => {
        try {
            setIsLoading(true)
            const [
                propRes,
                tenanciesRes,
                workOrdersRes,
                docsRes,
                financialsRes,
                roiRes,
                photosRes
            ] = await Promise.all([
                propertyManagementApi.getPropertyById(propertyId),
                propertyManagementApi.getTenancies({ propertyId }),
                propertyManagementApi.getWorkOrders({ propertyId }),
                propertyManagementApi.getDocuments({ propertyId }),
                propertyManagementApi.getFinancials({ propertyId, limit: 10 }),
                propertyManagementApi.getROI(propertyId).catch(() => null),
                propertyManagementApi.getDocuments({ propertyId, type: 'property_photos' })
            ])

            setProperty(propRes)
            setTenancies(Array.isArray(tenanciesRes) ? tenanciesRes : tenanciesRes.data || [])
            setWorkOrders(Array.isArray(workOrdersRes) ? workOrdersRes : workOrdersRes.data || [])
            setDocuments(Array.isArray(docsRes) ? docsRes : docsRes.data || [])
            setFinancials(Array.isArray(financialsRes) ? financialsRes : financialsRes.data || [])
            setRoiData(roiRes)
            setAssetPhotos(Array.isArray(photosRes) ? photosRes : photosRes.data || [])

        } catch (err) {
            console.error('Failed to load property details:', err)
            setError('Failed to load property details. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (propertyId) loadData()
    }, [propertyId])

    const handleUploadPhoto = async () => {
        if (!newPhotoUrl) return
        try {
            setIsUploading(true)
            await propertyManagementApi.createDocument({
                propertyId,
                documentType: 'property_photos' as any,
                title: newPhotoTitle || 'Property Photo',
                fileUrl: newPhotoUrl,
                fileName: 'photo.jpg'
            })
            // Refresh photos
            const photosRes = await propertyManagementApi.getDocuments({ propertyId, type: 'property_photos' })
            setAssetPhotos(Array.isArray(photosRes) ? photosRes : photosRes.data || [])
            setNewPhotoUrl('')
            setNewPhotoTitle('')
            setIsUploadDialogOpen(false)
        } catch (err) {
            console.error('Failed to upload photo:', err)
        } finally {
            setIsUploading(false)
        }
    }

    const handleDeletePhoto = async (id: string) => {
        try {
            await propertyManagementApi.deleteDocument(id)
            setAssetPhotos(prev => prev.filter(p => p.id !== id))
        } catch (err) {
            console.error('Failed to delete photo:', err)
        }
    }

    const handleDeleteProperty = async () => {
        try {
            setIsDeleting(true)
            await propertyManagementApi.deleteProperty(propertyId)
            router.push('/dashboard/property-management/properties')
        } catch (err) {
            console.error('Failed to delete property:', err)
            setError('Failed to delete property. Please try again.')
        } finally {
            setIsDeleting(false)
            setIsDeleteDialogOpen(false)
        }
    }

    const handleCreateWorkOrder = async () => {
        if (!newWorkOrder.title) return
        try {
            setIsCreatingWorkOrder(true)
            await propertyManagementApi.createWorkOrder({
                propertyId,
                title: newWorkOrder.title,
                description: newWorkOrder.description,
                category: newWorkOrder.category as any,
                priority: newWorkOrder.priority as any,
                status: 'open'
            })
            // Refresh work orders
            const workOrdersRes = await propertyManagementApi.getWorkOrders({ propertyId })
            setWorkOrders(Array.isArray(workOrdersRes) ? workOrdersRes : workOrdersRes.data || [])
            setNewWorkOrder({ title: '', description: '', category: 'general_maintenance', priority: 'medium' })
            setIsWorkOrderDialogOpen(false)
        } catch (err) {
            console.error('Failed to create work order:', err)
        } finally {
            setIsCreatingWorkOrder(false)
        }
    }

    const handleCreateFinancialEntry = async () => {
        if (!newFinancial.amount) return
        try {
            setIsCreatingFinancial(true)
            await propertyManagementApi.createFinancial({
                propertyId,
                recordType: newFinancial.recordType,
                category: newFinancial.category as any,
                amount: parseFloat(newFinancial.amount),
                currency: newFinancial.currency,
                transactionDate: new Date().toISOString(),
                description: newFinancial.description,
                status: 'completed'
            })
            // Refresh financials
            const financialsRes = await propertyManagementApi.getFinancials({ propertyId, limit: 10 })
            setFinancials(Array.isArray(financialsRes) ? financialsRes : financialsRes.data || [])
            setNewFinancial({ recordType: 'income', category: 'rent', amount: '', currency: 'GHS', description: '' })
            setIsFinancialDialogOpen(false)
        } catch (err) {
            console.error('Failed to create financial entry:', err)
        } finally {
            setIsCreatingFinancial(false)
        }
    }

    const handleShareProperty = async () => {
        const shareUrl = `${window.location.origin}/dashboard/property-management/properties/${propertyId}`
        if (navigator.share) {
            await navigator.share({
                title: property?.title || 'Property',
                text: `Check out this property: ${property?.title}`,
                url: shareUrl
            })
        } else {
            await navigator.clipboard.writeText(shareUrl)
            // Could add toast notification here
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
                <p className="text-zinc-500 font-mono text-xs uppercase animate-pulse">Establishing Secure Uplink...</p>
            </div>
        )
    }

    if (error || !property) {
        return (
            <div className="p-8 bg-red-950/20 border border-red-900 rounded-lg text-center">
                <p className="text-red-500 font-mono mb-4">{error || 'Property not found'}</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumbs / Header Action */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-400 hover:text-white"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        BACK TO LISTING
                    </Button>
                    <div className="h-4 w-px bg-zinc-800 hidden md:block" />
                    <Badge variant="outline" className="border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                        REF: {property.referenceNumber}
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-zinc-400 hover:text-white"
                        onClick={handleShareProperty}
                    >
                        <Share2 className="h-3 w-3 mr-2" />
                        SHARE
                    </Button>
                    <Link href={`/dashboard/property-management/properties/${propertyId}/edit`}>
                        <Button variant="outline" size="sm" className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800">
                            <Pencil className="h-3 w-3 mr-2" />
                            EDIT
                        </Button>
                    </Link>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-zinc-800 text-red-500 hover:bg-red-950/30 hover:border-red-900"
                        onClick={() => setIsDeleteDialogOpen(true)}
                    >
                        <Trash2 className="h-3 w-3 mr-2" />
                        DELETE
                    </Button>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-zinc-950 border-zinc-800">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white font-mono uppercase flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Confirm Asset Removal
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400 font-mono text-xs">
                            This action will permanently delete <span className="text-amber-500">{property.title}</span> and all associated data including tenancies, work orders, documents, and financial records. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white font-mono text-xs uppercase">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteProperty}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-500 text-white font-mono text-xs uppercase"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-3 w-3 mr-2" />
                                    Delete Permanently
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Property Hero Section */}
            <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-full md:w-1/3 aspect-video bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center text-zinc-700 overflow-hidden relative group">
                    {assetPhotos.length > 0 ? (
                        <img src={assetPhotos[0].fileUrl} alt={property.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                        <Building2 className="h-20 w-20 group-hover:scale-110 transition-transform duration-500" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                        <div>
                            <Badge className="mb-2 bg-amber-600 text-black font-bold border-none">{property.transactionType}</Badge>
                            <h2 className="text-xl font-bold text-white font-mono uppercase tracking-tight">{property.title}</h2>
                        </div>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                    <Card className="bg-black border-zinc-800 col-span-2">
                        <CardHeader className="p-4 pb-0">
                            <CardTitle className="text-[10px] font-mono text-zinc-500 uppercase">Location & Address</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-amber-500 mt-1 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm text-white font-mono">{property.addressStreet || 'N/A'}</p>
                                    <p className="text-xs text-zinc-400 font-mono">{property.addressCity}, {property.region}</p>
                                    {property.digitalAddress && (
                                        <Badge variant="outline" className="text-[9px] font-mono border-zinc-700 text-zinc-500 mt-2">
                                            {property.digitalAddress}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-black border-zinc-800">
                        <CardHeader className="p-4 pb-0">
                            <CardTitle className="text-[10px] font-mono text-zinc-500 uppercase">Current Status</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <Badge
                                variant="outline"
                                className={`
                                    w-full justify-center py-1 font-mono uppercase
                                    ${property.status === 'active' ? 'border-green-900 text-green-500 bg-green-900/10' : ''}
                                    ${property.status === 'vacant' ? 'border-amber-900 text-amber-500 bg-amber-900/10' : ''}
                                `}
                            >
                                {property.status}
                            </Badge>
                        </CardContent>
                    </Card>

                    <Card className="bg-black border-zinc-800">
                        <CardHeader className="p-4 pb-0">
                            <CardTitle className="text-[10px] font-mono text-zinc-500 uppercase">Valuation</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <p className="text-lg font-bold text-amber-500 font-mono">
                                {property.priceCurrency} {property.price.toLocaleString()}
                            </p>
                            <div className="mt-4 flex items-center gap-1 text-[9px] font-mono text-green-500">
                                <TrendingUp className="h-3 w-3" />
                                +2.4% VS LAST QTR
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Detailed Tabs */}
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="bg-zinc-900 border border-zinc-800 p-1 font-mono text-xs uppercase overflow-x-auto overflow-y-hidden h-auto">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-black data-[state=active]:text-amber-500">
                        <Building2 className="h-3 w-3 mr-2 hidden md:block" />
                        Attribute Matrix
                    </TabsTrigger>
                    <TabsTrigger value="financials" className="data-[state=active]:bg-black data-[state=active]:text-amber-500">
                        <Activity className="h-3 w-3 mr-2 hidden md:block" />
                        Financial Intel
                    </TabsTrigger>
                    <TabsTrigger value="tenants" className="data-[state=active]:bg-black data-[state=active]:text-amber-500">
                        <Users className="h-3 w-3 mr-2 hidden md:block" />
                        Personnel
                    </TabsTrigger>
                    <TabsTrigger value="maintenance" className="data-[state=active]:bg-black data-[state=active]:text-amber-500">
                        <Wrench className="h-3 w-3 mr-2 hidden md:block" />
                        Asset Integrity
                    </TabsTrigger>
                    <TabsTrigger value="documents" className="data-[state=active]:bg-black data-[state=active]:text-amber-500">
                        <FileText className="h-3 w-3 mr-2 hidden md:block" />
                        Archives
                    </TabsTrigger>
                    <TabsTrigger value="assets" className="data-[state=active]:bg-black data-[state=active]:text-amber-500">
                        <Camera className="h-3 w-3 mr-2 hidden md:block" />
                        Assets
                    </TabsTrigger>
                </TabsList>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="bg-zinc-950 border-zinc-800 col-span-2">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono text-amber-500 uppercase">Core Technical Attributes</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Asset Class</p>
                                    <p className="text-sm text-white font-mono uppercase flex items-center gap-2">
                                        {property.propertyType.replace('_', ' ')}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Internal Volume</p>
                                    <p className="text-sm text-white font-mono uppercase flex items-center gap-2">
                                        <BedDouble className="h-3 w-3 text-zinc-400" /> {property.bedrooms || '0'} Bed / <Bath className="h-3 w-3 text-zinc-400" /> {property.bathrooms || '0'} Bath
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Total Surface Area</p>
                                    <p className="text-sm text-white font-mono uppercase flex items-center gap-2">
                                        <Square className="h-3 w-3 text-zinc-400" /> {property.totalAreaSqm || '0'} m²
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Verticality</p>
                                    <p className="text-sm text-white font-mono uppercase">
                                        {property.floors || '1'} {property.floors === 1 ? 'Floor' : 'Floors'}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Unit Identifier</p>
                                    <p className="text-sm text-zinc-400 font-mono">
                                        {property.unitNumber || 'Main Asset'}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Creation Date</p>
                                    <p className="text-sm text-zinc-400 font-mono">
                                        {format(new Date(property.createdAt), 'dd MMM yyyy')}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="bg-zinc-950 border-zinc-800">
                                <CardHeader>
                                    <CardTitle className="text-sm font-mono text-amber-500 uppercase">Asset Links</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Link href={`/dashboard/property-management/properties/${propertyId}/brochure`} className="block w-full">
                                        <Button variant="ghost" className="w-full justify-between text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800">
                                            GENERATE BROCHURE
                                            <Download className="h-3 w-3" />
                                        </Button>
                                    </Link>
                                    <Link href={`/dashboard/property-management/properties/${propertyId}/logbook`} className="block w-full">
                                        <Button variant="ghost" className="w-full justify-between text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800">
                                            ASSET LOGBOOK
                                            <FileText className="h-3 w-3" />
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* FINANCIALS TAB */}
                <TabsContent value="financials" className="mt-6">
                    {(() => {
                        const totalIncome = financials.filter(f => f.recordType === 'income').reduce((acc, f) => acc + f.amount, 0)
                        const totalExpenses = financials.filter(f => f.recordType === 'expense').reduce((acc, f) => acc + f.amount, 0)
                        const expenseRatio = totalIncome > 0 ? ((totalExpenses / totalIncome) * 100).toFixed(1) : '0.0'
                        const netCashFlow = totalIncome - totalExpenses
                        const appreciation = roiData?.appreciation || (property.price ? property.price * 0.05 : 0)
                        
                        return (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <Card className="bg-zinc-950 border-zinc-800">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">Total ROI</p>
                                        <p className="text-xl font-bold text-green-500 font-mono">
                                            {roiData?.returnOnInvestment ? `${roiData.returnOnInvestment.toFixed(1)}%` : (totalIncome > 0 ? `${((netCashFlow / (property.price || 1)) * 100).toFixed(1)}%` : '—')}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-zinc-950 border-zinc-800">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">Net Cash Flow</p>
                                        <p className={`text-xl font-bold font-mono flex items-center gap-2 ${netCashFlow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            <span className="text-amber-500 text-sm">GHS</span>
                                            {netCashFlow >= 0 ? '+' : ''}{netCashFlow.toLocaleString()}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-zinc-950 border-zinc-800">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">Expense Ratio</p>
                                        <p className={`text-xl font-bold font-mono ${parseFloat(expenseRatio) > 50 ? 'text-red-500' : parseFloat(expenseRatio) > 30 ? 'text-amber-500' : 'text-green-500'}`}>
                                            {totalIncome > 0 ? `${expenseRatio}%` : '—'}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-zinc-950 border-zinc-800">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">Total Expenses</p>
                                        <p className="text-xl font-bold text-red-400 font-mono">
                                            {totalExpenses > 0 ? `GHS ${totalExpenses.toLocaleString()}` : '—'}
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        )
                    })()}

                    <Card className="bg-zinc-950 border-zinc-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-mono text-amber-500 uppercase">Recent Financial Operations</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500 uppercase mt-1">Audit trail of income and overheads</CardDescription>
                            </div>
                            <Dialog open={isFinancialDialogOpen} onOpenChange={setIsFinancialDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="bg-zinc-800 hover:bg-amber-600 text-white font-mono text-[10px] uppercase">
                                        <Plus className="h-3 w-3 mr-2" />
                                        Record Entry
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
                                    <DialogHeader>
                                        <DialogTitle className="font-mono uppercase text-amber-500">Record Financial Entry</DialogTitle>
                                        <DialogDescription className="text-zinc-500 font-mono text-xs">
                                            Log income or expense for this property
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-zinc-500">Type</Label>
                                                <Select
                                                    value={newFinancial.recordType}
                                                    onValueChange={(v: 'income' | 'expense') => setNewFinancial(prev => ({ ...prev, recordType: v }))}
                                                >
                                                    <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                                        <SelectItem value="income">Income</SelectItem>
                                                        <SelectItem value="expense">Expense</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-zinc-500">Category</Label>
                                                <Select
                                                    value={newFinancial.category}
                                                    onValueChange={(v) => setNewFinancial(prev => ({ ...prev, category: v }))}
                                                >
                                                    <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                                        {/* Income Categories */}
                                                        <SelectItem value="rent">Rent Income</SelectItem>
                                                        <SelectItem value="service_charge">Service Charge</SelectItem>
                                                        <SelectItem value="parking">Parking Fee</SelectItem>
                                                        <SelectItem value="late_fee">Late Payment Fee</SelectItem>
                                                        {/* Expense Categories */}
                                                        <SelectItem value="operating_expenses">Operating Expenses</SelectItem>
                                                        <SelectItem value="utilities">Utilities</SelectItem>
                                                        <SelectItem value="maintenance">Maintenance & Repairs</SelectItem>
                                                        <SelectItem value="insurance">Insurance Premium</SelectItem>
                                                        <SelectItem value="property_tax">Property Tax</SelectItem>
                                                        <SelectItem value="management_fee">Management Fee</SelectItem>
                                                        <SelectItem value="security">Security</SelectItem>
                                                        <SelectItem value="cleaning">Cleaning & Sanitation</SelectItem>
                                                        <SelectItem value="landscaping">Landscaping</SelectItem>
                                                        <SelectItem value="legal">Legal & Professional</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-zinc-500">Amount</Label>
                                                <Input
                                                    type="number"
                                                    placeholder="0.00"
                                                    className="bg-black border-zinc-800 text-white font-mono text-sm"
                                                    value={newFinancial.amount}
                                                    onChange={(e) => setNewFinancial(prev => ({ ...prev, amount: e.target.value }))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-zinc-500">Currency</Label>
                                                <Select
                                                    value={newFinancial.currency}
                                                    onValueChange={(v) => setNewFinancial(prev => ({ ...prev, currency: v }))}
                                                >
                                                    <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                                        <SelectItem value="GHS">GHS</SelectItem>
                                                        <SelectItem value="USD">USD</SelectItem>
                                                        <SelectItem value="EUR">EUR</SelectItem>
                                                        <SelectItem value="GBP">GBP</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Description</Label>
                                            <Textarea
                                                placeholder="Enter description..."
                                                className="bg-black border-zinc-800 text-white font-mono text-sm resize-none"
                                                value={newFinancial.description}
                                                onChange={(e) => setNewFinancial(prev => ({ ...prev, description: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            onClick={handleCreateFinancialEntry}
                                            disabled={isCreatingFinancial || !newFinancial.amount}
                                            className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-[10px] uppercase w-full"
                                        >
                                            {isCreatingFinancial ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Plus className="h-3 w-3 mr-2" />}
                                            RECORD ENTRY
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {financials.length > 0 ? financials.map((record) => (
                                    <div key={record.id} className="flex items-center justify-between p-3 border border-zinc-900 bg-black/40 rounded hover:bg-zinc-900/50 transition-colors">
                                        <div className="flex gap-4 items-center">
                                            <div className={`p-2 rounded ${record.recordType === 'income' ? 'bg-green-950/30' : 'bg-red-950/30'}`}>
                                                <DollarSign className={`h-4 w-4 ${record.recordType === 'income' ? 'text-green-500' : 'text-red-500'}`} />
                                            </div>
                                            <div>
                                                <p className="text-xs text-white font-mono uppercase">{record.category.replace('_', ' ')}</p>
                                                <p className="text-[10px] text-zinc-500 font-mono">{format(new Date(record.transactionDate), 'dd MMM yyyy')}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-bold font-mono ${record.recordType === 'income' ? 'text-green-500' : 'text-white'}`}>
                                                {record.recordType === 'income' ? '+' : '-'}{record.currency} {record.amount.toLocaleString()}
                                            </p>
                                            <Badge variant="outline" className="text-[8px] font-mono border-zinc-800 text-zinc-600 uppercase">
                                                {record.status}
                                            </Badge>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-8 border border-dashed border-zinc-900 rounded-lg">
                                        <p className="text-zinc-500 font-mono text-xs uppercase italic">No financial telemetry detected for this asset.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* PERSONNEL TAB */}
                <TabsContent value="tenants" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="bg-zinc-950 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono text-amber-500 uppercase">Current Fleet (Tenants)</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {tenancies.length > 0 ? (
                                    <div className="divide-y divide-zinc-900">
                                        {tenancies.filter(t => t.status === 'active').map((tenancy) => (
                                            <div key={tenancy.id} className="p-4 flex items-center justify-between hover:bg-zinc-900 cursor-pointer transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                                                        <Users className="h-5 w-5 text-zinc-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white font-mono uppercase">{tenancy.tenant?.fullName || 'Occupant'}</p>
                                                        <p className="text-[10px] text-zinc-500 font-mono uppercase">LEASE EXP: {format(new Date(tenancy.leaseEndDate), 'dd MMM yyyy')}</p>
                                                    </div>
                                                </div>
                                                <Badge className="bg-green-950/20 text-green-500 border-green-900 text-[10px] uppercase font-mono">
                                                    ACTIVE
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center bg-zinc-900/10 italic text-zinc-600 font-mono text-xs">
                                        No active personnel stationed at this asset.
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-950 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono text-amber-500 uppercase">Personnel Requests & Logs</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-3 border border-zinc-900 rounded bg-black/40 flex items-start gap-3">
                                    <div className="p-2 bg-blue-950/20 rounded">
                                        <Calendar className="h-4 w-4 text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white font-mono uppercase italic">Lease Renewal Incoming</p>
                                        <p className="text-[9px] text-zinc-500 font-mono mt-1">Tenant "Seun" lease expires in 45 days. Initialized negotiation protocols.</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* MAINTENANCE TAB */}
                <TabsContent value="maintenance" className="mt-6">
                    <Card className="bg-zinc-950 border-zinc-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-mono text-amber-500 uppercase">Asset Integrity Status</CardTitle>
                            <Dialog open={isWorkOrderDialogOpen} onOpenChange={setIsWorkOrderDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-[10px] uppercase">
                                        <Plus className="h-3 w-3 mr-2" />
                                        New Work Order
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
                                    <DialogHeader>
                                        <DialogTitle className="font-mono uppercase text-amber-500">Create Work Order</DialogTitle>
                                        <DialogDescription className="text-zinc-500 font-mono text-xs">
                                            Log a new maintenance request or work order
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Title</Label>
                                            <Input
                                                placeholder="Ex: Plumbing repair in master bathroom"
                                                className="bg-black border-zinc-800 text-white font-mono text-sm"
                                                value={newWorkOrder.title}
                                                onChange={(e) => setNewWorkOrder(prev => ({ ...prev, title: e.target.value }))}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-zinc-500">Category</Label>
                                                <Select
                                                    value={newWorkOrder.category}
                                                    onValueChange={(v) => setNewWorkOrder(prev => ({ ...prev, category: v }))}
                                                >
                                                    <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                                        <SelectItem value="general_maintenance">General Maintenance</SelectItem>
                                                        <SelectItem value="plumbing">Plumbing</SelectItem>
                                                        <SelectItem value="electrical">Electrical</SelectItem>
                                                        <SelectItem value="hvac">HVAC</SelectItem>
                                                        <SelectItem value="structural">Structural</SelectItem>
                                                        <SelectItem value="landscaping">Landscaping</SelectItem>
                                                        <SelectItem value="cleaning">Cleaning</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-zinc-500">Priority</Label>
                                                <Select
                                                    value={newWorkOrder.priority}
                                                    onValueChange={(v) => setNewWorkOrder(prev => ({ ...prev, priority: v }))}
                                                >
                                                    <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                                        <SelectItem value="low">Low</SelectItem>
                                                        <SelectItem value="medium">Medium</SelectItem>
                                                        <SelectItem value="high">High</SelectItem>
                                                        <SelectItem value="urgent">Urgent</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-mono uppercase text-zinc-500">Description</Label>
                                            <Textarea
                                                placeholder="Describe the issue in detail..."
                                                className="bg-black border-zinc-800 text-white font-mono text-sm resize-none"
                                                rows={3}
                                                value={newWorkOrder.description}
                                                onChange={(e) => setNewWorkOrder(prev => ({ ...prev, description: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            onClick={handleCreateWorkOrder}
                                            disabled={isCreatingWorkOrder || !newWorkOrder.title}
                                            className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-[10px] uppercase w-full"
                                        >
                                            {isCreatingWorkOrder ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Plus className="h-3 w-3 mr-2" />}
                                            CREATE WORK ORDER
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {workOrders.length > 0 ? workOrders.map((order) => (
                                    <div key={order.id} className="p-4 border border-zinc-900 bg-black/40 rounded flex items-center justify-between group hover:bg-zinc-900 transition-colors">
                                        <div className="flex gap-4 items-start">
                                            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded">
                                                <Wrench className="h-4 w-4 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-white font-mono uppercase">{order.title}</p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <Badge variant="outline" className="text-[9px] font-mono border-zinc-800 text-zinc-500 uppercase">{order.category}</Badge>
                                                    <span className="text-[10px] text-zinc-600 font-mono">Assigned: {order.assignedTo || 'Unassigned'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge
                                                className={`
                                                    text-[9px] uppercase font-mono
                                                    ${order.status === 'open' ? 'bg-amber-950/20 text-amber-500 border-amber-900' : ''}
                                                    ${order.status === 'completed' ? 'bg-green-950/20 text-green-500 border-green-900' : ''}
                                                `}
                                            >
                                                {order.status}
                                            </Badge>
                                            <p className="text-[9px] text-zinc-600 font-mono mt-1">REF: {order.referenceNumber}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-12 border border-dashed border-zinc-900 rounded-lg">
                                        <Wrench className="h-10 w-10 text-zinc-800 mx-auto mb-4" />
                                        <p className="text-zinc-500 font-mono text-xs uppercase italic">No structural breaches or maintenance requests reported.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* DOCUMENTS TAB */}
                <TabsContent value="documents" className="mt-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        <div
                            className="aspect-square bg-zinc-950 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-zinc-900 hover:border-amber-600/50 cursor-pointer transition-all group"
                        >
                            <Plus className="h-8 w-8 text-zinc-700 group-hover:text-amber-500 transition-colors" />
                            <span className="text-[10px] font-mono text-zinc-600 group-hover:text-zinc-400">UPLOAD ARCHIVE</span>
                        </div>

                        {documents.map((doc) => (
                            <Card key={doc.id} className="bg-zinc-950 border-zinc-800 overflow-hidden group">
                                <CardContent className="p-0 flex flex-col items-center justify-center gap-4 relative aspect-square">
                                    <FileText className="h-12 w-12 text-zinc-800 group-hover:text-amber-600/50 transition-colors" />
                                    <div className="text-center px-2">
                                        <p className="text-[10px] font-mono text-white truncate max-w-full uppercase">{doc.title}</p>
                                        <p className="text-[9px] font-mono text-zinc-600 uppercase">{doc.documentType}</p>
                                    </div>
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-amber-600 transition-colors">
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ASSETS TAB (Photos) */}
                <TabsContent value="assets" className="mt-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-sm font-mono text-amber-500 uppercase">Visual Asset Registry</h3>
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mt-1">Managed media for brochure integration</p>
                        </div>
                        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-[10px] uppercase">
                                    <Plus className="h-3 w-3 mr-2" />
                                    ADD VISUAL ASSET
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
                                <DialogHeader>
                                    <DialogTitle className="font-mono uppercase text-amber-500">Register New Visual Asset</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="title" className="text-[10px] font-mono uppercase text-zinc-500">Asset Title</Label>
                                        <Input
                                            id="title"
                                            placeholder="Ex: Main Exterior Perspective"
                                            className="bg-black border-zinc-800 text-white font-mono text-sm"
                                            value={newPhotoTitle}
                                            onChange={(e) => setNewPhotoTitle(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="url" className="text-[10px] font-mono uppercase text-zinc-500">Resource URL (Public Link)</Label>
                                        <Input
                                            id="url"
                                            placeholder="https://example.com/image.jpg"
                                            className="bg-black border-zinc-800 text-white font-mono text-sm"
                                            value={newPhotoUrl}
                                            onChange={(e) => setNewPhotoUrl(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={handleUploadPhoto}
                                        disabled={isUploading || !newPhotoUrl}
                                        className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-[10px] uppercase w-full"
                                    >
                                        {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Plus className="h-3 w-3 mr-2" />}
                                        UPLOAD TO TERMINAL
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-6">
                        {assetPhotos.map((photo) => (
                            <Card key={photo.id} className="bg-zinc-950 border-zinc-800 overflow-hidden group relative aspect-[4/3]">
                                <img
                                    src={photo.fileUrl}
                                    alt={photo.title}
                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                                    <p className="text-[10px] font-mono text-white uppercase mb-2 truncate">{photo.title}</p>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-[9px] font-mono text-white bg-zinc-900/50 hover:bg-red-600"
                                            onClick={() => handleDeletePhoto(photo.id)}
                                        >
                                            DELETE
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}

                        {assetPhotos.length === 0 && (
                            <div className="col-span-full py-20 text-center border border-dashed border-zinc-900 rounded-lg">
                                <ImageIcon className="h-10 w-10 text-zinc-900 mx-auto mb-4" />
                                <p className="text-zinc-700 font-mono text-xs uppercase">No visual assets registered in this secure archive.</p>
                                <p className="text-zinc-800 font-mono text-[9px] uppercase mt-2">Upload images to enhance digital and physical brochures.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
