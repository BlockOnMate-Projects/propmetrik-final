'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Search, RefreshCw, Shield, Mail, Building2 } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface User {
  id: string
  email: string
  full_name: string
  role: string
  organization_name: string
  last_login: string
  is_active: boolean
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`${API}/api/v1/admin/users?search=${encodeURIComponent(search)}`)
      if (res.ok) {
        const data = (await res.json()) as { data: User[] }
        setUsers(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-900/30 border border-red-800">
            <Users className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-white font-bold tracking-wide">USERS</h1>
            <p className="font-mono text-xs text-zinc-500">Manage platform users</p>
          </div>
        </div>
        <button onClick={fetchUsers} className="p-2 text-zinc-400 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none"
        />
      </div>

      <div className="border border-zinc-800 bg-zinc-900/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Organization</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Last Login</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-zinc-500">No users found</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-white">{user.full_name}</div>
                    <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                      <Mail className="w-3 h-3" />{user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    <div className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />{user.organization_name}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                      <Shield className="w-3 h-3" />{user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 font-mono text-[10px] ${user.is_active ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
                      {user.is_active ? 'ACTIVE' : 'INACTIVE'}
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
