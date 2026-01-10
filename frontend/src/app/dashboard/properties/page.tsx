'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useState } from 'react'

// Mock data
const properties = [
  { id: 'PRO-3892', name: '4-Bed Villa', location: 'East Legon', type: 'RESIDENTIAL', status: 'LISTED', value: 2450000, size: '450 sqm', built: 2021 },
  { id: 'PRO-3891', name: 'Commercial Plot', location: 'Osu', type: 'COMMERCIAL', status: 'AVAILABLE', value: 890000, size: '1200 sqm', built: null },
  { id: 'PRO-3890', name: 'Office Space', location: 'Airport City', type: 'COMMERCIAL', status: 'LEASED', value: 1200000, size: '280 sqm', built: 2019 },
  { id: 'PRO-3889', name: 'Land Parcel', location: 'Tema Comm. 25', type: 'LAND', status: 'LISTED', value: 450000, size: '2 acres', built: null },
  { id: 'PRO-3888', name: '3-Bed Apartment', location: 'Cantonments', type: 'RESIDENTIAL', status: 'MANAGED', value: 680000, size: '180 sqm', built: 2020 },
  { id: 'PRO-3887', name: 'Warehouse', location: 'Tema Industrial', type: 'INDUSTRIAL', status: 'LEASED', value: 980000, size: '800 sqm', built: 2015 },
  { id: 'PRO-3886', name: '5-Bed House', location: 'Trasacco', type: 'RESIDENTIAL', status: 'SOLD', value: 3500000, size: '600 sqm', built: 2022 },
  { id: 'PRO-3885', name: '2-Bed Flat', location: 'Achimota', type: 'RESIDENTIAL', status: 'AVAILABLE', value: 320000, size: '120 sqm', built: 2018 },
]

const stats = {
  total: 3892,
  listed: 234,
  managed: 1456,
  available: 412,
  leased: 890,
  sold: 900,
}

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

export default function PropertiesPage() {
  const [filter, setFilter] = useState<string>('ALL')

  const filteredProperties = filter === 'ALL'
    ? properties
    : properties.filter(p => p.status === filter)

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-white">PROPERTY DATABASE</h1>
          <p className="font-mono text-[10px] text-zinc-500">Asset Registry & Portfolio Management</p>
        </div>
        <Link
          href="/dashboard/properties/new"
          className="px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
        >
          + ADD PROPERTY
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <Panel title="TOTAL">
          <div className="text-center">
            <div className="font-mono text-2xl text-white">{stats.total.toLocaleString()}</div>
            <div className="font-mono text-[10px] text-zinc-500">PROPERTIES</div>
          </div>
        </Panel>
        <Panel title="LISTED">
          <div className="text-center">
            <div className="font-mono text-2xl text-amber-400">{stats.listed}</div>
            <div className="font-mono text-[10px] text-zinc-500">FOR SALE</div>
          </div>
        </Panel>
        <Panel title="MANAGED">
          <div className="text-center">
            <div className="font-mono text-2xl text-blue-400">{stats.managed.toLocaleString()}</div>
            <div className="font-mono text-[10px] text-zinc-500">UNDER MGMT</div>
          </div>
        </Panel>
        <Panel title="AVAILABLE">
          <div className="text-center">
            <div className="font-mono text-2xl text-green-400">{stats.available}</div>
            <div className="font-mono text-[10px] text-zinc-500">FOR RENT/SALE</div>
          </div>
        </Panel>
        <Panel title="LEASED">
          <div className="text-center">
            <div className="font-mono text-2xl text-purple-400">{stats.leased}</div>
            <div className="font-mono text-[10px] text-zinc-500">RENTED OUT</div>
          </div>
        </Panel>
        <Panel title="SOLD">
          <div className="text-center">
            <div className="font-mono text-2xl text-zinc-400">{stats.sold}</div>
            <div className="font-mono text-[10px] text-zinc-500">COMPLETED</div>
          </div>
        </Panel>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4">
        {['ALL', 'LISTED', 'AVAILABLE', 'MANAGED', 'LEASED', 'SOLD'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 font-mono text-xs transition-colors',
              filter === f
                ? 'bg-amber-500 text-black font-bold'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Properties Table */}
      <Panel title="PROPERTY REGISTRY">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
              <th className="text-left pb-2 w-24">ID</th>
              <th className="text-left pb-2">NAME</th>
              <th className="text-left pb-2 w-28">LOCATION</th>
              <th className="text-left pb-2 w-24">TYPE</th>
              <th className="text-left pb-2 w-24">STATUS</th>
              <th className="text-right pb-2 w-28">VALUE</th>
              <th className="text-right pb-2 w-24">SIZE</th>
              <th className="text-right pb-2 w-16">BUILT</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {filteredProperties.map((prop) => (
              <tr key={prop.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer">
                <td className="py-2 text-amber-500">{prop.id}</td>
                <td className="py-2 text-white">{prop.name}</td>
                <td className="py-2 text-zinc-400">{prop.location}</td>
                <td className="py-2">
                  <span className={cn(
                    'px-1.5 py-0.5 text-[10px]',
                    prop.type === 'RESIDENTIAL' && 'bg-blue-900/50 text-blue-400',
                    prop.type === 'COMMERCIAL' && 'bg-purple-900/50 text-purple-400',
                    prop.type === 'LAND' && 'bg-green-900/50 text-green-400',
                    prop.type === 'INDUSTRIAL' && 'bg-orange-900/50 text-orange-400'
                  )}>
                    {prop.type}
                  </span>
                </td>
                <td className="py-2">
                  <span className={cn(
                    'px-1.5 py-0.5 text-[10px]',
                    prop.status === 'LISTED' && 'bg-amber-900/50 text-amber-400',
                    prop.status === 'AVAILABLE' && 'bg-green-900/50 text-green-400',
                    prop.status === 'MANAGED' && 'bg-blue-900/50 text-blue-400',
                    prop.status === 'LEASED' && 'bg-purple-900/50 text-purple-400',
                    prop.status === 'SOLD' && 'bg-zinc-700/50 text-zinc-400'
                  )}>
                    {prop.status}
                  </span>
                </td>
                <td className="py-2 text-right text-green-400">₵{prop.value.toLocaleString()}</td>
                <td className="py-2 text-right text-zinc-400">{prop.size}</td>
                <td className="py-2 text-right text-zinc-500">{prop.built || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
