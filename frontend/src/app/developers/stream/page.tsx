'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Radio, Play, Square, Trash2, Lock, CheckCircle2 } from 'lucide-react'
import { ANALYTICS_WS_URL } from '@/lib/analytics-resources'
import { getStreamStatus, type StreamStatus } from '@/lib/developer-api'
import { PageHeader, Card, Stat, Spinner, Button, CopyButton } from '../_components'
import { cn } from '@/lib/utils'

type ConnState = 'idle' | 'connecting' | 'open' | 'closed'

interface LogLine { ts: number; dir: 'in' | 'out' | 'sys'; text: string }

export default function StreamPage() {
  const [status, setStatus] = useState<StreamStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // Live tester state
  const [apiKey, setApiKey] = useState('')
  const [channel, setChannel] = useState('')
  const [conn, setConn] = useState<ConnState>('idle')
  const [log, setLog] = useState<LogLine[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const loadStatus = useCallback(() => {
    getStreamStatus().then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false))
  }, [])
  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => {
    if (status && !channel) {
      const first = status.channels.find((c) => c.entitled)
      if (first) setChannel(first.channel)
    }
  }, [status, channel])
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  // Clean up the socket on unmount.
  useEffect(() => () => { wsRef.current?.close() }, [])

  const append = (dir: LogLine['dir'], text: string) =>
    setLog((l) => [...l.slice(-199), { ts: Date.now(), dir, text }])

  const connect = () => {
    if (!apiKey.trim() || !channel) return
    setLog([])
    setConn('connecting')
    append('sys', `Connecting to ${ANALYTICS_WS_URL}…`)
    let ws: WebSocket
    try {
      ws = new WebSocket(ANALYTICS_WS_URL, ['propmetrik-api-key', apiKey.trim()])
    } catch (e: any) {
      append('sys', `Failed to open socket: ${e?.message}`)
      setConn('closed')
      return
    }
    wsRef.current = ws
    ws.onopen = () => {
      setConn('open')
      append('sys', 'Connected. Subscribing…')
      ws.send(JSON.stringify({ action: 'subscribe', channels: [channel] }))
      append('out', JSON.stringify({ action: 'subscribe', channels: [channel] }))
    }
    ws.onmessage = (ev) => append('in', ev.data)
    ws.onerror = () => append('sys', 'Socket error')
    ws.onclose = (ev) => { setConn('closed'); append('sys', `Closed (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`) }
  }

  const disconnect = () => { wsRef.current?.close(); wsRef.current = null }

  const dot = { idle: 'bg-muted-foreground', connecting: 'bg-amber-500 animate-pulse', open: 'bg-green-500', closed: 'bg-red-500' }[conn]

  return (
    <div>
      <PageHeader
        title="Streaming"
        subtitle="Real-time WebSocket feeds for market, macro and alert channels. Subscribe with the same API keys — updates are pushed as the underlying data refreshes."
      />

      {loading ? (
        <Spinner />
      ) : !status ? (
        <Card><p className="text-sm text-muted-foreground">Streaming status unavailable.</p></Card>
      ) : (
        <>
          {/* Status */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Active connections" value={`${status.active_connections} / ${status.max_connections}`} accent />
            <Stat label="Connections (30d)" value={status.usage.connections_30d.toLocaleString()} />
            <Stat label="Messages (30d)" value={status.usage.messages_30d.toLocaleString()} />
            <Stat label="Connection minutes" value={status.usage.connection_minutes.toLocaleString()} />
          </div>

          {/* Endpoint */}
          <Card title="Endpoint" className="mb-6">
            <div className="flex items-center gap-2 bg-background border border-border rounded px-3 py-2">
              <code className="text-xs font-mono text-amber-600 dark:text-amber-400 flex-1 break-all">{ANALYTICS_WS_URL}</code>
              <CopyButton text={ANALYTICS_WS_URL} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Authenticate with your API key via the <code className="font-mono">propmetrik-api-key</code> subprotocol
              (browsers) or an <code className="font-mono">Authorization: Bearer</code> header (servers). Send{' '}
              <code className="font-mono">{'{ "action": "subscribe", "channels": [...] }'}</code> and receive
              <code className="font-mono"> snapshot</code> then <code className="font-mono">update</code> frames.
            </p>
          </Card>

          {/* Channels */}
          <Card title="Channels" className="mb-6">
            <div className="space-y-2">
              {status.channels.map((c) => (
                <div key={c.channel} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
                  <code className="text-xs font-mono text-foreground shrink-0 w-56 truncate">{c.channel}</code>
                  <span className="text-xs text-muted-foreground flex-1">{c.description}{c.scoped && <span className="block text-[10px] font-mono mt-0.5">scoped: {c.scoped}</span>}</span>
                  {c.entitled ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> {c.product}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0"><Lock className="w-3 h-3" /> {c.product}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Live tester */}
          <Card title="Live tester" action={<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('w-2 h-2 rounded-full', dot)} />{conn}</span>}>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="pmk_… (paste an API key)"
                className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm font-mono focus:border-amber-500 focus:outline-none"
              />
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded text-sm focus:border-amber-500 focus:outline-none"
              >
                {status.channels.map((c) => (
                  <option key={c.channel} value={c.channel} disabled={!c.entitled}>{c.channel}{c.entitled ? '' : ' (locked)'}</option>
                ))}
              </select>
              {conn === 'open' || conn === 'connecting' ? (
                <Button variant="danger" onClick={disconnect}><Square className="w-4 h-4" /> Disconnect</Button>
              ) : (
                <Button onClick={connect} disabled={!apiKey.trim() || !channel}><Play className="w-4 h-4" /> Connect</Button>
              )}
            </div>
            <div className="bg-background border border-border rounded">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Radio className="w-3 h-3" /> Frames</span>
                <button onClick={() => setLog([])} className="text-muted-foreground hover:text-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="h-64 overflow-y-auto p-3 space-y-1 font-mono text-[11px]">
                {log.length === 0 ? (
                  <p className="text-muted-foreground">Paste a key, pick a channel, and connect to see live frames.</p>
                ) : log.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className={cn('shrink-0', l.dir === 'in' ? 'text-green-600 dark:text-green-400' : l.dir === 'out' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                      {l.dir === 'in' ? '←' : l.dir === 'out' ? '→' : '•'}
                    </span>
                    <span className="text-muted-foreground break-all whitespace-pre-wrap">{l.text}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">The key is used only in your browser to open the socket — it is never sent to our servers by this page.</p>
          </Card>
        </>
      )}
    </div>
  )
}
