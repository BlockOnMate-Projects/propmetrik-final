// FilterPanel Component - Sidebar with search filters
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface FilterPanelProps {
  filters: any;
  onFilterChange: (filters: any) => void;
  aggregations?: any;
}

export function FilterPanel({ filters, onFilterChange, aggregations }: FilterPanelProps) {
  const [priceRange, setPriceRange] = useState({
    min: filters.min_price || '',
    max: filters.max_price || ''
  });

  const handleClearFilters = () => {
    onFilterChange({ transaction_type: 'all', sort_by: 'created_at', sort_order: 'desc' });
    setPriceRange({ min: '', max: '' });
  };

  const activeFilterCount = 
    (filters.property_types?.length || 0) +
    (filters.min_price ? 1 : 0) +
    (filters.max_price ? 1 : 0) +
    (filters.bedrooms ? 1 : 0) +
    (filters.bathrooms ? 1 : 0) +
    (filters.amenities?.length || 0) +
    (filters.region ? 1 : 0) +
    (filters.parking_spaces ? 1 : 0) +
    (filters.listed_within_days ? 1 : 0);

  return (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <h3 className="font-bold text-lg text-gray-900">Filters</h3>
        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 transition-colors font-medium"
          >
            <X className="h-4 w-4" />
            Clear ({activeFilterCount})
          </button>
        )}
      </div>
      
      {/* Transaction Type */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Transaction Type</label>
        <div className="grid grid-cols-3 gap-2">
          {['all', 'rental', 'sale'].map(type => (
            <button
              key={type}
              onClick={() => onFilterChange({ ...filters, transaction_type: type })}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                filters.transaction_type === type
                  ? 'bg-indigo-600 text-foreground shadow-lg shadow-indigo-600/50'
                  : 'bg-muted text-gray-700 hover:bg-gray-200 border border-border'
              }`}
            >
              {type === 'all' ? 'All' : type === 'rental' ? 'Rent' : 'Buy'}
            </button>
          ))}
        </div>
      </div>

      {/* Region */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Region</label>
        <select
          value={filters.region || ''}
          onChange={(e) => onFilterChange({ ...filters,region: e.target.value || undefined })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 bg-card text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="">All Regions</option>
          <option value="greater_accra">Greater Accra</option>
          <option value="ashanti">Ashanti</option>
          <option value="western">Western</option>
          <option value="eastern">Eastern</option>
          <option value="central">Central</option>
          <option value="northern">Northern</option>
        </select>
      </div>

      {/* Property Type */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Property Type</label>
        <div className="space-y-2">
          {['Apartment', 'House', 'Villa', 'Townhouse', 'Studio'].map(type => {
            const isSelected = filters.property_types?.includes(type.toLowerCase());
            
            return (
              <label key={type} className="flex items-center justify-between cursor-pointer hover:bg-muted p-2.5 rounded-lg transition-colors group">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const newTypes = e.target.checked
                        ? [...(filters.property_types || []), type.toLowerCase()]
                        : (filters.property_types || []).filter((t: string) => t !== type.toLowerCase());
                      onFilterChange({ ...filters, property_types: newTypes.length > 0 ? newTypes : undefined });
                    }}
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{type}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Price Range */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Price Range (GHS)</label>
        <div className="flex gap-2 mb-3">
          <input 
            type="number"
            placeholder="Min"
            value={priceRange.min}
            onChange={(e) => {
              setPriceRange({ ...priceRange, min: e.target.value });
              onFilterChange({ ...filters, min_price: parseInt(e.target.value) || undefined });
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-card text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="self-center text-muted-foreground">→</span>
          <input 
            type="number"
            placeholder="Max"
            value={priceRange.max}
            onChange={(e) => {
              setPriceRange({ ...priceRange, max: e.target.value });
              onFilterChange({ ...filters, max_price: parseInt(e.target.value) || undefined });
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-card text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Quick Price Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: '<500', max: 500 },
            { label: '500-1K', min: 500, max: 1000 },
            { label: '1K-2K', min: 1000, max: 2000 },
            { label: '2K+', min: 2000 }
          ].map(range => (
            <button
              key={range.label}
              onClick={() => {
                setPriceRange({ min: range.min?.toString() || '', max: range.max?.toString() || '' });
                onFilterChange({ ...filters, min_price: range.min, max_price: range.max });
              }}
              className="text-xs px-3 py-1.5 bg-muted hover:bg-gray-200 border border-border rounded-lg text-gray-700 hover:text-gray-900 transition-colors"
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Bedrooms */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Bedrooms</label>
        <div className="grid grid-cols-5 gap-2">
          {['Any', '1+', '2+', '3+', '4+'].map((label, index) => {
            const value = index === 0 ? undefined : index;
            
            return (
              <button
                key={label}
                onClick={() => onFilterChange({ ...filters, bedrooms: value })}
                className={`px-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  filters.bedrooms === value
                    ? 'bg-indigo-600 text-foreground shadow-lg shadow-indigo-600/50'
                    : 'bg-muted text-gray-700 hover:bg-gray-200 border border-border'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bathrooms */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Bathrooms</label>
        <div className="grid grid-cols-5 gap-2">
          {['Any', '1+', '2+', '3+', '4+'].map((label, index) => {
            const value = index === 0 ? undefined : index;
            
            return (
              <button
                key={label}
                onClick={() => onFilterChange({ ...filters, bathrooms: value })}
                className={`px-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  filters.bathrooms === value
                    ? 'bg-indigo-600 text-foreground shadow-lg shadow-indigo-600/50'
                    : 'bg-muted text-gray-700 hover:bg-gray-200 border border-border'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Parking */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Parking</label>
        <div className="grid grid-cols-4 gap-2">
          {['Any', '1+', '2+', '3+'].map((label, index) => {
            const value = index === 0 ? undefined : index;

            return (
              <button
                key={label}
                onClick={() => onFilterChange({ ...filters, parking_spaces: value })}
                className={`px-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  filters.parking_spaces === value
                    ? 'bg-indigo-600 text-foreground shadow-lg shadow-indigo-600/50'
                    : 'bg-muted text-gray-700 hover:bg-gray-200 border border-border'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Amenities */}
      <div className="mb-2">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Amenities</label>
        <div className="space-y-2">
          {['Pool', 'Gym', 'Parking', 'Security', 'Garden', 'Balcony'].map(amenity => {
            const isSelected = filters.amenities?.includes(amenity.toLowerCase());
            
            return (
              <label key={amenity} className="flex items-center cursor-pointer hover:bg-muted p-2.5 rounded-lg transition-colors group">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    const newAmenities = e.target.checked
                      ? [...(filters.amenities || []), amenity.toLowerCase()]
                      : (filters.amenities || []).filter((a: string) => a !== amenity.toLowerCase());
                    onFilterChange({ ...filters, amenities: newAmenities.length > 0 ? newAmenities : undefined });
                  }}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 focus:ring-2 mr-3"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{amenity}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Listed Within */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Listed Within</label>
        <select
          value={filters.listed_within_days || ''}
          onChange={(e) => onFilterChange({ ...filters, listed_within_days: parseInt(e.target.value) || undefined })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 bg-card text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="">Any time</option>
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>
    </div>
  );
}
