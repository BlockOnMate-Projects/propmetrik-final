'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

// Mock data
const marketData = {
  propertyIndex: { value: 1247.82, change: 2.34, trend: 'up' },
  avgPrice: { accra: 485000, kumasi: 245000, tema: 320000 },
  volume: { today: 23, thisWeek: 156, thisMonth: 892 },
}

const valuationQueue = [
  { id: 'VAL-2847', property: '4-Bed Villa, East Legon', status: 'PENDING', priority: 'HIGH', submitted: '2h ago' },
  { id: 'VAL-2846', property: 'Commercial Plot, Osu', status: 'IN REVIEW', priority: 'MED', submitted: '3h ago' },
  { id: 'VAL-2845', property: '3-Bed Apt, Cantonments', status: 'PENDING', priority: 'LOW', submitted: '5h ago' },
  { id: 'VAL-2844', property: 'Land, Tema Comm. 25', status: 'PENDING', priority: 'HIGH', submitted: '6h ago' },
  { id: 'VAL-2843', property: 'Office Space, Airport', status: 'COMPLETED', priority: 'MED', submitted: '1d ago' },
]

const dealPipeline = [
  { stage: 'LEAD', count: 45, value: 12500000 },
  { stage: 'QUALIFIED', count: 28, value: 8200000 },
  { stage: 'VIEWING', count: 15, value: 5100000 },
  { stage: 'OFFER', count: 8, value: 3200000 },
  { stage: 'CLOSING', count: 5, value: 2100000 },
]

const recentTransactions = [
  { id: 'TXN-1892', type: 'SALE', property: 'Residential', location: 'East Legon', value: 2450000, date: 'Today' },
  { id: 'TXN-1891', type: 'SALE', property: 'Commercial', location: 'Osu', value: 890000, date: 'Today' },
  { id: 'TXN-1890', type: 'LEASE', property: 'Office', location: 'Airport City', value: 45000, date: 'Yesterday' },
  { id: 'TXN-1889', type: 'SALE', property: 'Land', location: 'Tema', value: 1200000, date: 'Yesterday' },
  { id: 'TXN-1888', type: 'SALE', property: 'Residential', location: 'Cantonments', value: 3100000, date: '2d ago' },
]

