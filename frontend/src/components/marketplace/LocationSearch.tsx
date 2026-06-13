// LocationSearch Component - Autocomplete location search
'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

interface LocationSearchProps {
  onSelect: (location: any) => void;
  placeholder?: string;
}

export function LocationSearch({ onSelect, placeholder = 'Search location...' }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await authedFetch(`/api/marketplace/autocomplete?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setShowDropdown(true);
      } catch (error) {
        console.error('Autocomplete error:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query]);

  const handleSelect = (suggestion: any) => {
    setQuery(suggestion.place_name);
    setShowDropdown(false);
    onSelect(suggestion);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="w-full pl-14 pr-14 py-4 border-2 border-gray-300 rounded-xl text-gray-900 bg-card placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all text-base shadow-lg"
        />
        {loading && (
          <Loader2 className="absolute right-5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-indigo-600 animate-spin" />
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id || index}
                onClick={() => handleSelect(suggestion)}
                className="w-full px-5 py-4 flex items-start gap-3 hover:bg-muted transition-colors text-left group"
              >
                <MapPin className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5 group-hover:text-indigo-700 transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600">
                    {suggestion.place_name}
                  </p>
                  {suggestion.context && suggestion.context.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {suggestion.context.map((ctx: any) => ctx.text).join(', ')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
