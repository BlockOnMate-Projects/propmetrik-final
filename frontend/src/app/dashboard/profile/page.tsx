'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'

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

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-mono text-xl text-white">USER SETTINGS</h1>
        <p className="font-mono text-[10px] text-zinc-500">Account Configuration & Preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {[
          { id: 'profile', label: 'PROFILE' },
          { id: 'security', label: 'SECURITY' },
          { id: 'notifications', label: 'NOTIFICATIONS' },
          { id: 'api', label: 'API ACCESS' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 font-mono text-xs transition-colors',
              activeTab === tab.id
                ? 'bg-amber-500 text-black font-bold'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Main Content */}
        <div className="col-span-8">
          {activeTab === 'profile' && (
            <Panel title="PROFILE INFORMATION">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">FULL NAME</label>
                    <input
                      type="text"
                      defaultValue="Admin User"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">EMAIL</label>
                    <input
                      type="email"
                      defaultValue="admin@propmetrik.com"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">ORGANIZATION</label>
                    <input
                      type="text"
                      defaultValue="Cedyn Group"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">ROLE</label>
                    <input
                      type="text"
                      defaultValue="Administrator"
                      disabled
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-zinc-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-zinc-500 mb-1">PHONE</label>
                  <input
                    type="tel"
                    defaultValue="+233 24 123 4567"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="pt-4 border-t border-zinc-800">
                  <button className="px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors">
                    SAVE CHANGES
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {activeTab === 'security' && (
            <Panel title="SECURITY SETTINGS">
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-[10px] text-zinc-500 mb-1">CURRENT PASSWORD</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">NEW PASSWORD</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-zinc-500 mb-1">CONFIRM PASSWORD</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-800">
                  <button className="px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors">
                    UPDATE PASSWORD
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {activeTab === 'notifications' && (
            <Panel title="NOTIFICATION PREFERENCES">
              <div className="space-y-3">
                {[
                  { label: 'Valuation Completed', desc: 'When a valuation request is completed', enabled: true },
                  { label: 'New Deal Activity', desc: 'Updates on deal pipeline changes', enabled: true },
                  { label: 'Market Alerts', desc: 'Significant market price changes', enabled: false },
                  { label: 'System Updates', desc: 'Platform maintenance and updates', enabled: true },
                  { label: 'Weekly Reports', desc: 'Summary reports every Monday', enabled: true },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                    <div>
                      <div className="font-mono text-sm text-white">{item.label}</div>
                      <div className="font-mono text-[10px] text-zinc-500">{item.desc}</div>
                    </div>
                    <button
                      className={cn(
                        'px-3 py-1 font-mono text-[10px]',
                        item.enabled
                          ? 'bg-green-900/50 text-green-400 border border-green-800'
                          : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                      )}
                    >
                      {item.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {activeTab === 'api' && (
            <Panel title="API ACCESS">
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-[10px] text-zinc-500 mb-1">API KEY</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value="pm_live_••••••••••••••••••••••••"
                      disabled
                      className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 font-mono text-sm text-zinc-400"
                    />
                    <button className="px-4 py-2 bg-zinc-800 text-white font-mono text-xs hover:bg-zinc-700 transition-colors">
                      REVEAL
                    </button>
                    <button className="px-4 py-2 bg-zinc-800 text-white font-mono text-xs hover:bg-zinc-700 transition-colors">
                      COPY
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-zinc-800/50 border border-zinc-700">
                  <div className="font-mono text-[10px] text-zinc-400">
                    Rate Limit: <span className="text-white">1000 requests/hour</span>
                  </div>
                  <div className="font-mono text-[10px] text-zinc-400 mt-1">
                    Usage This Month: <span className="text-green-400">12,847 / 100,000</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-800">
                  <button className="px-4 py-2 bg-red-900/50 text-red-400 border border-red-800 font-mono text-xs hover:bg-red-900 transition-colors">
                    REGENERATE KEY
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* Sidebar */}
        <div className="col-span-4 space-y-4">
          <Panel title="ACCOUNT STATUS">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">PLAN</span>
                <span className="font-mono text-xs text-amber-400">ENTERPRISE</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">STATUS</span>
                <span className="font-mono text-xs text-green-400">ACTIVE</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">MEMBER SINCE</span>
                <span className="font-mono text-xs text-white">JAN 2024</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">LAST LOGIN</span>
                <span className="font-mono text-xs text-white">TODAY 09:45</span>
              </div>
            </div>
          </Panel>

          <Panel title="QUICK STATS">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">VALUATIONS</span>
                <span className="font-mono text-xs text-white">247</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">DEALS CLOSED</span>
                <span className="font-mono text-xs text-white">34</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">PROPERTIES</span>
                <span className="font-mono text-xs text-white">156</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
