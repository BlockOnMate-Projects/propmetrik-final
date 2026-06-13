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

// Fallback data shown only when the DB table is truly empty
const EMPTY_STATE_MESSAGE = 'No material prices available for this region yet.';

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
      if (!result || result.length === 0) {
        setData([]);
      } else {
        setData(result)
      }
    } catch (error) {
      console.error(error)
      setData([]);
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrices()
  }, [filterRegion, filterCategory])

  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            <div>
              <CardTitle className="text-foreground text-lg">Market Rates</CardTitle>
              <CardDescription className="text-muted-foreground text-xs">
                 Live from Data Hub
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchPrices} disabled={loading}>
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <div className="flex-1">
            <Label className="text-muted-foreground font-mono text-[10px] uppercase mb-1 block">Region</Label>
            <Select
              value={filterRegion}
              onValueChange={setFilterRegion}
            >
              <SelectTrigger className="h-8 bg-muted border-border font-mono text-xs">
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
            <Label className="text-muted-foreground font-mono text-[10px] uppercase mb-1 block">Material</Label>
            <Select
              value={filterCategory}
              onValueChange={setFilterCategory}
            >
              <SelectTrigger className="h-8 bg-muted border-border font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Materials</SelectItem>
                <SelectItem value="cement">Cement</SelectItem>
                <SelectItem value="steel">Steel / Iron</SelectItem>
                <SelectItem value="sand">Sand / Aggregates</SelectItem>
                <SelectItem value="paint">Paint / Finishes</SelectItem>
                <SelectItem value="plumbing">Plumbing / Tools</SelectItem>
                <SelectItem value="roofing">Roofing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead className="text-muted-foreground font-mono text-xs h-8">Item</TableHead>
                <TableHead className="text-muted-foreground font-mono text-xs text-right h-8">Price</TableHead>
                <TableHead className="text-muted-foreground font-mono text-xs text-right h-8">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-xs">
                    Loading market data...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-xs">
                    No data available for this selection
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id} className="border-border hover:bg-amber-50 dark:hover:bg-amber-500/10">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="font-semibold text-zinc-200">{item.material_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {item.specification || item.vendorName || 'Standard Spec'}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right text-emerald-600 dark:text-emerald-400 font-medium">
                      {item.unitPrice ? formatCurrency(item.unitPrice, item.currency || 'GHS') : 'N/A'}
                      <span className="text-muted-foreground text-[10px] ml-1">/{item.uom}</span>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-right text-muted-foreground">
                      {item.source || 'Scraper'}
                      <div className="text-muted-foreground">
                        {item.effectiveDate ? new Date(item.effectiveDate).toLocaleDateString('en-GB') : 'Recent'}
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