const marketIndicators = [
  { area: 'East Legon', avgPrice: 685000, change: 5.2, volume: 34 },
  { area: 'Cantonments', avgPrice: 890000, change: 3.8, volume: 21 },
  { area: 'Airport Res.', avgPrice: 720000, change: 2.1, volume: 18 },
  { area: 'Osu', avgPrice: 450000, change: -1.2, volume: 42 },
  { area: 'Tema', avgPrice: 320000, change: -0.8, volume: 67 },
  { area: 'Kumasi', avgPrice: 245000, change: 4.5, volume: 89 },
]

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function StatBox({ label, value, change, prefix = '' }: { label: string; value: string | number; change?: number; prefix?: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-[10px] text-zinc-500 mb-1">{label}</div>
      <div className="font-mono text-lg text-white">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {change !== undefined && (
        <div className={cn('font-mono text-xs', change >= 0 ? 'text-green-400' : 'text-red-400')}>
          {change >= 0 ? '+' : ''}{change}%
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Top Stats Row */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <Panel title="TOTAL VALUATIONS">
          <StatBox label="ALL TIME" value={1247} change={12.5} />
        </Panel>
        <Panel title="THIS MONTH">
          <StatBox label="VALUATIONS" value={89} change={8.3} />
        </Panel>
        <Panel title="ACTIVE DEALS">
          <StatBox label="IN PIPELINE" value={34} change={5.2} />
        </Panel>
        <Panel title="PIPELINE VALUE">
          <StatBox label="TOTAL" value="35.4M" prefix="₵" />
        </Panel>
        <Panel title="PROPERTIES">
          <StatBox label="UNDER MGMT" value={1456} change={3.1} />
        </Panel>
        <Panel title="AVG PRICE">
          <StatBox label="ACCRA" value="485K" prefix="₵" change={2.34} />
        </Panel>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-3">
        {/* Valuation Queue */}
        <Panel title="VALUATION QUEUE" className="col-span-5">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2">ID</th>
                <th className="text-left pb-2">PROPERTY</th>
                <th className="text-left pb-2">STATUS</th>
                <th className="text-left pb-2">PRI</th>
                <th className="text-right pb-2">TIME</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {valuationQueue.map((item) => (
                <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 text-amber-500">{item.id}</td>
                  <td className="py-2 text-white truncate max-w-[180px]">{item.property}</td>
                  <td className="py-2">
                    <span className={cn(
                      'px-1.5 py-0.5 text-[10px]',
                      item.status === 'COMPLETED' && 'bg-green-900/50 text-green-400',
                      item.status === 'PENDING' && 'bg-yellow-900/50 text-yellow-400',
                      item.status === 'IN REVIEW' && 'bg-blue-900/50 text-blue-400'
                    )}>
                      {item.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={cn(
                      'text-[10px]',
                      item.priority === 'HIGH' && 'text-red-400',
                      item.priority === 'MED' && 'text-yellow-400',
                      item.priority === 'LOW' && 'text-zinc-400'
                    )}>
                      {item.priority}
                    </span>
                  </td>
                  <td className="py-2 text-right text-zinc-500">{item.submitted}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <Link href="/dashboard/valuations" className="font-mono text-[10px] text-amber-500 hover:text-amber-400">
              VIEW ALL VALUATIONS →
            </Link>
          </div>
        </Panel>

        {/* Deal Pipeline */}
        <Panel title="DEAL PIPELINE" className="col-span-4">
          <div className="space-y-2">
            {dealPipeline.map((stage) => (
              <div key={stage.stage} className="flex items-center gap-3">
                <div className="w-20 font-mono text-[10px] text-zinc-400">{stage.stage}</div>
                <div className="flex-1 h-4 bg-zinc-800 relative">
                  <div
                    className="h-full bg-amber-500/80"
                    style={{ width: `${(stage.count / 45) * 100}%` }}
                  />
                  <span className="absolute right-2 top-0 h-full flex items-center font-mono text-[10px] text-white">
                    {stage.count}
                  </span>
                </div>
                <div className="w-24 text-right font-mono text-xs text-green-400">
                  ₵{(stage.value / 1000000).toFixed(1)}M
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-between">
            <div>
              <span className="font-mono text-[10px] text-zinc-500">TOTAL PIPELINE</span>
              <span className="font-mono text-sm text-white ml-2">₵35.4M</span>
            </div>
            <Link href="/dashboard/deals" className="font-mono text-[10px] text-amber-500 hover:text-amber-400">
              MANAGE DEALS →
            </Link>
          </div>
        </Panel>

        {/* Market Indicators */}
        <Panel title="MARKET INDICATORS" className="col-span-3">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2">AREA</th>
                <th className="text-right pb-2">AVG</th>
                <th className="text-right pb-2">CHG</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {marketIndicators.map((item) => (
                <tr key={item.area} className="border-b border-zinc-800/50">
                  <td className="py-1.5 text-white">{item.area}</td>
                  <td className="py-1.5 text-right text-zinc-300">₵{(item.avgPrice / 1000).toFixed(0)}K</td>
                  <td className={cn('py-1.5 text-right', item.change >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {item.change >= 0 ? '+' : ''}{item.change}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <Link href="/dashboard/analytics" className="font-mono text-[10px] text-amber-500 hover:text-amber-400">
              FULL ANALYTICS →
            </Link>
          </div>
        </Panel>

        {/* Recent Transactions */}
        <Panel title="RECENT TRANSACTIONS" className="col-span-7">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2">ID</th>
                <th className="text-left pb-2">TYPE</th>
                <th className="text-left pb-2">PROPERTY</th>
                <th className="text-left pb-2">LOCATION</th>
                <th className="text-right pb-2">VALUE</th>
                <th className="text-right pb-2">DATE</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {recentTransactions.map((txn) => (
                <tr key={txn.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 text-amber-500">{txn.id}</td>
                  <td className="py-2">
                    <span className={cn(
                      'px-1.5 py-0.5 text-[10px]',
                      txn.type === 'SALE' && 'bg-green-900/50 text-green-400',
                      txn.type === 'LEASE' && 'bg-blue-900/50 text-blue-400'
                    )}>
                      {txn.type}
                    </span>
                  </td>
                  <td className="py-2 text-white">{txn.property}</td>
                  <td className="py-2 text-zinc-400">{txn.location}</td>
                  <td className="py-2 text-right text-green-400">₵{txn.value.toLocaleString()}</td>
                  <td className="py-2 text-right text-zinc-500">{txn.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Quick Actions */}
        <Panel title="QUICK ACTIONS" className="col-span-5">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/dashboard/valuations/new"
              className="p-3 border border-zinc-700 hover:border-amber-500 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="font-mono text-xs text-amber-500">F1</div>
              <div className="font-mono text-sm text-white mt-1">NEW VALUATION</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-0.5">Start property assessment</div>
            </Link>
            <Link
              href="/dashboard/deals/new"
              className="p-3 border border-zinc-700 hover:border-amber-500 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="font-mono text-xs text-amber-500">F2</div>
              <div className="font-mono text-sm text-white mt-1">CREATE DEAL</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-0.5">Add to pipeline</div>
            </Link>
            <Link
              href="/dashboard/data-hub"
              className="p-3 border border-zinc-700 hover:border-amber-500 hover:bg-zinc-800/50 transition-colors col-span-2"
            >
              <div className="font-mono text-xs text-amber-500">F3</div>
              <div className="font-mono text-sm text-white mt-1">DATA HUB</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-0.5">Manage data sources</div>
            </Link>
          </div>
        </Panel>
      </div>

      {/* Footer Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-6 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-4 font-mono text-[10px]">
        <div className="flex items-center gap-4">
          <span className="text-green-500">● SYSTEM ONLINE</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400">LAST SYNC: 2 MIN AGO</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400">DB: CONNECTED</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-zinc-400">PROPMETRIK v2.0</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400">© 2026 CEDYN GROUP</span>
        </div>
      </div>
    </div>
  )
}
