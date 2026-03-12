'use client'

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { fetchApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import {
  MessageSquare,
  Send,
  Search,
  ArrowLeft,
  Check,
  CheckCheck,
  Loader2,
  Inbox,
} from 'lucide-react'

interface Conversation {
  id: string
  tenancyId: string
  tenantId: string
  tenantName?: string
  tenantEmail?: string
  propertyTitle?: string
  subject: string
  status: string
  lastMessage?: string
  lastMessageAt?: string
  unreadCount?: number
  createdAt: string
}

interface Message {
  id: string
  conversationId?: string
  senderId: string
  senderType: 'tenant' | 'landlord' | 'system'
  content: string
  isRead: boolean
  createdAt: string
}

/** Groups all conversations for one tenant into a single sidebar entry */
interface TenantPane {
  tenancyId: string
  tenantName: string
  tenantEmail?: string
  propertyTitle?: string
  conversationIds: string[]
  lastMessage?: string
  lastMessageAt?: string
  unreadCount: number
}

function formatTime(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function LandlordMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [activeTenancyId, setActiveTenancyId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [search, setSearch] = useState('')
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  /* ─── Group conversations by tenancyId ─── */
  const tenantPanes: TenantPane[] = useMemo(() => {
    const map = new Map<string, TenantPane>()
    for (const c of conversations) {
      const key = c.tenancyId
      if (!map.has(key)) {
        map.set(key, {
          tenancyId: key,
          tenantName: c.tenantName || 'Tenant',
          tenantEmail: c.tenantEmail,
          propertyTitle: c.propertyTitle,
          conversationIds: [],
          unreadCount: 0,
        })
      }
      const pane = map.get(key)!
      pane.conversationIds.push(c.id)
      pane.unreadCount += c.unreadCount || 0
      if (c.lastMessageAt && (!pane.lastMessageAt || new Date(c.lastMessageAt) > new Date(pane.lastMessageAt))) {
        pane.lastMessageAt = c.lastMessageAt
        pane.lastMessage = c.lastMessage
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })
  }, [conversations])

  const activePane = tenantPanes.find(p => p.tenancyId === activeTenancyId)

  /* Subject lookup so merged messages can show thread labels */
  const subjectMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of conversations) m.set(c.id, c.subject)
    return m
  }, [conversations])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages.length, scrollToBottom])

  useEffect(() => {
    loadConversations()
    const interval = setInterval(loadConversations, 15000)
    return () => clearInterval(interval)
  }, [])

  /* When active tenant changes, load messages from ALL their conversations */
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (activeTenancyId && activePane) {
      loadAllMessages(activePane.conversationIds)
      const ids = activePane.conversationIds
      pollRef.current = setInterval(() => loadAllMessages(ids), 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeTenancyId, activePane?.conversationIds.join(',')])

  const loadConversations = async () => {
    try {
      const data = await fetchApi<{ conversations: Conversation[] }>('/pm/tenant-messages/conversations')
      setConversations(Array.isArray(data) ? data : data.conversations || [])
    } catch {} finally { setLoadingConvos(false) }
  }

  /** Fetch messages from every conversation for the tenant, merge & sort */
  const loadAllMessages = async (convoIds: string[]) => {
    try {
      const results = await Promise.all(
        convoIds.map(id =>
          fetchApi<{ messages: Message[] }>(`/pm/tenant-messages/conversations/${id}/messages`)
            .then(d => (Array.isArray(d) ? d : d.messages || []).map(m => ({ ...m, conversationId: id })))
            .catch(() => [] as Message[])
        )
      )
      const merged = results.flat().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setMessages(merged)
    } catch {} finally { setLoadingMsgs(false) }
  }

  const handleSelect = (tenancyId: string) => {
    setActiveTenancyId(tenancyId)
    setLoadingMsgs(true)
    setMessages([])
  }

  /** Send reply via the most recently active conversation for this tenant */
  const handleSend = async () => {
    if (!newMessage.trim() || !activePane || sending) return
    const content = newMessage.trim()
    setNewMessage('')
    setSending(true)

    const newestConvo = conversations
      .filter(c => c.tenancyId === activeTenancyId)
      .sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime())[0]
    if (!newestConvo) { setSending(false); return }

    setMessages(prev => [...prev, {
      id: `temp-${Date.now()}`,
      conversationId: newestConvo.id,
      senderId: 'landlord',
      senderType: 'landlord',
      content,
      isRead: true,
      createdAt: new Date().toISOString(),
    }])

    try {
      await fetchApi(`/pm/tenant-messages/conversations/${newestConvo.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      await loadAllMessages(activePane.conversationIds)
      loadConversations()
    } catch {} finally { setSending(false) }
  }

  const filtered = tenantPanes.filter(p =>
    !search || p.tenantName.toLowerCase().includes(search.toLowerCase()) || p.tenantEmail?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 h-[calc(100vh-140px)]">
      <Card className="h-full border-zinc-800 bg-zinc-950 overflow-hidden">
        <div className="flex h-full">
          {/* ─── Left sidebar: one entry per tenant ─── */}
          <div className={`w-full md:w-80 lg:w-96 border-r border-zinc-800 flex flex-col ${activeTenancyId ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-mono font-bold text-amber-500 mb-3">TENANT MESSAGES</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search tenants..."
                  className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-300 text-sm h-9"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingConvos ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center">
                  <Inbox className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No conversations yet</p>
                  <p className="text-xs text-zinc-600 mt-1">Messages from tenants will appear here</p>
                </div>
              ) : filtered.map(pane => (
                <button
                  key={pane.tenancyId}
                  onClick={() => handleSelect(pane.tenancyId)}
                  className={`w-full px-4 py-3 flex items-start gap-3 text-left border-b border-zinc-800/50 transition-colors ${
                    activeTenancyId === pane.tenancyId ? 'bg-amber-500/10' : 'hover:bg-zinc-900'
                  }`}
                >
                  <Avatar className="w-9 h-9 flex-shrink-0">
                    <AvatarFallback className="bg-zinc-800 text-amber-500 text-xs font-bold">
                      {pane.tenantName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-200 truncate">{pane.tenantName}</p>
                      {pane.lastMessageAt && (
                        <span className="text-[10px] text-zinc-500 flex-shrink-0 ml-2">{formatTime(pane.lastMessageAt)}</span>
                      )}
                    </div>
                    {pane.propertyTitle && (
                      <p className="text-[10px] text-zinc-600 truncate">{pane.propertyTitle}</p>
                    )}
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{pane.lastMessage || 'No messages yet'}</p>
                  </div>
                  {pane.unreadCount > 0 && (
                    <Badge variant="default" className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[20px] justify-center">
                      {pane.unreadCount}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Right: merged message thread ─── */}
          <div className={`flex-1 flex flex-col ${!activeTenancyId ? 'hidden md:flex' : 'flex'}`}>
            {activePane ? (
              <>
                {/* Header */}
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={() => setActiveTenancyId(null)} className="md:hidden text-zinc-400">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-zinc-800 text-amber-500 text-xs font-bold">
                      {activePane.tenantName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{activePane.tenantName}</p>
                    <p className="text-xs text-zinc-500">{activePane.propertyTitle || 'Tenant'}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-sm text-zinc-500">No messages yet</div>
                  ) : messages.map((msg, idx) => {
                    const isLandlord = msg.senderType === 'landlord'
                    const showDate = idx === 0 || new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString()
                    // Show thread subject pill when conversation changes (only if >1 conversation)
                    const prevConvoId = idx > 0 ? messages[idx - 1].conversationId : null
                    const showSubject = msg.conversationId && msg.conversationId !== prevConvoId && activePane.conversationIds.length > 1
                    const subject = msg.conversationId ? subjectMap.get(msg.conversationId) : undefined

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex items-center justify-center my-4">
                            <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                              {new Date(msg.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                        {showSubject && subject && (
                          <div className="flex items-center justify-center my-2">
                            <span className="text-[10px] font-mono text-amber-500/60 bg-amber-900/20 px-3 py-0.5 rounded-full border border-amber-900/30">
                              Re: {subject}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isLandlord ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[80%]">
                            {!isLandlord && (
                              <p className="text-[10px] font-medium text-zinc-500 mb-1 ml-1">
                                {activePane.tenantName}
                              </p>
                            )}
                            <div className={`px-4 py-2.5 rounded-2xl ${
                              isLandlord
                                ? 'bg-amber-500 text-white rounded-br-md'
                                : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
                            }`}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                            <div className={`flex items-center gap-1 mt-0.5 ${isLandlord ? 'justify-end' : 'justify-start'} px-1`}>
                              <span className="text-[10px] text-zinc-500">
                                {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isLandlord && (
                                msg.isRead
                                  ? <CheckCheck className="w-3 h-3 text-amber-400" />
                                  : <Check className="w-3 h-3 text-zinc-500" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Compose */}
                <div className="px-4 py-3 border-t border-zinc-800">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="Type a reply..."
                      rows={1}
                      className="flex-1 bg-zinc-900 border-zinc-800 text-zinc-300 text-sm resize-none min-h-[42px] max-h-[120px]"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={!newMessage.trim() || sending}
                      className="bg-amber-500 hover:bg-amber-600 text-white h-[42px]"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                    <MessageSquare className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-sm font-medium text-zinc-400">Select a conversation</p>
                  <p className="text-xs text-zinc-600 mt-1">Messages from your tenants will appear here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
