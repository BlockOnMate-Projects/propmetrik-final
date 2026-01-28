import Link from 'next/link';
import Image from 'next/image';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface Property {
  id: string;
  title: string;
  price: string | number;
  price_currency: string;
  bedrooms: number;
  bathrooms: number;
  total_area_sqm: number;
  region: string;
  property_type: string;
  transaction_type: 'sale' | 'rental';
  rental_period: string | null;
  status: string;
  images: string[];
  latitude: number;
  longitude: number;
  address_street: string | null;
  address_city: string | null;
  landmark: string | null;
  created_at: string;
}

interface PropertiesResponse {
  success: boolean;
  count: number;
  total: { sale?: number; rental?: number };
  data: Property[];
}

async function getProperties(type?: string): Promise<{ properties: Property[]; total: { sale?: number; rental?: number } }> {
  const apiUrl = process.env.NEXT_PUBLIC_INTERNAL_API_URL || 'http://localhost:4000';
  const typeParam = type ? `&type=${type}` : '';
  
  try {
    const res = await fetch(`${apiUrl}/api/public/properties?limit=50${typeParam}`, {
      cache: 'no-store',
      next: { revalidate: 0 }
    });

    if (!res.ok) {
      throw new Error(`Backend API Error: ${res.status} ${res.statusText}`);
    }

    const json: PropertiesResponse = await res.json();
    return { properties: json.data || [], total: json.total || {} };
  } catch (error) {
    console.error("Error fetching properties:", error);
    throw new Error(`Failed to connect to backend: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function PropertiesListPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let properties: Property[] = [];
  let total: { sale?: number; rental?: number } = {};
  let error: string | null = null;
  const activeType = params.type || 'all';

  try {
    const result = await getProperties(params.type);
    properties = result.properties;
    total = result.total;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load properties';
  }

  const formatPrice = (property: Property) => {
    const price = Number(property.price);
    const currency = property.price_currency || 'GHS';
    const formatted = price.toLocaleString('en-US', { style: 'currency', currency });
    
    if (property.transaction_type === 'rental') {
      const period = property.rental_period || 'month';
      return `${formatted}/${period}`;
    }
    return formatted;
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ghana Real Estate</h1>
          <p className="text-gray-500 mt-1">
            {properties.length} listings found
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
          <Link 
            href="/properties"
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeType === 'all' 
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            All ({(total.sale || 0) + (total.rental || 0)})
          </Link>
          <Link 
            href="/properties?type=sale"
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeType === 'sale' 
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            For Sale ({total.sale || 0})
          </Link>
          <Link 
            href="/properties?type=rental"
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeType === 'rental' 
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            For Rent ({total.rental || 0})
          </Link>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
            <strong className="font-bold">Connection Error: </strong>
            <span className="block sm:inline">{error}</span>
            <p className="text-sm mt-2">Please ensure the backend server is running on port 4000.</p>
          </div>
        )}

        {/* Empty State */}
        {!error && properties.length === 0 && (
          <div className="text-center py-20">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No properties found</h3>
            <p className="text-gray-500">Try checking back later.</p>
          </div>
        )}

        {/* Property Grid */}
        {!error && properties.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => (
              <Link 
                key={property.id} 
                href={`/properties/${property.id}`}
                className="group block bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 dark:border-gray-700"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-200">
                  {property.images && property.images.length > 0 ? (
                    <Image
                      src={property.images[0]}
                      alt={property.title || 'Property Image'}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      No Image
                    </div>
                  )}
                  
                  {/* Transaction Type Badge */}
                  <div className={`absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded ${
                    property.transaction_type === 'sale'
                      ? 'bg-blue-500 text-white'
                      : 'bg-purple-500 text-white'
                  }`}>
                    {property.transaction_type === 'sale' ? 'FOR SALE' : 'FOR RENT'}
                  </div>
                  
                  {/* Property Type Badge */}
                  <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                    {property.property_type?.toUpperCase() || 'PROPERTY'}
                  </div>
                </div>
                
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                      {formatPrice(property)}
                    </h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      property.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {property.status}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-3 h-10">
                    {property.title}
                  </p>
                  
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 space-x-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <div className="flex items-center">
                      <span className="font-bold mr-1">{property.bedrooms || 0}</span> bds
                    </div>
                    <div className="flex items-center">
                      <span className="font-bold mr-1">{property.bathrooms || 0}</span> ba
                    </div>
                    <div className="flex items-center">
                      <span className="font-bold mr-1">{property.total_area_sqm || 0}</span> sqm
                    </div>
                  </div>
                  
                  {/* Address with location indicator */}
                  <div className="mt-3 flex items-start gap-2">
                    {property.latitude && property.longitude && (
                      <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                    )}
                    <div className="text-xs text-gray-400 truncate">
                      {property.address_street || property.landmark || property.address_city || property.region?.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
