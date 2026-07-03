'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn } from '@/lib/utils'
import {
  Building2,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Star,
  StarHalf,
  Phone,
  Mail,
  MapPin,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Award,
  Clock,
  MessageSquare,
  DollarSign,
  ExternalLink,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import {
  vendorApi,
  vendorRatingApi,
  vendorAssignmentApi,
  vendorComplianceApi,
  type Vendor,
  type VendorCategory,
  type VendorRating,
  type VendorAssignment,
} from '@/lib/team-api'

// =====================================================
// TYPES
// =====================================================

interface VendorDirectoryProps {
  organizationId: string
  projectId?: string
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================

const CATEGORY_CONFIG: Record<VendorCategory, { label: string; icon: React.ElementType; color: string }> = {
  supplier: { label: 'Supplier', icon: Building2, color: 'bg-blue-100 text-blue-800' },
  subcontractor: { label: 'Subcontractor', icon: Award, color: 'bg-amber-100 text-amber-800' },
  consultant: { label: 'Consultant', icon: MessageSquare, color: 'bg-purple-100 text-purple-800' },
  equipment_rental: { label: 'Equipment Rental', icon: Building2, color: 'bg-green-100 text-green-800' },
  logistics: { label: 'Logistics', icon: ExternalLink, color: 'bg-orange-100 text-orange-800' },
  professional_services: { label: 'Professional Services', icon: Shield, color: 'bg-indigo-100 text-indigo-800' },
  other: { label: 'Other', icon: Building2, color: 'bg-muted text-gray-800' },
}

// =====================================================
// STAR RATING DISPLAY
// =====================================================

function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0)

  return (
    <div className="flex items-center gap-0.5">
      {[...Array(fullStars)].map((_, i) => (
        <Star key={`full-${i}`} className={cn(sizeClasses[size], 'fill-amber-400 text-amber-600 dark:text-amber-400')} />
      ))}
      {hasHalfStar && (
        <StarHalf className={cn(sizeClasses[size], 'fill-amber-400 text-amber-600 dark:text-amber-400')} />
      )}
      {[...Array(emptyStars)].map((_, i) => (
        <Star key={`empty-${i}`} className={cn(sizeClasses[size], 'text-gray-300')} />
      ))}
    </div>
  )
}

// =====================================================
// RATING INPUT
// =====================================================

function RatingInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-medium">{value.toFixed(1)}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]: number[]) => onChange(v)}
        min={1}
        max={5}
        step={0.5}
        className="w-full"
      />
    </div>
  )
}

// =====================================================
// COMPLIANCE STATUS
// =====================================================

