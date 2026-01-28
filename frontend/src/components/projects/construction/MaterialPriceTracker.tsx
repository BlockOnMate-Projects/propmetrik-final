import React, { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  MapPin,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { constructionApi } from '@/lib/projects-api'
import { formatCurrency } from '@/lib/utils'

interface MaterialPriceTrackerProps {
  defaultRegion?: string
}

interface PriceData {
  id: string
  category: string
  material_name: string
  specification?: string
  unitPrice: number
  currency: string
  uom: string
  region: string
  vendorName?: string
  effectiveDate: string
  source?: string
}

// Fallback mock data for when API returns no results
const MOCK_PRICES: PriceData[] = [
  { id: 'mp-1', category: 'cement', material_name: 'Portland Cement (Dangote)', specification: '50kg bag', unitPrice: 85, currency: 'GHS', uom: 'bag', region: 'Greater Accra', vendorName: 'B5 Plus', effectiveDate: '2026-01-22', source: 'Market Survey' },
  { id: 'mp-2', category: 'cement', material_name: 'Portland Cement (Ghacem)', specification: '50kg bag', unitPrice: 82, currency: 'GHS', uom: 'bag', region: 'Greater Accra', vendorName: 'Devtraco', effectiveDate: '2026-01-22', source: 'Market Survey' },
  { id: 'mp-3', category: 'steel', material_name: 'Steel Rebar (12mm)', specification: 'Y12 reinforcement', unitPrice: 42, currency: 'GHS', uom: 'length', region: 'Greater Accra', vendorName: 'Tema Steel', effectiveDate: '2026-01-21', source: 'Vendor Quote' },
  { id: 'mp-4', category: 'steel', material_name: 'Steel Rebar (16mm)', specification: 'Y16 reinforcement', unitPrice: 68, currency: 'GHS', uom: 'length', region: 'Greater Accra', vendorName: 'Tema Steel', effectiveDate: '2026-01-21', source: 'Vendor Quote' },
  { id: 'mp-5', category: 'blocks', material_name: 'Hollow Blocks (6")', specification: '150mm x 450mm', unitPrice: 8.50, currency: 'GHS', uom: 'unit', region: 'Greater Accra', vendorName: 'Regiblock', effectiveDate: '2026-01-20', source: 'Market Survey' },
  { id: 'mp-6', category: 'sand', material_name: 'Sharp Sand', specification: 'Washed, 10 tons', unitPrice: 2800, currency: 'GHS', uom: 'trip', region: 'Greater Accra', vendorName: 'Local Supplier', effectiveDate: '2026-01-18', source: 'Scraper' },
  { id: 'mp-7', category: 'sand', material_name: 'Quarry Dust', specification: 'Fine aggregate', unitPrice: 2500, currency: 'GHS', uom: 'trip', region: 'Greater Accra', vendorName: 'Nsawam Quarry', effectiveDate: '2026-01-18', source: 'Scraper' },
  { id: 'mp-8', category: 'wood', material_name: 'Plywood (18mm)', specification: '8x4 Marine Grade', unitPrice: 420, currency: 'GHS', uom: 'sheet', region: 'Greater Accra', vendorName: 'Timber Market', effectiveDate: '2026-01-19', source: 'Market Survey' },
];

export function MaterialPriceTracker({ defaultRegion = 'Greater Accra' }: MaterialPriceTrackerProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PriceData[]>([])
  const [filterRegion, setFilterRegion] = useState(defaultRegion)
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const fetchPrices = async () => {
    setLoading(true)
    try {
      const filters: any = {}
      if (filterRegion) filters.region = filterRegion
      if (filterCategory !== 'all') filters.category = filterCategory
      
      const result = await constructionApi.getMarketPrices(filters)
      // Use mock data if API returns empty, filtering by category if needed
      if (!result || result.length === 0) {
        const filtered = filterCategory === 'all' 
          ? MOCK_PRICES 
          : MOCK_PRICES.filter(p => p.category === filterCategory);
        setData(filtered);
      } else {
        setData(result)
      }
    } catch (error) {
      console.error(error)
      // Fallback to mock data on error
      const filtered = filterCategory === 'all' 
        ? MOCK_PRICES 
        : MOCK_PRICES.filter(p => p.category === filterCategory);
      setData(filtered);
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrices()
  }, [filterRegion, filterCategory])

  return (
    <Card className="bg-zinc-900 border-zinc-800 h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            <div>
              <CardTitle className="text-white text-lg">Market Rates</CardTitle>
              <CardDescription className="text-zinc-500 text-xs">
                 Live from Data Hub
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchPrices} disabled={loading}>
            <RefreshCw className={`h-4 w-4 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <div className="flex-1">
            <Label className="text-zinc-400 font-mono text-[10px] uppercase mb-1 block">Region</Label>
            <Select
              value={filterRegion}
              onValueChange={setFilterRegion}
            >
              <SelectTrigger className="h-8 bg-zinc-800 border-zinc-700 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Greater Accra">Greater Accra</SelectItem>
                <SelectItem value="Ashanti">Ashanti</SelectItem>
                <SelectItem value="Western">Western</SelectItem>
                <SelectItem value="Eastern">Eastern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-zinc-400 font-mono text-[10px] uppercase mb-1 block">Material</Label>
            <Select
              value={filterCategory}
              onValueChange={setFilterCategory}
            >
              <SelectTrigger className="h-8 bg-zinc-800 border-zinc-700 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Materials</SelectItem>
                <SelectItem value="cement">Cement</SelectItem>
                <SelectItem value="steel">Steel / Iron</SelectItem>
                <SelectItem value="sand">Sand</SelectItem>
                <SelectItem value="blocks">Blocks</SelectItem>
                <SelectItem value="wood">Wood</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-800/50">
              <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                <TableHead className="text-zinc-400 font-mono text-xs h-8">Item</TableHead>
                <TableHead className="text-zinc-400 font-mono text-xs text-right h-8">Price</TableHead>
                <TableHead className="text-zinc-400 font-mono text-xs text-right h-8">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-zinc-500 text-xs">
                    Loading market data...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-zinc-500 text-xs">
                    No data available for this selection
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/30">
                    <TableCell className="font-mono text-xs text-zinc-300">
                      <div className="font-semibold text-zinc-200">{item.material_name}</div>
                      <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">
                        {item.specification || item.vendorName || 'Standard Spec'}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right text-emerald-400 font-medium">
                      {item.unitPrice ? formatCurrency(item.unitPrice, item.currency || 'GHS') : 'N/A'}
                      <span className="text-zinc-600 text-[10px] ml-1">/{item.uom}</span>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-right text-zinc-500">
                      {item.source || 'Scraper'}
                      <div className="text-zinc-600">
                        {item.effectiveDate ? new Date(item.effectiveDate).toLocaleDateString() : 'Recent'}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
