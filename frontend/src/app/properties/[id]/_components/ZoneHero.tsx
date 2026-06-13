'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { PropertyEnrichmentResponse } from '@/types/property';
import { Bed, Bath, Move, CheckCircle } from 'lucide-react';

interface ZoneHeroProps {
  property: PropertyEnrichmentResponse['property'];
}

export function ZoneHero({ property }: ZoneHeroProps) {
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('GHS');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const formatPrice = (amount: number, curr: 'GHS' | 'USD') => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const images = property.images.length > 0 ? property.images : ['/placeholder-property.jpg'];
  
  return (
    <div className="space-y-6">
      {/* Visual Section */}
      <div className="relative h-[400px] md:h-[500px] w-full rounded-xl overflow-hidden group">
        <Image
          src={images[currentImageIndex]}
          alt={property.property_type}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          priority
        />
        
        {/* Lightbox / Gallery Trigger */}
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" className="absolute bottom-4 right-4 z-10">
                    View All {images.length} Photos
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-7xl w-full h-[90vh] p-0 bg-background border-none">
                <div className="relative w-full h-full flex items-center justify-center">
                    <Image 
                        src={images[currentImageIndex]} 
                        alt="Gallery View" 
                        fill 
                        className="object-contain"
                    />
                    {/* Simple Navigation for Lightbox */}
                    <div className="absolute bottom-10 flex gap-2 overflow-x-auto max-w-full px-4">
                        {images.map((img, idx) => (
                            <button 
                                key={idx} 
                                onClick={() => setCurrentImageIndex(idx)}
                                className={`relative w-20 h-20 border-2 ${currentImageIndex === idx ? 'border-primary' : 'border-transparent'}`}
                            >
                                <Image src={img} alt={`Thumb ${idx}`} fill className="object-cover" />
                            </button>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* Overlay Metrics */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-6 text-foreground">
          <div className="flex justify-between items-end">
            <div>
              <div className="flex items-center gap-2 mb-2">
                 <Badge variant="outline" className="bg-green-500/20 text-green-100 border-green-500/50 backdrop-blur-sm">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Data Quality {Math.round(property.data_quality.trust_score * 100)}%
                 </Badge>
                 <span className="text-sm font-medium bg-background/40 px-2 py-0.5 rounded backdrop-blur-sm">
                    {property.status}
                 </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-1">
                {formatPrice(currency === 'GHS' ? property.price.ghs : property.price.usd, currency)}
              </h1>
              <div className="flex items-center gap-4 text-sm md:text-base text-gray-200">
                <span className="flex items-center gap-1"><Bed className="w-4 h-4" /> {property.beds} Beds</span>
                <span className="flex items-center gap-1"><Bath className="w-4 h-4" /> {property.baths} Baths</span>
                <span className="flex items-center gap-1"><Move className="w-4 h-4" /> {property.total_area_sqm || property.built_area_sqm || 'N/A'} m²</span>
              </div>
            </div>
            
            {/* Currency Toggle */}
            <div className="bg-card/10 backdrop-blur-md rounded-lg p-1 flex">
              <button 
                onClick={() => setCurrency('GHS')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${currency === 'GHS' ? 'bg-card text-foreground' : 'text-foreground hover:bg-card/20'}`}
              >
                GHS
              </button>
              <button 
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-card text-foreground' : 'text-foreground hover:bg-card/20'}`}
              >
                USD
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Thumbnail Strip (if multiple) */}
      {images.length > 1 && (
        <div className="flex gap-4 overflow-x-auto pb-2">
            {images.slice(0, 5).map((img, idx) => (
                <button 
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 transition-opacity ${currentImageIndex === idx ? 'ring-2 ring-primary' : 'opacity-70 hover:opacity-100'}`}
                >
                    <Image src={img} alt={`View ${idx}`} fill className="object-cover" />
                </button>
            ))}
        </div>
      )}
    </div>
  );
}
