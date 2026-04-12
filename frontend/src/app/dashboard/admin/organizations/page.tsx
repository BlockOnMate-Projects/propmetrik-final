'use client'

import { useEffect, useState, useCallback } from 'react'
import { Building2, Search, RefreshCw, Users, MapPin, Globe } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface Organization {
  id: string
  name: string
  slug: string
  country: string
  city: string
  user_count: number
  subscription_tier: string
  created_at: string
  is_active: boolean
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`${API}/api/v1/admin/organizations?search=${encodeURIComponent(search)}`)
      if (res.ok) {
        const data = (await res.json()) as { data: Organization[] }
        setOrgs(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-900/30 border border-red-800">
            <Building2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-white font-bold tracking-wide">ORGANIZATIONS</h1>
            <p className="font-mono text-xs text-zinc-500">Manage platform organizations</p>
          </div>
        </div>
        <button onClick={fetchOrgs} className="p-2 text-zinc-400 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="border border-zinc-800 bg-zinc-900/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Organization</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Location</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Users</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Tier</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">Loading...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">No organizations found</td></tr>
            ) : (
              orgs.map((org) => (
                <tr key={org.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-white">{org.name}</div>
                    <div className="font-mono text-[10px] text-zinc-500">{org.slug}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {org.city}, {org.country}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {org.user_count}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-amber-400 uppercase">{org.subscription_tier}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] ${org.is_active ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
                      {org.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
