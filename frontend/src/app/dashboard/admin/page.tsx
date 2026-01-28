'use client'

import { 
  Users, 
  Building2, 
  Activity, 
  Server, 
  Database,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  FileText,
  Globe,
  Shield
} from 'lucide-react'

// Stats card component
function StatCard({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon 
}: { 
  title: string
  value: string | number
  change?: string
  changeType?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-white mt-1 font-mono">{value}</p>
          {change && (
            <div className="flex items-center gap-1 mt-2">
              {changeType === 'up' && <TrendingUp className="w-3 h-3 text-green-500" />}
              {changeType === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
              <span className={`text-[10px] font-mono ${
                changeType === 'up' ? 'text-green-500' : 
                changeType === 'down' ? 'text-red-500' : 'text-zinc-500'
              }`}>
                {change}
              </span>
            </div>
          )}
        </div>
        <div className="p-2 bg-red-900/20 rounded">
          <Icon className="w-5 h-5 text-red-500" />
        </div>
      </div>
    </div>
  )
}

// System status component
function SystemStatus({ name, status, latency }: { name: string; status: 'healthy' | 'warning' | 'error'; latency?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-2">
        {status === 'healthy' && <CheckCircle className="w-4 h-4 text-green-500" />}
        {status === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
        {status === 'error' && <AlertTriangle className="w-4 h-4 text-red-500" />}
        <span className="text-xs font-mono text-zinc-300">{name}</span>
      </div>
      {latency && (
        <span className="text-[10px] font-mono text-zinc-500">{latency}</span>
      )}
    </div>
  )
}

// Recent activity item
function ActivityItem({ action, user, time, type }: { action: string; user: string; time: string; type: 'create' | 'update' | 'delete' | 'login' }) {
  const colors = {
    create: 'text-green-500',
    update: 'text-blue-500',
    delete: 'text-red-500',
    login: 'text-amber-500'
  }
  
  return (
    <div className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
      <div className={`w-2 h-2 rounded-full mt-1.5 ${colors[type].replace('text-', 'bg-')}`} />
      <div className="flex-1">
        <p className="text-xs text-zinc-300">{action}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-mono text-zinc-500">{user}</span>
          <span className="text-[10px] text-zinc-600">•</span>
          <span className="text-[10px] font-mono text-zinc-500">{time}</span>
        </div>
      </div>
    </div>
  )
}

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white font-mono">ADMIN DASHBOARD</h1>
          <p className="text-xs text-zinc-500 mt-1">Platform overview and system metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-green-900/30 border border-green-800 text-green-400 text-[10px] font-mono">
            ALL SYSTEMS OPERATIONAL
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value="1,234"
          change="+12% this month"
          changeType="up"
          icon={Users}
        />
        <StatCard
          title="Organizations"
          value="156"
          change="+5 this week"
          changeType="up"
          icon={Building2}
        />
        <StatCard
          title="Active Sessions"
          value="342"
          change="Live now"
          changeType="neutral"
          icon={Activity}
        />
        <StatCard
          title="API Requests"
          value="2.4M"
          change="+18% vs last week"
          changeType="up"
          icon={Globe}
        />
      </div>

      {/* Second Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Data Sources"
          value="47"
          change="3 pending sync"
          changeType="neutral"
          icon={Database}
        />
        <StatCard
          title="Valuations (MTD)"
          value="892"
          change="+23% vs last month"
          changeType="up"
          icon={FileText}
        />
        <StatCard
          title="System Uptime"
          value="99.97%"
          change="Last 30 days"
          changeType="neutral"
          icon={Server}
        />
        <StatCard
          title="Security Events"
          value="3"
          change="-2 vs yesterday"
          changeType="down"
          icon={Shield}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Status */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white font-mono">SYSTEM STATUS</h2>
            <span className="text-[10px] text-zinc-500 font-mono">Updated 30s ago</span>
          </div>
          <div className="space-y-1">
            <SystemStatus name="PostgreSQL Database" status="healthy" latency="12ms" />
            <SystemStatus name="Redis Cache" status="healthy" latency="2ms" />
            <SystemStatus name="OpenSearch" status="healthy" latency="45ms" />
            <SystemStatus name="Keycloak SSO" status="healthy" latency="89ms" />
            <SystemStatus name="MinIO Storage" status="healthy" latency="23ms" />
            <SystemStatus name="Airflow Scheduler" status="healthy" latency="—" />
            <SystemStatus name="ClickHouse Analytics" status="healthy" latency="18ms" />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white font-mono">RECENT ACTIVITY</h2>
            <a href="/dashboard/admin/audit-logs" className="text-[10px] text-red-400 hover:text-red-300 font-mono">
              VIEW ALL →
            </a>
          </div>
          <div className="space-y-1">
            <ActivityItem
              action="Created new organization: Realteum Properties"
              user="eric@cedynhq.com"
              time="2 hours ago"
              type="create"
            />
            <ActivityItem
              action="Updated user permissions for admin@realteum.com"
              user="system"
              time="3 hours ago"
              type="update"
            />
            <ActivityItem
              action="User login from new device"
              user="eric.danso@cedynhq.com"
              time="5 hours ago"
              type="login"
            />
            <ActivityItem
              action="Deleted expired API key"
              user="system"
              time="6 hours ago"
              type="delete"
            />
            <ActivityItem
              action="New valuation report generated"
              user="admin@realteum.com"
              time="8 hours ago"
              type="create"
            />
            <ActivityItem
              action="Data pipeline sync completed: Ghana Land Registry"
              user="system"
              time="12 hours ago"
              type="update"
            />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-sm font-bold text-white font-mono mb-4">QUICK ACTIONS</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { name: 'Add User', href: '/dashboard/admin/users/new' },
            { name: 'Create Org', href: '/dashboard/admin/organizations/new' },
            { name: 'View Logs', href: '/dashboard/admin/audit-logs' },
            { name: 'API Keys', href: '/dashboard/admin/api-keys' },
            { name: 'Data Hub', href: '/dashboard/admin/data-hub' },
            { name: 'Settings', href: '/dashboard/admin/settings' },
          ].map((action) => (
            <a
              key={action.name}
              href={action.href}
              className="px-4 py-3 bg-zinc-800 hover:bg-red-900/30 border border-zinc-700 hover:border-red-800 text-center transition-colors"
            >
              <span className="text-xs font-mono text-zinc-300 hover:text-red-300">
                {action.name}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
