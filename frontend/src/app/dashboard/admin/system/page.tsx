'use client'

import { useEffect, useState, useCallback } from 'react'
import { Server, RefreshCw, Cpu, HardDrive, Database, Wifi, CheckCircle, AlertTriangle } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface SystemHealth {
  api: { status: string; uptime: number; version: string }
  database: { status: string; connections: number; pool_size: number }
  redis: { status: string; memory_used: string }
  storage: { status: string; used: string; total: string }
}

export default function SystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`${API}/api/v1/admin/system/health`)
      if (res.ok) {
        const data = (await res.json()) as { data: SystemHealth }
        setHealth(data.data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] border ${
      status === 'healthy' || status === 'connected'
        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800'
        : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800'
    }`}>
      {status === 'healthy' || status === 'connected'
        ? <CheckCircle className="w-3 h-3" />
        : <AlertTriangle className="w-3 h-3" />
      }
      {status.toUpperCase()}
    </span>
  )

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    return `${d}d ${h}h`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800">
            <Server className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">SYSTEM</h1>
            <p className="font-mono text-xs text-muted-foreground">Infrastructure health and monitoring</p>
          </div>
        </div>
        <button onClick={fetchHealth} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center font-mono text-sm text-muted-foreground">Loading system health...</div>
      ) : !health ? (
        <div className="p-8 text-center font-mono text-sm text-muted-foreground">Unable to fetch system health</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* API Server */}
          <div className="p-5 bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="font-mono text-sm text-foreground font-bold">API SERVER</span>
              </div>
              <StatusBadge status={health.api.status} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Uptime</span>
                <span className="text-foreground">{formatUptime(health.api.uptime)}</span>
              </div>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Version</span>
                <span className="text-foreground">{health.api.version}</span>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className="p-5 bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-mono text-sm text-foreground font-bold">DATABASE</span>
              </div>
              <StatusBadge status={health.database.status} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Connections</span>
                <span className="text-foreground">{health.database.connections}/{health.database.pool_size}</span>
              </div>
            </div>
          </div>

          {/* Redis */}
          <div className="p-5 bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="font-mono text-sm text-foreground font-bold">REDIS</span>
              </div>
              <StatusBadge status={health.redis.status} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Memory Used</span>
                <span className="text-foreground">{health.redis.memory_used}</span>
              </div>
            </div>
          </div>

          {/* Storage */}
          <div className="p-5 bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="font-mono text-sm text-foreground font-bold">STORAGE</span>
              </div>
              <StatusBadge status={health.storage.status} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Usage</span>
                <span className="text-foreground">{health.storage.used} / {health.storage.total}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