function ComplianceStatus({ vendor }: { vendor: Vendor }) {
  const docs = vendor.complianceDocuments || []
  const totalDocs = docs.length
  const verifiedDocs = docs.filter(d => d.isVerified).length
  const expiringDocs = docs.filter(d => {
    if (!d.expiryDate) return false
    const daysUntilExpiry = Math.ceil(
      (new Date(d.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0
  })
  const expiredDocs = docs.filter(d => {
    if (!d.expiryDate) return false
    return new Date(d.expiryDate) < new Date()
  })

  if (totalDocs === 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No documents
      </Badge>
    )
  }

  if (expiredDocs.length > 0) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        {expiredDocs.length} expired
      </Badge>
    )
  }

  if (expiringDocs.length > 0) {
    return (
      <Badge className="flex items-center gap-1 bg-yellow-100 text-yellow-800">
        <AlertTriangle className="h-3 w-3" />
        {expiringDocs.length} expiring
      </Badge>
    )
  }

  if (verifiedDocs === totalDocs) {
    return (
      <Badge className="flex items-center gap-1 bg-green-100 text-green-800">
        <CheckCircle className="h-3 w-3" />
        Compliant
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <FileCheck className="h-3 w-3" />
      {verifiedDocs}/{totalDocs} verified
    </Badge>
  )
}

// =====================================================
// VENDOR CARD
// =====================================================

function VendorCard({
  vendor,
  onClick,
  onAction,
}: {
  vendor: Vendor
  onClick: () => void
  onAction: (action: string) => void
}) {
  const config = CATEGORY_CONFIG[vendor.category]
  const CategoryIcon = config.icon

  return (
    <Card
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-md',
        !vendor.isApproved && 'border-dashed'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn('rounded-lg p-2', config.color)}>
              <CategoryIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-medium truncate">{vendor.name}</h4>
              <div className="mt-1 flex items-center gap-2">
                <StarRating rating={vendor.averageRating} size="sm" />
                <span className="text-xs text-muted-foreground">
                  ({vendor.totalRatings})
                </span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('rate'); }}>
                <Star className="mr-2 h-4 w-4" />
                Rate Vendor
              </DropdownMenuItem>
              {!vendor.isApproved ? (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('approve'); }}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('suspend'); }}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Suspend
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={config.color}>{config.label}</Badge>
          {vendor.isApproved ? (
            <Badge variant="outline" className="text-green-600 border-green-300">
              Approved
            </Badge>
          ) : (
            <Badge variant="outline" className="text-yellow-600 border-yellow-300">
              Pending
            </Badge>
          )}
          <ComplianceStatus vendor={vendor} />
        </div>

        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {vendor.city && vendor.region && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {vendor.city}, {vendor.region}
            </div>
          )}
          {vendor.phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {vendor.phone}
            </div>
          )}
        </div>

        {vendor.specializations && vendor.specializations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {vendor.specializations.slice(0, 3).map((spec) => (
              <Badge key={spec} variant="secondary" className="text-xs">
                {spec}
              </Badge>
            ))}
            {vendor.specializations.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{vendor.specializations.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// =====================================================
// ADD VENDOR FORM
// =====================================================

function AddVendorForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (data: Partial<Vendor>) => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  const [formData, setFormData] = useState<Partial<Vendor>>({
    name: '',
    category: 'supplier',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    region: '',
    tinNumber: '',
    specializations: [],
    notes: '',
  })

  const [specializationInput, setSpecializationInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const addSpecialization = () => {
    if (specializationInput.trim() && !formData.specializations?.includes(specializationInput.trim())) {
      setFormData(prev => ({
        ...prev,
        specializations: [...(prev.specializations || []), specializationInput.trim()],
      }))
      setSpecializationInput('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Vendor Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as VendorCategory }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactPerson">Contact Person</Label>
          <Input
            id="contactPerson"
            value={formData.contactPerson}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tinNumber">TIN Number</Label>
          <Input
            id="tinNumber"
            placeholder="Ghana TIN"
            value={formData.tinNumber}
            onChange={(e) => setFormData(prev => ({ ...prev, tinNumber: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            placeholder="+233 XX XXX XXXX"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">Region</Label>
          <Select
            value={formData.region}
            onValueChange={(value) => setFormData(prev => ({ ...prev, region: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Greater Accra">Greater Accra</SelectItem>
              <SelectItem value="Ashanti">Ashanti</SelectItem>
              <SelectItem value="Western">Western</SelectItem>
              <SelectItem value="Central">Central</SelectItem>
              <SelectItem value="Eastern">Eastern</SelectItem>
              <SelectItem value="Volta">Volta</SelectItem>
              <SelectItem value="Northern">Northern</SelectItem>
              <SelectItem value="Upper East">Upper East</SelectItem>
              <SelectItem value="Upper West">Upper West</SelectItem>
              <SelectItem value="Brong Ahafo">Brong Ahafo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Specializations</Label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g., Concrete works, Roofing"
            value={specializationInput}
            onChange={(e) => setSpecializationInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSpecialization()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addSpecialization}>
            Add
          </Button>
        </div>
        {formData.specializations && formData.specializations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {formData.specializations.map((spec) => (
              <Badge
                key={spec}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setFormData(prev => ({
                  ...prev,
                  specializations: prev.specializations?.filter(s => s !== spec),
                }))}
              >
                {spec} ×
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !formData.name}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Vendor
        </Button>
      </DialogFooter>
    </form>
  )
}

// =====================================================
// VENDOR DETAIL SHEET
// =====================================================

function VendorDetail({
  vendor,
  projectId,
  onClose,
  onRefresh,
}: {
  vendor: Vendor
  projectId?: string
  onClose: () => void
  onRefresh: () => void
}) {
  const [activeTab, setActiveTab] = useState('info')
  const [ratings, setRatings] = useState<VendorRating[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Rating form
  const [showRatingDialog, setShowRatingDialog] = useState(false)
  const [ratingForm, setRatingForm] = useState({
    qualityRating: 4,
    timelinessRating: 4,
    communicationRating: 4,
    valueRating: 4,
    comments: '',
  })
  const [isSubmittingRating, setIsSubmittingRating] = useState(false)

  const config = CATEGORY_CONFIG[vendor.category]
  const CategoryIcon = config.icon

  useEffect(() => {
    const loadRatings = async () => {
      setIsLoading(true)
      try {
        const data = await vendorRatingApi.get(vendor.id)
        setRatings(data)
      } catch (err) {
        console.error('Error loading ratings:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadRatings()
  }, [vendor.id])

  const handleSubmitRating = async () => {
    if (!projectId) return
    setIsSubmittingRating(true)
    try {
      await vendorRatingApi.rate(vendor.id, {
        projectId,
        ...ratingForm,
      })
      setShowRatingDialog(false)
      onRefresh()
    } catch (err) {
      console.error('Error submitting rating:', err)
    } finally {
      setIsSubmittingRating(false)
    }
  }

  return (
    <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
      <SheetHeader>
        <div className="flex items-start gap-4">
          <div className={cn('rounded-lg p-3', config.color)}>
            <CategoryIcon className="h-6 w-6" />
          </div>
          <div>
            <SheetTitle>{vendor.name}</SheetTitle>
            <SheetDescription className="flex items-center gap-2 mt-1">
              <StarRating rating={vendor.averageRating} />
              <span>({vendor.totalRatings} ratings)</span>
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge className={config.color}>{config.label}</Badge>
        {vendor.isApproved ? (
          <Badge variant="outline" className="text-green-600 border-green-300">
            <CheckCircle className="mr-1 h-3 w-3" />
            Approved
          </Badge>
        ) : (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            <Clock className="mr-1 h-3 w-3" />
            Pending Approval
          </Badge>
        )}
        <ComplianceStatus vendor={vendor} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="ratings">Ratings</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4 mt-4">
          {/* Contact */}
          <div className="space-y-3">
            <h4 className="font-medium">Contact Information</h4>
            {vendor.contactPerson && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {vendor.contactPerson}
              </div>
            )}
            {vendor.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${vendor.email}`} className="hover:underline">
                  {vendor.email}
                </a>
              </div>
            )}
            {vendor.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${vendor.phone}`} className="hover:underline">
                  {vendor.phone}
                </a>
              </div>
            )}
            {(vendor.address || vendor.city || vendor.region) && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>
                  {[vendor.address, vendor.city, vendor.region].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Payment Info */}
          {(vendor.bankName || vendor.mobileMoneyProvider) && (
            <div className="space-y-3">
              <h4 className="font-medium">Payment Information</h4>
              {vendor.bankName && (
                <div className="text-sm">
                  <p className="text-muted-foreground">Bank</p>
                  <p>{vendor.bankName} - {vendor.bankAccountNumber}</p>
                  {vendor.bankBranch && <p className="text-xs text-muted-foreground">{vendor.bankBranch}</p>}
                </div>
              )}
              {vendor.mobileMoneyProvider && (
                <div className="text-sm">
                  <p className="text-muted-foreground">Mobile Money</p>
                  <p>{vendor.mobileMoneyProvider}: {vendor.mobileMoneyNumber}</p>
                </div>
              )}
            </div>
          )}

          {/* Specializations */}
          {vendor.specializations && vendor.specializations.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Specializations</h4>
              <div className="flex flex-wrap gap-1">
                {vendor.specializations.map((spec) => (
                  <Badge key={spec} variant="secondary">
                    {spec}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {vendor.notes && (
            <div className="space-y-2">
              <h4 className="font-medium">Notes</h4>
              <p className="text-sm text-muted-foreground">{vendor.notes}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4 mt-4">
          {!vendor.complianceDocuments || vendor.complianceDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileCheck className="mx-auto h-12 w-12" />
              <p className="mt-2">No compliance documents uploaded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vendor.complianceDocuments.map((doc, idx) => {
                const isExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date()
                const isExpiringSoon = doc.expiryDate && !isExpired && 
                  Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30

                return (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-3',
                      isExpired && 'border-red-200 bg-red-50',
                      isExpiringSoon && 'border-yellow-200 bg-yellow-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <FileCheck className={cn(
                        'h-5 w-5',
                        doc.isVerified ? 'text-green-500' : 'text-muted-foreground'
                      )} />
                      <div>
                        <p className="font-medium capitalize">
                          {doc.type.replace(/_/g, ' ')}
                        </p>
                        {doc.expiryDate && (
                          <p className={cn(
                            'text-xs',
                            isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : 'text-muted-foreground'
                          )}>
                            {isExpired ? 'Expired: ' : 'Expires: '}
                            {new Date(doc.expiryDate).toLocaleDateString('en-GB')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.isVerified ? (
                        <Badge className="bg-green-100 text-green-800">Verified</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ratings" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">{vendor.averageRating.toFixed(1)}</p>
              <StarRating rating={vendor.averageRating} size="lg" />
              <p className="text-sm text-muted-foreground mt-1">
                {vendor.totalRatings} total ratings
              </p>
            </div>
            {projectId && (
              <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Star className="mr-2 h-4 w-4" />
                    Rate Vendor
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rate {vendor.name}</DialogTitle>
                    <DialogDescription>
                      Provide your rating for this vendor's performance.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <RatingInput
                      label="Quality"
                      value={ratingForm.qualityRating}
                      onChange={(v) => setRatingForm(prev => ({ ...prev, qualityRating: v }))}
                    />
                    <RatingInput
                      label="Timeliness"
                      value={ratingForm.timelinessRating}
                      onChange={(v) => setRatingForm(prev => ({ ...prev, timelinessRating: v }))}
                    />
                    <RatingInput
                      label="Communication"
                      value={ratingForm.communicationRating}
                      onChange={(v) => setRatingForm(prev => ({ ...prev, communicationRating: v }))}
                    />
                    <RatingInput
                      label="Value for Money"
                      value={ratingForm.valueRating}
                      onChange={(v) => setRatingForm(prev => ({ ...prev, valueRating: v }))}
                    />
                    <div className="space-y-2">
                      <Label>Comments</Label>
                      <Textarea
                        placeholder="Share your experience..."
                        value={ratingForm.comments}
                        onChange={(e) => setRatingForm(prev => ({ ...prev, comments: e.target.value }))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowRatingDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubmitRating} disabled={isSubmittingRating}>
                      {isSubmittingRating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit Rating
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : ratings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Star className="mx-auto h-12 w-12" />
              <p className="mt-2">No ratings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ratings.map((rating) => (
                <div key={rating.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <StarRating rating={rating.overallRating} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(rating.createdAt).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                  {rating.comments && (
                    <p className="mt-2 text-sm">{rating.comments}</p>
                  )}
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                    <div>Quality: {rating.qualityRating}</div>
                    <div>Time: {rating.timelinessRating}</div>
                    <div>Comm: {rating.communicationRating}</div>
                    <div>Value: {rating.valueRating}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </SheetContent>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function VendorDirectory({
  organizationId,
  projectId,
  className,
}: VendorDirectoryProps) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  // PERF: debounce so the remote-DB vendor search runs once the user pauses typing.
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const [categoryFilter, setCategoryFilter] = useState<VendorCategory | 'all'>('all')
  const [showApprovedOnly, setShowApprovedOnly] = useState(false)
  const [minRating, setMinRating] = useState(0)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data } = await vendorApi.getAll({
        organizationId,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        isApproved: showApprovedOnly ? true : undefined,
        minRating: minRating > 0 ? minRating : undefined,
        search: debouncedSearch || undefined,
      })

      setVendors(data)
    } catch (err) {
      console.error('Error fetching vendors:', err)
      setError('Failed to load vendors')
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, categoryFilter, showApprovedOnly, minRating, debouncedSearch])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Add vendor
  const handleAddVendor = async (data: Partial<Vendor>) => {
    try {
      setIsSubmitting(true)
      await vendorApi.add({
        ...data,
        organizationId,
      })
      setShowAddDialog(false)
      await fetchData()
    } catch (err) {
      console.error('Error adding vendor:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Vendor actions
  const handleVendorAction = async (vendorId: string, action: string) => {
    try {
      switch (action) {
        case 'approve':
          await vendorApi.approve(vendorId)
          break
        case 'suspend':
          await vendorApi.suspend(vendorId, 'Manual suspension')
          break
        case 'rate':
          const vendor = vendors.find(v => v.id === vendorId)
          if (vendor) setSelectedVendor(vendor)
          return
      }
      await fetchData()
    } catch (err) {
      console.error(`Error ${action} vendor:`, err)
    }
  }

  // Stats
  const approvedCount = vendors.filter(v => v.isApproved).length
  const categoryStats = Object.entries(CATEGORY_CONFIG).map(([key]) => ({
    category: key as VendorCategory,
    count: vendors.filter(v => v.category === key).length,
  })).filter(s => s.count > 0)

  // Loading state
  if (isLoading && vendors.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Vendor Directory
          </h2>
          <p className="text-muted-foreground">
            {approvedCount} approved vendors out of {vendors.length} total
          </p>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Vendor</DialogTitle>
              <DialogDescription>
                Add a new vendor to your directory.
              </DialogDescription>
            </DialogHeader>
            <AddVendorForm
              onSubmit={handleAddVendor}
              onCancel={() => setShowAddDialog(false)}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Stats */}
      <div className="flex flex-wrap gap-2">
        {categoryStats.map(({ category, count }) => {
          const config = CATEGORY_CONFIG[category]
          return (
            <Badge
              key={category}
              variant="outline"
              className={cn('cursor-pointer', categoryFilter === category && config.color)}
              onClick={() => setCategoryFilter(
                categoryFilter === category ? 'all' : category
              )}
            >
              {config.label}: {count}
            </Badge>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select
          value={String(minRating)}
          onValueChange={(value) => setMinRating(Number(value))}
        >
          <SelectTrigger className="w-40">
            <Star className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Min rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any rating</SelectItem>
            <SelectItem value="3">3+ stars</SelectItem>
            <SelectItem value="4">4+ stars</SelectItem>
            <SelectItem value="4.5">4.5+ stars</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vendor Grid */}
      {vendors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-medium">No Vendors</h3>
            <p className="text-sm text-muted-foreground">
              Add vendors to your directory
            </p>
            <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Vendor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              onClick={() => setSelectedVendor(vendor)}
              onAction={(action) => handleVendorAction(vendor.id, action)}
            />
          ))}
        </div>
      )}

      {/* Vendor Detail Sheet */}
      <Sheet open={!!selectedVendor} onOpenChange={() => setSelectedVendor(null)}>
        {selectedVendor && (
          <VendorDetail
            vendor={selectedVendor}
            projectId={projectId}
            onClose={() => setSelectedVendor(null)}
            onRefresh={fetchData}
          />
        )}
      </Sheet>
    </div>
  )
}

export default VendorDirectory
