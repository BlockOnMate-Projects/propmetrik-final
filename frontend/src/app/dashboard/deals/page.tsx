'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useState } from 'react'

// Mock data
const deals = [
  { id: 'DL-1892', client: 'Kofi Mensah', property: 'Commercial Plot', location: 'Osu', value: 2450000, stage: 'NEGOTIATION', type: 'SALE', agent: 'A. Owusu', created: '2d ago' },
  { id: 'DL-1891', client: 'Akua Darko', property: '4-Bed Villa', location: 'East Legon', value: 890000, stage: 'OFFER', type: 'SALE', agent: 'K. Mensah', created: '3d ago' },
  { id: 'DL-1890', client: 'GlobalTech Ltd', property: 'Office Space', location: 'Airport City', value: 45000, stage: 'VIEWING', type: 'LEASE', agent: 'A. Owusu', created: '4d ago' },
  { id: 'DL-1889', client: 'J. Appiah', property: 'Land Parcel', location: 'Tema', value: 1200000, stage: 'QUALIFIED', type: 'SALE', agent: 'K. Mensah', created: '5d ago' },
  { id: 'DL-1888', client: 'M. Adjei', property: '3-Bed Apartment', location: 'Cantonments', value: 3100000, stage: 'CLOSED', type: 'SALE', agent: 'A. Owusu', created: '1w ago' },
  { id: 'DL-1887', client: 'E. Boateng', property: '2-Bed Flat', location: 'Achimota', value: 320000, stage: 'CLOSED', type: 'SALE', agent: 'K. Mensah', created: '1w ago' },
  { id: 'DL-1886', client: 'TechHub Inc', property: 'Warehouse', location: 'Tema Industrial', value: 98000, stage: 'LEAD', type: 'LEASE', agent: 'A. Owusu', created: '2w ago' },
]

const pipelineStages = [
  { stage: 'LEAD', count: 45, value: 12500000 },
  { stage: 'QUALIFIED', count: 28, value: 8200000 },
  { stage: 'VIEWING', count: 15, value: 5100000 },
  { stage: 'OFFER', count: 8, value: 3200000 },
  { stage: 'NEGOTIATION', count: 5, value: 2100000 },
  { stage: 'CLOSED', count: 12, value: 4250000 },
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

export default function DealsPage() {
  const [selectedStage, setSelectedStage] = useState<string | null>(null)

  const filteredDeals = selectedStage
    ? deals.filter(d => d.stage === selectedStage)
    : deals

  const totalPipelineValue = pipelineStages.reduce((acc, s) => acc + s.value, 0)

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-white">DEAL MANAGEMENT</h1>
          <p className="font-mono text-[10px] text-zinc-500">Sales Pipeline & Transaction Tracking</p>
        </div>
        <Link
          href="/dashboard/deals/new"
          className="px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
        >
          + NEW DEAL
        </Link>
      </div>

      {/* Pipeline Overview */}
      <Panel title="PIPELINE OVERVIEW" className="mb-4">
        <div className="flex gap-2">
          {pipelineStages.map((stage) => (
            <button
              key={stage.stage}
              onClick={() => setSelectedStage(selectedStage === stage.stage ? null : stage.stage)}
              className={cn(
                'flex-1 p-3 border transition-colors',
                selectedStage === stage.stage
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-800 hover:border-zinc-600'
              )}
            >
              <div className="font-mono text-[10px] text-zinc-500">{stage.stage}</div>
              <div className="font-mono text-xl text-white mt-1">{stage.count}</div>
              <div className="font-mono text-xs text-green-400 mt-1">₵{(stage.value / 1000000).toFixed(1)}M</div>
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-4 pt-3 border-t border-zinc-800">
          <div>
            <span className="font-mono text-[10px] text-zinc-500">TOTAL PIPELINE VALUE</span>
            <span className="font-mono text-lg text-amber-500 ml-3">₵{(totalPipelineValue / 1000000).toFixed(1)}M</span>
          </div>
          <div>
            <span className="font-mono text-[10px] text-zinc-500">ACTIVE DEALS</span>
            <span className="font-mono text-lg text-white ml-3">{pipelineStages.slice(0, -1).reduce((a, s) => a + s.count, 0)}</span>
          </div>
        </div>
      </Panel>

      {/* Deals Table */}
      <Panel title={selectedStage ? `${selectedStage} DEALS` : 'ALL DEALS'}>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
              <th className="text-left pb-2 w-24">ID</th>
              <th className="text-left pb-2">CLIENT</th>
              <th className="text-left pb-2">PROPERTY</th>
              <th className="text-left pb-2 w-28">LOCATION</th>
              <th className="text-left pb-2 w-20">TYPE</th>
              <th className="text-right pb-2 w-28">VALUE</th>
              <th className="text-left pb-2 w-28">STAGE</th>
              <th className="text-left pb-2 w-24">AGENT</th>
              <th className="text-right pb-2 w-20">CREATED</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {filteredDeals.map((deal) => (
              <tr key={deal.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer">
                <td className="py-2 text-amber-500">{deal.id}</td>
                <td className="py-2 text-white">{deal.client}</td>
                <td className="py-2 text-zinc-300">{deal.property}</td>
                <td className="py-2 text-zinc-400">{deal.location}</td>
                <td className="py-2">
                  <span className={cn(
                    'px-1.5 py-0.5 text-[10px]',
                    deal.type === 'SALE' && 'bg-green-900/50 text-green-400',
                    deal.type === 'LEASE' && 'bg-blue-900/50 text-blue-400'
                  )}>
                    {deal.type}
                  </span>
                </td>
                <td className="py-2 text-right text-green-400">₵{deal.value.toLocaleString()}</td>
                <td className="py-2">
                  <span className={cn(
                    'px-1.5 py-0.5 text-[10px]',
                    deal.stage === 'CLOSED' && 'bg-green-900/50 text-green-400',
                    deal.stage === 'NEGOTIATION' && 'bg-purple-900/50 text-purple-400',
                    deal.stage === 'OFFER' && 'bg-orange-900/50 text-orange-400',
                    deal.stage === 'VIEWING' && 'bg-yellow-900/50 text-yellow-400',
                    deal.stage === 'QUALIFIED' && 'bg-blue-900/50 text-blue-400',
                    deal.stage === 'LEAD' && 'bg-zinc-700/50 text-zinc-300'
                  )}>
                    {deal.stage}
                  </span>
                </td>
                <td className="py-2 text-zinc-400">{deal.agent}</td>
                <td className="py-2 text-right text-zinc-500">{deal.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
