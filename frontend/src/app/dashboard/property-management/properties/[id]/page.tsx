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
    ExternalLink,
    Link as LinkIcon,
    Copy,
    Check
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
import { useExchangeRates } from '@/lib/use-exchange-rates'
import {
    Property,
    Tenancy,
    WorkOrder,
    WorkOrderStatus,
    PaymentStatus,
    PropertyDocument,
    FinancialRecord
} from '@/types/property-management'
import { format } from 'date-fns'

export default function PropertyDetailPage() {
    const params = useParams()
    const router = useRouter()
    // Ensure propertyId is always a string (handle array case from Next.js)
    const propertyId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : String(params.id)

    const [property, setProperty] = useState<Property | null>(null)
    const { toGHS } = useExchangeRates()
    const [units, setUnits] = useState<Property[]>([])
    const [tenancies, setTenancies] = useState<Tenancy[]>([])
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
    const [documents, setDocuments] = useState<PropertyDocument[]>([])
    const [financials, setFinancials] = useState<FinancialRecord[]>([])
    const [roiData, setRoiData] = useState<any>(null)
    const [assetPhotos, setAssetPhotos] = useState<PropertyDocument[]>([])

    // Advanced financial analytics state
    const [financialSummary, setFinancialSummary] = useState<any>(null)
    const [noiData, setNoiData] = useState<any>(null)
    const [capRateData, setCapRateData] = useState<any>(null)
    const [irrData, setIrrData] = useState<any>(null)
    const [dscrData, setDscrData] = useState<any>(null)

    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null)
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

    // Application link state
    const [isApplicationLinkDialogOpen, setIsApplicationLinkDialogOpen] = useState(false)
    const [isCreatingApplicationLink, setIsCreatingApplicationLink] = useState(false)
    const [applicationLinks, setApplicationLinks] = useState<any[]>([])
    const [newApplicationLink, setNewApplicationLink] = useState({
        applicationType: 'rental' as 'rental' | 'purchase',
        maxUses: 10,
        expiresInDays: 30
    })
    const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

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
                photosRes,
                linksRes,
                summaryRes,
                noiRes,
                capRateRes,
                irrRes,
                dscrRes,
                unitsRes
            ] = await Promise.all([
                propertyManagementApi.getPropertyById(propertyId),
                propertyManagementApi.getTenancies({ propertyId }),
                propertyManagementApi.getWorkOrders({ propertyId }),
                propertyManagementApi.getDocuments({ propertyId }),
                propertyManagementApi.getFinancials({ propertyId, limit: 10 }),
                propertyManagementApi.getROI(propertyId).catch(() => null),
                propertyManagementApi.getDocuments({ propertyId, type: 'property_photos' }),
                propertyManagementApi.getApplicationLinks({ propertyId }).catch(() => []),
                propertyManagementApi.getFinancialSummary(propertyId).catch(() => null),
                propertyManagementApi.getNOI(propertyId).catch(() => null),
                propertyManagementApi.getCapRate(propertyId).catch(() => null),
                propertyManagementApi.getIRR(propertyId).catch(() => null),
                propertyManagementApi.getDSCR(propertyId).catch(() => null),
                propertyManagementApi.getPropertyUnits(propertyId).catch(() => [])
            ])

            setProperty(propRes)
            setUnits(Array.isArray(unitsRes) ? unitsRes : [])
            setTenancies(Array.isArray(tenanciesRes) ? tenanciesRes : tenanciesRes.data || [])
            setWorkOrders(Array.isArray(workOrdersRes) ? workOrdersRes : workOrdersRes.data || [])
            setDocuments(Array.isArray(docsRes) ? docsRes : docsRes.data || [])
            setFinancials(Array.isArray(financialsRes) ? financialsRes : financialsRes.data || [])
            setRoiData(roiRes)
            setAssetPhotos(Array.isArray(photosRes) ? photosRes : photosRes.data || [])
            setApplicationLinks(Array.isArray(linksRes) ? linksRes : [])
            setFinancialSummary(summaryRes)
            setNoiData(noiRes)
            setCapRateData(capRateRes)
            setIrrData(irrRes)
            setDscrData(dscrRes)

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
        if (!newPhotoFile) return
        try {
            setIsUploading(true)
            await propertyManagementApi.uploadPropertyPhoto(propertyId, newPhotoFile, newPhotoTitle || newPhotoFile.name)
            // Refresh photos
            const photosRes = await propertyManagementApi.getDocuments({ propertyId, type: 'property_photos' })
            setAssetPhotos(Array.isArray(photosRes) ? photosRes : photosRes.data || [])
            setNewPhotoFile(null)
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
            setError(err instanceof Error ? err.message : 'Failed to delete property. Please try again.')
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
                status: WorkOrderStatus.OPEN
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
                status: PaymentStatus.COMPLETED
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

    const handleCreateApplicationLink = async () => {
        try {
            setIsCreatingApplicationLink(true)
            const currentPropertyId = propertyId // Capture the value to avoid closure issues
            const link = await propertyManagementApi.createApplicationLink({
                propertyId: currentPropertyId,
                applicationType: newApplicationLink.applicationType,
                maxUses: newApplicationLink.maxUses,
                expiresInDays: newApplicationLink.expiresInDays
            })
            // Refresh application links
            const linksRes = await propertyManagementApi.getApplicationLinks({ propertyId: currentPropertyId })
            setApplicationLinks(Array.isArray(linksRes) ? linksRes : [])
            setNewApplicationLink({ applicationType: 'rental', maxUses: 10, expiresInDays: 30 })
            // Auto-copy the new link
            const tenantPortalUrl = `${window.location.origin}/tenant/apply/${link.token}`
            await navigator.clipboard.writeText(tenantPortalUrl)
            setCopiedLinkId(link.id)
            setTimeout(() => setCopiedLinkId(null), 3000)
        } catch (err) {
            console.error('Failed to create application link:', err)
        } finally {
            setIsCreatingApplicationLink(false)
        }
    }

    const handleCopyApplicationLink = async (token: string, id: string) => {
        const tenantPortalUrl = `${window.location.origin}/tenant/apply/${token}`
        await navigator.clipboard.writeText(tenantPortalUrl)
        setCopiedLinkId(id)
        setTimeout(() => setCopiedLinkId(null), 3000)
    }

    const handleDeleteApplicationLink = async (id: string) => {
        try {
            await propertyManagementApi.deleteApplicationLink(id)
            setApplicationLinks(prev => prev.filter(link => link.id !== id))
        } catch (err) {
            console.error('Failed to delete application link:', err)
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
                <p className="text-muted-foreground font-mono text-xs uppercase animate-pulse">Establishing Secure Uplink...</p>
            </div>
        )
    }

    if (error || !property) {
        return (
            <div className="p-8 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
                <p className="text-destructive font-mono mb-4">{error || 'Property not found'}</p>
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
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        BACK TO LISTING
                    </Button>
                    <div className="h-4 w-px bg-border hidden md:block" />
                    <Badge variant="outline" className="border-border text-muted-foreground font-mono uppercase text-[10px]">
                        REF: {property.referenceNumber}
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Dialog open={isApplicationLinkDialogOpen} onOpenChange={setIsApplicationLinkDialogOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-primary/50 text-primary hover:bg-primary/10 hover:border-primary"
                            >
                                <LinkIcon className="h-3 w-3 mr-2" />
                                GENERATE LINK
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card border-border max-w-lg">
                            <DialogHeader>
                                <DialogTitle className="text-foreground font-mono uppercase flex items-center gap-2">
                                    <LinkIcon className="h-5 w-5 text-primary" />
                                    Generate Tenant Application Link
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground font-mono text-xs">
                                    Create a shareable link for prospective tenants to apply for this property.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono text-muted-foreground uppercase">Application Type</Label>
                                    <Select
                                        value={newApplicationLink.applicationType}
                                        onValueChange={(v: 'rental' | 'purchase') => setNewApplicationLink(prev => ({ ...prev, applicationType: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="rental">Rental Application</SelectItem>
                                            <SelectItem value="purchase">Purchase Application</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono text-muted-foreground uppercase">Max Uses</Label>
                                        <Input
                                            type="number"
                                            value={newApplicationLink.maxUses}
                                            onChange={(e) => setNewApplicationLink(prev => ({ ...prev, maxUses: parseInt(e.target.value) || 10 }))}
                                            className="bg-background border-border"
                                            min={1}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono text-muted-foreground uppercase">Expires In (Days)</Label>
                                        <Input
                                            type="number"
                                            value={newApplicationLink.expiresInDays}
                                            onChange={(e) => setNewApplicationLink(prev => ({ ...prev, expiresInDays: parseInt(e.target.value) || 30 }))}
                                            className="bg-background border-border"
                                            min={1}
                                        />
                                    </div>
                                </div>
                                {applicationLinks.length > 0 && (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono text-muted-foreground uppercase">Active Links</Label>
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                            {applicationLinks.filter(l => l.isActive).map((link) => (
                                                <div key={link.id} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-mono text-foreground truncate">
                                                            {link.applicationType === 'rental' ? '🏠' : '💰'} {link.token.substring(0, 16)}...
                                                        </p>
                                                        <p className="text-[10px] font-mono text-muted-foreground">
                                                            Uses: {link.currentUses}/{link.maxUses} • Expires: {format(new Date(link.expiresAt), 'MMM dd')}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0"
                                                            onClick={() => handleCopyApplicationLink(link.token, link.id)}
                                                        >
                                                            {copiedLinkId === link.id ? (
                                                                <Check className="h-3 w-3 text-green-500" />
                                                            ) : (
                                                                <Copy className="h-3 w-3 text-muted-foreground" />
                                                            )}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                            onClick={() => handleDeleteApplicationLink(link.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setIsApplicationLinkDialogOpen(false)}
                                    className="bg-secondary border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground font-mono text-xs uppercase"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCreateApplicationLink}
                                    disabled={isCreatingApplicationLink}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs uppercase"
                                >
                                    {isCreatingApplicationLink ? (
                                        <>
                                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <LinkIcon className="h-3 w-3 mr-2" />
                                            Generate & Copy Link
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={handleShareProperty}
                    >
                        <Share2 className="h-3 w-3 mr-2" />
                        SHARE
                    </Button>
                    <Link href={`/dashboard/property-management/properties/${propertyId}/edit`}>
                        <Button variant="outline" size="sm" className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="h-3 w-3 mr-2" />
                            EDIT
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
                        onClick={() => setIsDeleteDialogOpen(true)}
                    >
                        <Trash2 className="h-3 w-3 mr-2" />
                        DELETE
                    </Button>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground font-mono uppercase flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            Confirm Asset Removal
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
                            This action will permanently delete <span className="text-primary">{property.title}</span> and all associated data including tenancies, work orders, documents, and financial records. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-secondary border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground font-mono text-xs uppercase">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteProperty}
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-mono text-xs uppercase"
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
                <div className="w-full md:w-1/3 aspect-video bg-card rounded-lg border border-border flex items-center justify-center text-muted-foreground overflow-hidden relative group">
                    {assetPhotos.length > 0 ? (
                        <img src={assetPhotos[0].fileUrl} alt={property.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                        <Building2 className="h-20 w-20 group-hover:scale-110 transition-transform duration-500" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end p-4">
                        <div>
                            <Badge className="mb-2 bg-primary text-primary-foreground font-bold border-none">{property.transactionType}</Badge>
                            <h2 className="text-xl font-bold text-foreground font-mono uppercase tracking-tight">{property.title}</h2>
                        </div>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                    <Card className="bg-card border-border col-span-2">
                        <CardHeader className="p-4 pb-0">
                            <CardTitle className="text-[10px] font-mono text-muted-foreground uppercase">Location & Address</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-primary mt-1 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm text-foreground font-mono">{property.addressStreet || 'N/A'}</p>
                                    <p className="text-xs text-muted-foreground font-mono">{property.addressCity}, {property.region}</p>
                                    {property.digitalAddress && (
                                        <Badge variant="outline" className="text-[9px] font-mono border-border text-muted-foreground mt-2">
                                            {property.digitalAddress}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                        <CardHeader className="p-4 pb-0">
                            <CardTitle className="text-[10px] font-mono text-muted-foreground uppercase">Current Status</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <Badge
                                variant="outline"
                                className={`
                                    w-full justify-center py-1 font-mono uppercase
                                    ${property.status === 'active' ? 'border-green-900 text-green-500 bg-green-100 dark:bg-green-900/10' : ''}
                                    ${property.status === 'vacant' ? 'border-amber-900 text-amber-500 bg-amber-100 dark:bg-amber-900/10' : ''}
                                `}
                            >
                                {property.status}
                            </Badge>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                        <CardHeader className="p-4 pb-0">
                            <CardTitle className="text-[10px] font-mono text-muted-foreground uppercase">Valuation</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <p className="text-lg font-bold text-primary font-mono">
                                {property.priceCurrency} {property.price.toLocaleString()}
                            </p>
                            {(property.priceCurrency || 'GHS').toUpperCase() !== 'GHS' && (
                                <p className="text-[10px] font-mono text-muted-foreground/70">
                                    ≈ GH₵{toGHS(property.price, property.priceCurrency).toLocaleString('en-GH', { maximumFractionDigits: 0 })}
                                </p>
                            )}
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
                <TabsList className="bg-card border border-border p-1 font-mono text-xs uppercase overflow-x-auto overflow-y-hidden h-auto">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-background data-[state=active]:text-primary">
                        <Building2 className="h-3 w-3 mr-2 hidden md:block" />
                        Attribute Matrix
                    </TabsTrigger>
                    {units.length > 0 && (
                        <TabsTrigger value="units" className="data-[state=active]:bg-background data-[state=active]:text-primary">
                            <Building2 className="h-3 w-3 mr-2 hidden md:block" />
                            Units ({units.length})
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="financials" className="data-[state=active]:bg-background data-[state=active]:text-primary">
                        <Activity className="h-3 w-3 mr-2 hidden md:block" />
                        Financial Intel
                    </TabsTrigger>
                    <TabsTrigger value="tenants" className="data-[state=active]:bg-background data-[state=active]:text-primary">
                        <Users className="h-3 w-3 mr-2 hidden md:block" />
                        Personnel
                    </TabsTrigger>
                    <TabsTrigger value="maintenance" className="data-[state=active]:bg-background data-[state=active]:text-primary">
                        <Wrench className="h-3 w-3 mr-2 hidden md:block" />
                        Asset Integrity
                    </TabsTrigger>
                    <TabsTrigger value="documents" className="data-[state=active]:bg-background data-[state=active]:text-primary">
                        <FileText className="h-3 w-3 mr-2 hidden md:block" />
                        Archives
                    </TabsTrigger>
                    <TabsTrigger value="assets" className="data-[state=active]:bg-background data-[state=active]:text-primary">
                        <Camera className="h-3 w-3 mr-2 hidden md:block" />
                        Assets
                    </TabsTrigger>
                </TabsList>

                {/* UNITS TAB */}
                {units.length > 0 && (
                    <TabsContent value="units" className="mt-6">
                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono text-primary uppercase">
                                    Building Units ({units.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs font-mono">
                                        <thead>
                                            <tr className="text-muted-foreground uppercase text-[10px] border-b border-border">
                                                <th className="text-left font-normal py-2 px-2">Unit</th>
                                                <th className="text-left font-normal py-2 px-2">Floor</th>
                                                <th className="text-left font-normal py-2 px-2">Beds</th>
                                                <th className="text-left font-normal py-2 px-2">Baths</th>
                                                <th className="text-left font-normal py-2 px-2">Area m²</th>
                                                <th className="text-left font-normal py-2 px-2">Rent</th>
                                                <th className="text-left font-normal py-2 px-2">Status</th>
                                                <th className="py-2 px-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {units.map((u) => (
                                                <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/40">
                                                    <td className="py-2 px-2 text-primary font-semibold">{u.unitNumber || u.title}</td>
                                                    <td className="py-2 px-2">{u.floorNumber ?? '—'}</td>
                                                    <td className="py-2 px-2">{u.bedrooms ?? '—'}</td>
                                                    <td className="py-2 px-2">{u.bathrooms ?? '—'}</td>
                                                    <td className="py-2 px-2">{u.totalAreaSqm ?? '—'}</td>
                                                    <td className="py-2 px-2">{u.priceCurrency || 'GHS'} {Number(u.price || 0).toLocaleString()}</td>
                                                    <td className="py-2 px-2">
                                                        <Badge variant="outline" className="text-[9px] font-mono uppercase border-border text-muted-foreground">
                                                            {u.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-2 px-2 text-right">
                                                        <Link href={`/dashboard/property-management/properties/${u.id}`} className="text-primary hover:underline">
                                                            View
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="mt-6">
                    {/* ─── Financial KPI Strip ──────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Net Operating Income</p>
                                <p className={`text-lg font-bold font-mono ${(noiData?.netOperatingIncome ?? 0) >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                                    {noiData ? `GHS ${noiData.netOperatingIncome?.toLocaleString()}` : '—'}
                                </p>
                                {noiData && <p className="text-[9px] font-mono text-muted-foreground mt-1">Margin: {noiData.noiMargin?.toFixed(1)}%</p>}
                            </CardContent>
                        </Card>
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Cap Rate</p>
                                <p className="text-lg font-bold text-primary font-mono">
                                    {capRateData ? `${capRateData.capRate?.toFixed(2)}%` : '—'}
                                </p>
                                {capRateData && <p className="text-[9px] font-mono text-muted-foreground mt-1">{capRateData.recommendation?.toUpperCase()}</p>}
                            </CardContent>
                        </Card>
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">IRR</p>
                                <p className={`text-lg font-bold font-mono ${(irrData?.irr ?? 0) >= 10 ? 'text-green-500' : (irrData?.irr ?? 0) >= 5 ? 'text-primary' : 'text-destructive'}`}>
                                    {irrData?.irr != null ? `${irrData.irr.toFixed(2)}%` : '—'}
                                </p>
                                {irrData?.irr != null
                                    ? <p className="text-[9px] font-mono text-muted-foreground mt-1">Payback: {irrData.paybackPeriodYears?.toFixed(1)} yrs</p>
                                    : <p className="text-[9px] font-mono text-muted-foreground mt-1">No income data</p>}
                            </CardContent>
                        </Card>
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">DSCR</p>
                                <p className={`text-lg font-bold font-mono ${dscrData?.dscr === null ? 'text-green-500' : (dscrData?.dscr ?? 0) >= 1.25 ? 'text-green-500' : (dscrData?.dscr ?? 0) >= 1.0 ? 'text-primary' : 'text-destructive'}`}>
                                    {dscrData ? (dscrData.dscr !== null ? `${dscrData.dscr?.toFixed(2)}x` : 'No Debt') : '—'}
                                </p>
                                {dscrData && <p className="text-[9px] font-mono text-muted-foreground mt-1">{dscrData.interpretation || dscrData.riskLevel}</p>}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="bg-card border-border col-span-2">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono text-primary uppercase">Core Technical Attributes</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Asset Class</p>
                                    <p className="text-sm text-foreground font-mono uppercase flex items-center gap-2">
                                        {(property.propertyType || 'unknown').replace(/_/g, ' ')}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Internal Volume</p>
                                    <p className="text-sm text-foreground font-mono uppercase flex items-center gap-2">
                                        <BedDouble className="h-3 w-3 text-muted-foreground" /> {property.bedrooms || '0'} Bed / <Bath className="h-3 w-3 text-muted-foreground" /> {property.bathrooms || '0'} Bath
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Total Surface Area</p>
                                    <p className="text-sm text-foreground font-mono uppercase flex items-center gap-2">
                                        <Square className="h-3 w-3 text-muted-foreground" /> {property.totalAreaSqm || '0'} m²
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Verticality</p>
                                    <p className="text-sm text-foreground font-mono uppercase">
                                        {property.floors || '1'} {property.floors === 1 ? 'Floor' : 'Floors'}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Unit Identifier</p>
                                    <p className="text-sm text-muted-foreground font-mono">
                                        {property.unitNumber || 'Main Asset'}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Creation Date</p>
                                    <p className="text-sm text-muted-foreground font-mono">
                                        {format(new Date(property.createdAt), 'dd MMM yyyy')}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="bg-card border-border">
                                <CardHeader>
                                    <CardTitle className="text-sm font-mono text-primary uppercase">Asset Links</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Link href={`/dashboard/property-management/properties/${propertyId}/brochure`} className="block w-full">
                                        <Button variant="ghost" className="w-full justify-between text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted">
                                            GENERATE BROCHURE
                                            <Download className="h-3 w-3" />
                                        </Button>
                                    </Link>
                                    <Link href={`/dashboard/property-management/properties/${propertyId}/logbook`} className="block w-full">
                                        <Button variant="ghost" className="w-full justify-between text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted">
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
                        // Read cash flow from the SAME source as the Financial Intelligence Summary
                        // (backend `getPropertyFinancialSummary`, trailing 12 months) so the two
                        // sections can't contradict. Fall back to the loaded records only until the
                        // summary resolves.
                        const totalIncome = financialSummary?.cashFlow?.totalIncome
                            ?? financials.filter(f => f.recordType === 'income').reduce((acc, f) => acc + f.amount, 0)
                        const totalExpenses = financialSummary?.cashFlow?.totalExpenses
                            ?? financials.filter(f => f.recordType === 'expense').reduce((acc, f) => acc + f.amount, 0)
                        const expenseRatio = totalIncome > 0 ? ((totalExpenses / totalIncome) * 100).toFixed(1) : '0.0'
                        const netCashFlow = financialSummary?.cashFlow?.netCashFlow ?? (totalIncome - totalExpenses)
                        const appreciation = roiData?.appreciation || (property.price ? property.price * 0.05 : 0)

                        return (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <Card className="bg-card border-border">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase mb-2">Total ROI</p>
                                        <p className="text-xl font-bold text-green-500 font-mono">
                                            {roiData?.returnOnInvestment ? `${roiData.returnOnInvestment.toFixed(1)}%` : (totalIncome > 0 ? `${((netCashFlow / (property.price || 1)) * 100).toFixed(1)}%` : '—')}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-card border-border">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase mb-2">Net Cash Flow</p>
                                        <p className={`text-xl font-bold font-mono flex items-center gap-2 ${netCashFlow >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                                            <span className="text-primary text-sm">GHS</span>
                                            {netCashFlow >= 0 ? '+' : ''}{netCashFlow.toLocaleString()}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-card border-border">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase mb-2">Expense Ratio</p>
                                        <p className={`text-xl font-bold font-mono ${parseFloat(expenseRatio) > 50 ? 'text-destructive' : parseFloat(expenseRatio) > 30 ? 'text-primary' : 'text-green-500'}`}>
                                            {totalIncome > 0 ? `${expenseRatio}%` : '—'}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-card border-border">
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase mb-2">Total Expenses</p>
                                        <p className="text-xl font-bold text-destructive/80 font-mono">
                                            {totalExpenses > 0 ? `GHS ${totalExpenses.toLocaleString()}` : '—'}
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        )
                    })()}

                    {/* ─── Advanced Financial Analytics ─────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {/* NOI Card */}
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Net Operating Income</p>
                                    <Badge variant="outline" className="text-[8px] font-mono border-border text-muted-foreground">NOI</Badge>
                                </div>
                                <p className={`text-xl font-bold font-mono ${(noiData?.netOperatingIncome ?? 0) >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                                    {noiData ? `GHS ${noiData.netOperatingIncome.toLocaleString()}` : '—'}
                                </p>
                                {noiData && (
                                    <div className="mt-2 space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-[9px] font-mono text-muted-foreground">EGI</span>
                                            <span className="text-[9px] font-mono text-foreground">GHS {noiData.effectiveGrossIncome?.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[9px] font-mono text-muted-foreground">Margin</span>
                                            <span className={`text-[9px] font-mono font-bold ${noiData.noiMargin >= 60 ? 'text-green-500' : noiData.noiMargin >= 40 ? 'text-primary' : 'text-destructive'}`}>
                                                {noiData.noiMargin?.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Cap Rate Card */}
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Capitalization Rate</p>
                                    <Badge variant="outline" className="text-[8px] font-mono border-border text-muted-foreground">CAP</Badge>
                                </div>
                                <p className="text-xl font-bold text-primary font-mono">
                                    {capRateData ? `${capRateData.capRate?.toFixed(2)}%` : '—'}
                                </p>
                                {capRateData && (
                                    <div className="mt-2 space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-[9px] font-mono text-muted-foreground">Market Cap</span>
                                            <span className="text-[9px] font-mono text-foreground">{capRateData.marketCapRate?.toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[9px] font-mono text-muted-foreground">Signal</span>
                                            <Badge className={`text-[8px] font-mono ${capRateData.recommendation === 'undervalued' ? 'bg-green-950/30 text-green-500 border-green-900' : capRateData.recommendation === 'overvalued' ? 'bg-red-950/30 text-red-500 border-red-900' : 'bg-secondary text-secondary-foreground border-border'}`}>
                                                {capRateData.recommendation?.toUpperCase()}
                                            </Badge>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* IRR Card */}
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Internal Rate of Return</p>
                                    <Badge variant="outline" className="text-[8px] font-mono border-border text-muted-foreground">IRR</Badge>
                                </div>
                                <p className={`text-xl font-bold font-mono ${(irrData?.irr ?? 0) >= 10 ? 'text-green-500' : (irrData?.irr ?? 0) >= 5 ? 'text-primary' : 'text-destructive'}`}>
                                    {irrData?.irr != null ? `${irrData.irr.toFixed(2)}%` : '—'}
                                </p>
                                {irrData?.irr != null ? (
                                    <div className="mt-2 space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-[9px] font-mono text-muted-foreground">NPV</span>
                                            <span className="text-[9px] font-mono text-foreground">GHS {irrData.npv?.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[9px] font-mono text-muted-foreground">Payback</span>
                                            <span className="text-[9px] font-mono text-foreground">{irrData.paybackPeriodYears?.toFixed(1)} yrs</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-[9px] font-mono text-muted-foreground mt-2">Insufficient income data to compute a return.</p>
                                )}
                            </CardContent>
                        </Card>

                        {/* DSCR Card */}
                        <Card className="bg-card border-border">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Debt Service Coverage</p>
                                    <Badge variant="outline" className="text-[8px] font-mono border-border text-muted-foreground">DSCR</Badge>
                                </div>
                                <p className={`text-xl font-bold font-mono ${dscrData?.dscr === null ? 'text-green-500' : (dscrData?.dscr ?? 0) >= 1.25 ? 'text-green-500' : (dscrData?.dscr ?? 0) >= 1.0 ? 'text-primary' : 'text-destructive'}`}>
                                    {dscrData ? (dscrData.dscr !== null ? `${dscrData.dscr?.toFixed(2)}x` : dscrData.dscrFormatted || 'No Debt') : '—'}
                                </p>
                                {dscrData && (
                                    <div className="mt-2 space-y-1">
                                        {dscrData.dscr !== null ? (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="text-[9px] font-mono text-muted-foreground">Rating</span>
                                                    <Badge className={`text-[8px] font-mono ${dscrData.rating === 'strong' || dscrData.rating === 'excellent' ? 'bg-green-950/30 text-green-500 border-green-900' : dscrData.rating === 'adequate' ? 'bg-secondary text-secondary-foreground border-border' : 'bg-red-950/30 text-red-500 border-red-900'}`}>
                                                        {dscrData.rating?.toUpperCase()}
                                                    </Badge>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[9px] font-mono text-muted-foreground">Debt Yield</span>
                                                    <span className="text-[9px] font-mono text-foreground">{dscrData.debtYield?.toFixed(1)}%</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex justify-between">
                                                <span className="text-[9px] font-mono text-muted-foreground">Status</span>
                                                <Badge className="text-[8px] font-mono bg-green-950/30 text-green-500 border-green-900">DEBT FREE</Badge>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* ─── Financial Summary Bar ───────────────────── */}
                    {financialSummary && (
                        <Card className="bg-card border-border mb-6">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-mono text-primary uppercase">Financial Intelligence Summary</CardTitle>
                                <CardDescription className="text-[10px] font-mono text-muted-foreground uppercase">
                                    Income &amp; expenses · last 12 months
                                    {financialSummary.cashFlow?.periodStart && financialSummary.cashFlow?.periodEnd
                                        ? ` (${new Date(financialSummary.cashFlow.periodStart).toLocaleDateString('en-GB')} – ${new Date(financialSummary.cashFlow.periodEnd).toLocaleDateString('en-GB')})`
                                        : ''} · {financialSummary.currency || 'GHS'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="p-3 rounded bg-secondary/30 border border-border">
                                        <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Occupancy Rate</p>
                                        <p className={`text-lg font-bold font-mono ${(financialSummary.occupancy?.rate ?? 0) >= 90 ? 'text-green-500' : 'text-primary'}`}>
                                            {financialSummary.occupancy?.rate?.toFixed(0) ?? 0}%
                                        </p>
                                        <p className="text-[9px] font-mono text-muted-foreground">
                                            {financialSummary.occupancy?.occupiedUnits ?? 0}/{financialSummary.occupancy?.totalUnits ?? 0} units
                                        </p>
                                    </div>
                                    <div className="p-3 rounded bg-secondary/30 border border-border">
                                        <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Total Income</p>
                                        <p className="text-lg font-bold text-green-500 font-mono">
                                            GHS {(financialSummary.cashFlow?.totalIncome ?? 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded bg-secondary/30 border border-border">
                                        <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Total Expenses</p>
                                        <p className="text-lg font-bold text-destructive/80 font-mono">
                                            GHS {(financialSummary.cashFlow?.totalExpenses ?? 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded bg-secondary/30 border border-border">
                                        <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Net Cash Flow</p>
                                        <p className={`text-lg font-bold font-mono ${(financialSummary.cashFlow?.netCashFlow ?? 0) >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                                            GHS {(financialSummary.cashFlow?.netCashFlow ?? 0).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-card border-border">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-mono text-primary uppercase">Recent Financial Operations</CardTitle>
                                <CardDescription className="text-xs font-mono text-muted-foreground uppercase mt-1">Audit trail of income and overheads</CardDescription>
                            </div>
                            <Dialog open={isFinancialDialogOpen} onOpenChange={setIsFinancialDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="bg-secondary hover:bg-primary text-secondary-foreground font-mono text-[10px] uppercase">
                                        <Plus className="h-3 w-3 mr-2" />
                                        Record Entry
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-card border-border text-foreground">
                                    <DialogHeader>
                                        <DialogTitle className="font-mono uppercase text-primary">Record Financial Entry</DialogTitle>
                                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                                            Log income or expense for this property
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Type</Label>
                                                <Select
                                                    value={newFinancial.recordType}
                                                    onValueChange={(v: 'income' | 'expense') => setNewFinancial(prev => ({ ...prev, recordType: v }))}
                                                >
                                                    <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border">
                                                        <SelectItem value="income">Income</SelectItem>
                                                        <SelectItem value="expense">Expense</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Category</Label>
                                                <Select
                                                    value={newFinancial.category}
                                                    onValueChange={(v) => setNewFinancial(prev => ({ ...prev, category: v }))}
                                                >
                                                    <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-background border-border">
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
                                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Amount</Label>
                                                <Input
                                                    type="number"
                                                    placeholder="0.00"
                                                    className="bg-background border-border text-foreground font-mono text-sm"
                                                    value={newFinancial.amount}
                                                    onChange={(e) => setNewFinancial(prev => ({ ...prev, amount: e.target.value }))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Currency</Label>
                                                <Select
                                                    value={newFinancial.currency}
                                                    onValueChange={(v) => setNewFinancial(prev => ({ ...prev, currency: v }))}
                                                >
                                                    <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-background border-border">
                                                        <SelectItem value="GHS">GHS</SelectItem>
                                                        <SelectItem value="USD">USD</SelectItem>
                                                        <SelectItem value="EUR">EUR</SelectItem>
                                                        <SelectItem value="GBP">GBP</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Description</Label>
                                            <Textarea
                                                placeholder="Enter description..."
                                                className="bg-background border-border text-foreground font-mono text-sm resize-none"
                                                value={newFinancial.description}
                                                onChange={(e) => setNewFinancial(prev => ({ ...prev, description: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            onClick={handleCreateFinancialEntry}
                                            disabled={isCreatingFinancial || !newFinancial.amount}
                                            className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-[10px] uppercase w-full"
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
                                    <div key={record.id} className="flex items-center justify-between p-3 border border-border bg-background/40 rounded hover:bg-card/50 transition-colors">
                                        <div className="flex gap-4 items-center">
                                            <div className={`p-2 rounded ${record.recordType === 'income' ? 'bg-green-950/30' : 'bg-red-950/30'}`}>
                                                <DollarSign className={`h-4 w-4 ${record.recordType === 'income' ? 'text-green-500' : 'text-red-500'}`} />
                                            </div>
                                            <div>
                                                <p className="text-xs text-foreground font-mono uppercase">{(record.category || 'uncategorized').replace(/_/g, ' ')}</p>
                                                <p className="text-[10px] text-muted-foreground font-mono">{record.transactionDate ? format(new Date(record.transactionDate), 'dd MMM yyyy') : '—'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-bold font-mono ${record.recordType === 'income' ? 'text-green-500' : 'text-destructive/90'}`}>
                                                {record.recordType === 'income' ? '+' : '-'}{record.currency} {(record.amount ?? 0).toLocaleString()}
                                            </p>
                                            <Badge variant="outline" className="text-[8px] font-mono border-border text-muted-foreground uppercase">
                                                {record.status}
                                            </Badge>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-8 border border-dashed border-border rounded-lg">
                                        <p className="text-muted-foreground font-mono text-xs uppercase italic">No financial telemetry detected for this asset.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* PERSONNEL TAB */}
                <TabsContent value="tenants" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="bg-card border-border">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-mono text-primary uppercase">Current Tenants</CardTitle>
                                <Link href={`/dashboard/property-management/tenants/new?propertyId=${propertyId}`}>
                                    <Button size="sm" className="bg-secondary hover:bg-primary text-secondary-foreground font-mono text-[10px] uppercase">
                                        <Plus className="h-3 w-3 mr-2" />
                                        Add Tenant
                                    </Button>
                                </Link>
                            </CardHeader>
                            <CardContent className="p-0">
                                {tenancies.length > 0 ? (
                                    <div className="divide-y divide-border">
                                        {tenancies.filter(t => t.status === 'active').map((tenancy) => (
                                            <div key={tenancy.id} className="p-4 flex items-center justify-between hover:bg-secondary/20 cursor-pointer transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center border border-border">
                                                        <Users className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-foreground font-mono uppercase">{tenancy.tenant?.fullName || 'Occupant'}</p>
                                                        <p className="text-[10px] text-muted-foreground font-mono uppercase">LEASE EXP: {format(new Date(tenancy.leaseEndDate), 'dd MMM yyyy')}</p>
                                                    </div>
                                                </div>
                                                <Badge className="bg-green-950/20 text-green-500 border-green-900 text-[10px] uppercase font-mono">
                                                    ACTIVE
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center bg-card/10 italic text-muted-foreground font-mono text-xs">
                                        No active personnel stationed at this asset.
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="bg-background border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono text-amber-500 uppercase">Personnel Requests & Logs</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {(() => {
                                    const renewals = tenancies
                                        .filter(t => t.status === 'active' && t.leaseEndDate)
                                        .map(t => ({ t, days: Math.ceil((new Date(t.leaseEndDate).getTime() - Date.now()) / 86400000) }))
                                        .filter(r => r.days >= 0 && r.days <= 60)
                                        .sort((a, b) => a.days - b.days)

                                    if (renewals.length === 0) {
                                        return (
                                            <div className="p-8 text-center bg-card/10 italic text-muted-foreground font-mono text-xs">
                                                No personnel requests or upcoming renewals.
                                            </div>
                                        )
                                    }

                                    return renewals.map(({ t, days }) => (
                                        <div key={t.id} className="p-3 border border-border rounded bg-background/40 flex items-start gap-3">
                                            <div className="p-2 bg-blue-950/20 rounded">
                                                <Calendar className="h-4 w-4 text-blue-500" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-foreground font-mono uppercase italic">Lease Renewal Incoming</p>
                                                <p className="text-[9px] text-muted-foreground font-mono mt-1">
                                                    {(t.tenant?.fullName || 'Tenant')} lease expires in {days} day{days !== 1 ? 's' : ''} ({format(new Date(t.leaseEndDate), 'dd MMM yyyy')}).
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                })()}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* MAINTENANCE TAB */}
                <TabsContent value="maintenance" className="mt-6">
                    <Card className="bg-background border-border">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-mono text-amber-500 uppercase">Asset Integrity Status</CardTitle>
                            <Dialog open={isWorkOrderDialogOpen} onOpenChange={setIsWorkOrderDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-[10px] uppercase">
                                        <Plus className="h-3 w-3 mr-2" />
                                        New Work Order
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-background border-border text-foreground">
                                    <DialogHeader>
                                        <DialogTitle className="font-mono uppercase text-amber-500">Create Work Order</DialogTitle>
                                        <DialogDescription className="text-muted-foreground font-mono text-xs">
                                            Log a new maintenance request or work order
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Title</Label>
                                            <Input
                                                placeholder="Ex: Plumbing repair in master bathroom"
                                                className="bg-background border-border text-foreground font-mono text-sm"
                                                value={newWorkOrder.title}
                                                onChange={(e) => setNewWorkOrder(prev => ({ ...prev, title: e.target.value }))}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Category</Label>
                                                <Select
                                                    value={newWorkOrder.category}
                                                    onValueChange={(v) => setNewWorkOrder(prev => ({ ...prev, category: v }))}
                                                >
                                                    <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-background border-border">
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
                                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Priority</Label>
                                                <Select
                                                    value={newWorkOrder.priority}
                                                    onValueChange={(v) => setNewWorkOrder(prev => ({ ...prev, priority: v }))}
                                                >
                                                    <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-background border-border">
                                                        <SelectItem value="low">Low</SelectItem>
                                                        <SelectItem value="medium">Medium</SelectItem>
                                                        <SelectItem value="high">High</SelectItem>
                                                        <SelectItem value="urgent">Urgent</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Description</Label>
                                            <Textarea
                                                placeholder="Describe the issue in detail..."
                                                className="bg-background border-border text-foreground font-mono text-sm resize-none"
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
                                            className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-[10px] uppercase w-full"
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
                                    <div key={order.id} className="p-4 border border-border bg-background/40 rounded flex items-center justify-between group hover:bg-card transition-colors">
                                        <div className="flex gap-4 items-start">
                                            <div className="p-2 bg-card border border-border rounded">
                                                <Wrench className="h-4 w-4 text-muted-foreground group-hover:text-amber-500 transition-colors" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-foreground font-mono uppercase">{order.title}</p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <Badge variant="outline" className="text-[9px] font-mono border-border text-muted-foreground uppercase">{order.category}</Badge>
                                                    <span className="text-[10px] text-muted-foreground font-mono">Assigned: {order.assignedTo || 'Unassigned'}</span>
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
                                            <p className="text-[9px] text-muted-foreground font-mono mt-1">REF: {order.referenceNumber}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-12 border border-dashed border-border rounded-lg">
                                        <Wrench className="h-10 w-10 text-zinc-800 mx-auto mb-4" />
                                        <p className="text-muted-foreground font-mono text-xs uppercase italic">No structural breaches or maintenance requests reported.</p>
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
                            className="aspect-square bg-background border border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-card hover:border-amber-600/50 cursor-pointer transition-all group"
                        >
                            <Plus className="h-8 w-8 text-zinc-700 group-hover:text-amber-500 transition-colors" />
                            <span className="text-[10px] font-mono text-muted-foreground group-hover:text-muted-foreground">UPLOAD ARCHIVE</span>
                        </div>

                        {documents.map((doc) => (
                            <Card key={doc.id} className="bg-background border-border overflow-hidden group">
                                <CardContent className="p-0 flex flex-col items-center justify-center gap-4 relative aspect-square">
                                    <FileText className="h-12 w-12 text-zinc-800 group-hover:text-amber-600/50 transition-colors" />
                                    <div className="text-center px-2">
                                        <p className="text-[10px] font-mono text-foreground truncate max-w-full uppercase">{doc.title}</p>
                                        <p className="text-[9px] font-mono text-muted-foreground uppercase">{doc.documentType}</p>
                                    </div>
                                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-foreground hover:bg-amber-600 transition-colors">
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
                            <p className="text-[10px] text-muted-foreground font-mono uppercase mt-1">Managed media for brochure integration</p>
                        </div>
                        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-[10px] uppercase">
                                    <Plus className="h-3 w-3 mr-2" />
                                    ADD VISUAL ASSET
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-background border-border text-foreground">
                                <DialogHeader>
                                    <DialogTitle className="font-mono uppercase text-amber-500">Register New Visual Asset</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="title" className="text-[10px] font-mono uppercase text-muted-foreground">Asset Title</Label>
                                        <Input
                                            id="title"
                                            placeholder="Ex: Main Exterior Perspective"
                                            className="bg-background border-border text-foreground font-mono text-sm"
                                            value={newPhotoTitle}
                                            onChange={(e) => setNewPhotoTitle(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="photo-file" className="text-[10px] font-mono uppercase text-muted-foreground">Image File</Label>
                                        <Input
                                            id="photo-file"
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="bg-background border-border text-foreground font-mono text-sm"
                                            onChange={(e) => setNewPhotoFile(e.target.files?.[0] || null)}
                                        />
                                        <p className="text-[9px] text-muted-foreground font-mono uppercase">JPG, PNG, or WebP up to 10MB</p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={handleUploadPhoto}
                                        disabled={isUploading || !newPhotoFile}
                                        className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-[10px] uppercase w-full"
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
                            <Card key={photo.id} className="bg-background border-border overflow-hidden group relative aspect-[4/3]">
                                <img
                                    src={photo.fileUrl}
                                    alt={photo.title}
                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                                    <p className="text-[10px] font-mono text-foreground uppercase mb-2 truncate">{photo.title}</p>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-[9px] font-mono text-foreground bg-card/50 hover:bg-red-600"
                                            onClick={() => handleDeletePhoto(photo.id)}
                                        >
                                            DELETE
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}

                        {assetPhotos.length === 0 && (
                            <div className="col-span-full py-20 text-center border border-dashed border-border rounded-lg">
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
