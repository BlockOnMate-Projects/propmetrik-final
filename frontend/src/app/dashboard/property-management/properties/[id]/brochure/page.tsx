'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Building2,
    MapPin,
    ArrowLeft,
    Printer,
    Download,
    BedDouble,
    Bath,
    Square,
    Share2,
    Globe,
    CheckCircle2,
    Loader2,
    ImageIcon,
    AlertTriangle,
    Copy,
    Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Property, PropertyDocument } from '@/types/property-management'
import { QRCodeCanvas } from 'qrcode.react'

export default function PropertyBrochurePage() {
    const params = useParams()
    const router = useRouter()
    const propertyId = params.id as string

    const [property, setProperty] = useState<Property | null>(null)
    const [images, setImages] = useState<PropertyDocument[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const loadData = async () => {
            try {
                setError(null)
                const [propRes, docsRes] = await Promise.all([
                    propertyManagementApi.getPropertyById(propertyId),
                    propertyManagementApi.getDocuments({ propertyId, type: 'property_photos' })
                ])
                setProperty(propRes)
                setImages(Array.isArray(docsRes) ? docsRes : docsRes.data || [])
            } catch (err) {
                console.error('Failed to load brochure data:', err)
                setError('Failed to load property data. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }
        if (propertyId) loadData()
    }, [propertyId])

    const handleShare = async () => {
        const shareUrl = `${window.location.origin}/dashboard/property-management/properties/${propertyId}/brochure`
        if (navigator.share) {
            await navigator.share({
                title: property?.title || 'Property Brochure',
                text: `View the brochure for ${property?.title}`,
                url: shareUrl
            })
        } else {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-black space-y-4">
                <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
                <p className="text-zinc-500 font-mono text-xs uppercase">Rendering High-Fidelity Asset Brochure...</p>
            </div>
        )
    }

    if (error || !property) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-black space-y-6">
                <div className="p-8 bg-red-950/20 border border-red-900 rounded-lg text-center max-w-md">
                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white font-mono uppercase mb-2">Brochure Generation Failed</h2>
                    <p className="text-red-400 font-mono text-sm mb-4">{error || 'Property not found'}</p>
                    <Button 
                        variant="outline" 
                        onClick={() => router.back()}
                        className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Return to Property
                    </Button>
                </div>
            </div>
        )
    }

    // Helper to get image URL or placeholder
    const getImageUrl = (index: number) => {
        if (images[index]) return images[index].fileUrl
        return null
    }

    // Format Region with proper casing
    const formatRegion = (region: string) => {
        return region
            .replace(/_/g, ' ')
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
    }

    const formattedLocation = `${formatRegion(property.region)}, Ghana`

    return (
        <div className="min-h-screen bg-white text-black print:bg-white print:text-black">
            <style jsx global>{`
                @media print {
                    body {
                        background-color: white !important;
                        color: black !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-black-text {
                        color: black !important;
                    }
                    .print-white-bg {
                        background-color: white !important;
                        border: 1px solid #e5e5e5 !important;
                    }
                    .print-no-shadow {
                        box-shadow: none !important;
                    }
                    .print-force-light {
                        background-color: #fafafa !important;
                        color: black !important;
                    }
                }
            `}</style>

            {/* Top Navigation - Hidden on Print */}
            <div className="max-w-5xl mx-auto p-6 flex items-center justify-between border-b border-zinc-100 print:hidden">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-black"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    BACK TO ASSET
                </Button>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-zinc-200"
                        onClick={handleShare}
                    >
                        {copied ? (
                            <>
                                <Check className="h-3 w-3 mr-2 text-green-600" />
                                COPIED!
                            </>
                        ) : (
                            <>
                                <Share2 className="h-3 w-3 mr-2" />
                                SHARE
                            </>
                        )}
                    </Button>
                    <Button variant="outline" size="sm" className="border-zinc-200" onClick={() => window.print()}>
                        <Printer className="h-3 w-3 mr-2" />
                        PRINT
                    </Button>
                    <Button
                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs"
                        onClick={() => window.print()}
                    >
                        <Download className="h-3 w-3 mr-2" />
                        DOWNLOAD PDF
                    </Button>
                </div>
            </div>

            {/* Brochure Content */}
            <div className="max-w-5xl mx-auto p-8 md:p-12 space-y-12 print:p-0">
                {/* Hero Feature */}
                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                                {property.transactionType} • {formatRegion(property.propertyType)}
                            </Badge>
                            <h1 className="text-4xl md:text-6xl font-serif font-light leading-tight text-neutral-900 italic">
                                {property.title}
                            </h1>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-neutral-500 font-sans">
                                    <MapPin className="h-4 w-4 text-amber-600" />
                                    <span className="text-sm uppercase tracking-wider">{property.addressCity}, {formattedLocation}</span>
                                </div>
                                {property.digitalAddress && (
                                    <div className="flex items-center gap-2 text-neutral-400 font-mono text-[10px] uppercase ml-6">
                                        <span>Digital Address: {property.digitalAddress}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-8 py-6 border-y border-neutral-100">
                            <div className="text-center">
                                <p className="text-[10px] text-neutral-400 uppercase tracking-tighter mb-1">Price</p>
                                <p className="text-xl font-serif font-bold text-neutral-900">{property.priceCurrency} {property.price.toLocaleString()}</p>
                            </div>
                            <div className="h-8 w-px bg-neutral-100" />
                            <div className="flex items-center gap-6">
                                <div className="text-center">
                                    <BedDouble className="h-4 w-4 text-neutral-300 mx-auto mb-1" />
                                    <p className="text-xs font-bold">{property.bedrooms || '0'}</p>
                                </div>
                                <div className="text-center">
                                    <Bath className="h-4 w-4 text-neutral-300 mx-auto mb-1" />
                                    <p className="text-xs font-bold">{property.bathrooms || '0'}</p>
                                </div>
                                <div className="text-center">
                                    <Square className="h-4 w-4 text-neutral-300 mx-auto mb-1" />
                                    <p className="text-xs font-bold">{property.totalAreaSqm || '0'}m²</p>
                                </div>
                            </div>
                        </div>

                        <p className="text-neutral-600 leading-relaxed font-serif text-lg italic">
                            {property.description || "A masterfully designed residence offering unparalleled sophistication and modern comforts. This exquisite property exemplifies luxury living in the heart of Ghana's most sought-after district."}
                        </p>
                    </div>

                    <div className="aspect-[4/5] bg-neutral-50 border border-neutral-100 rounded-sm flex items-center justify-center relative overflow-hidden group print:border-none">
                        {getImageUrl(0) ? (
                            <img src={getImageUrl(0)!} alt="Main Property View" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        ) : (
                            <Building2 className="h-32 w-32 text-neutral-100 group-hover:scale-110 transition-transform duration-700" />
                        )}
                        <div className="absolute top-4 right-4 h-12 w-12 border-t-2 border-r-2 border-amber-600" />
                        <div className="absolute bottom-4 left-4 h-12 w-12 border-b-2 border-l-2 border-amber-600" />
                    </div>
                </div>

                {/* Gallery Placeholder Grid */}
                <div className="grid grid-cols-3 gap-4 h-64">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-neutral-50 rounded-sm flex items-center justify-center border border-neutral-100 overflow-hidden relative group print:border-none">
                            {getImageUrl(i) ? (
                                <img src={getImageUrl(i)!} alt={`Gallery ${i}`} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <ImageIcon className="h-6 w-6 text-neutral-200" />
                                    <span className="text-[10px] text-neutral-300 uppercase font-bold tracking-widest">
                                        {i === 1 ? 'Interior Perspective' : i === 2 ? 'Culinary Suite' : 'Outdoor Living'}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Highlights Table */}
                <div className="grid md:grid-cols-3 gap-12 bg-neutral-900 text-white p-12 rounded-sm shadow-2xl relative overflow-hidden print:bg-neutral-100 print:text-black print:shadow-none print:border print:border-neutral-200">
                    <div className="absolute top-0 right-0 p-4 opacity-10 print:hidden">
                        <Building2 className="h-48 w-48 text-white rotate-12" />
                    </div>

                    <div className="md:col-span-2 space-y-8 relative z-10">
                        <h3 className="text-2xl font-serif text-amber-500 italic lowercase tracking-tighter print:text-amber-600">unmatched specifications.</h3>
                        <div className="grid grid-cols-2 gap-y-4">
                            {[
                                `${property.bedrooms || 0} Bed / ${property.bathrooms || 0} Bath`,
                                `${property.totalAreaSqm || 0} SQM Total Area`,
                                `${property.floors || 1} Floor(s)`,
                                "Prime Urban Elevation",
                                "Reinforced Structural Integrity",
                                "Sustainable Energy ready",
                                "High-Security Thresholds",
                                "Expansive Floor Volume"
                            ].map((spec) => (
                                <div key={spec} className="flex items-center gap-3">
                                    <CheckCircle2 className="h-3 w-3 text-amber-500" />
                                    <span className="text-xs uppercase tracking-widest text-neutral-400 font-bold print:text-neutral-600">{spec}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="text-center space-y-4 border-l border-neutral-800 md:pl-12 relative z-10 print:border-neutral-300">
                        <div className="bg-white p-2 mx-auto rounded-sm inline-block shadow-sm">
                            <QRCodeCanvas
                                value={`https://propmetrik.com/property/${propertyId}`}
                                size={100}
                                level="H"
                                includeMargin={false}
                            />
                        </div>
                        <p className="text-[9px] text-neutral-500 uppercase font-bold tracking-widest leading-loose">
                            Scan to view dynamic data hub integration and immersive 3D walkthrough
                        </p>
                    </div>
                </div>

                {/* Footer Credits */}
                <div className="flex flex-col md:flex-row justify-between items-center py-12 border-t border-neutral-100 gap-8">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-black flex items-center justify-center rounded-sm">
                            <span className="text-amber-500 font-bold text-lg">P</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-neutral-900">PROPMETRIK TERMINAL</p>
                            <p className="text-[10px] text-neutral-400 uppercase tracking-widest">Asset Management Protocol</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-neutral-400 hover:text-amber-600 transition-colors cursor-pointer group">
                            <Globe className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest group-hover:underline">propmetrik.com</span>
                        </div>
                        <div className="flex items-center gap-2 text-neutral-400 hover:text-amber-600 transition-colors cursor-pointer group">
                            <Share2 className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest group-hover:underline">share digital link</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Disclaimer */}
            <div className="hidden print:block text-[8px] text-neutral-400 text-center py-8">
                © 2026 Cedyn Group. All data extracted from PROPMETRIK Data Hub V2 (Live-Sync).
                Prices and availability subject to terminal volatility index.
            </div>
        </div>
    )
}
