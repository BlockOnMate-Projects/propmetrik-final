'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  Conversation,
  Message,
} from '@/lib/tenant/api';
import {
  MessageSquare,
  Send,
  Search,
  ArrowLeft,
  CheckCheck,
  Check,
  Building2,
  Plus,
  Loader2,
  X,
} from 'lucide-react';

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function MessagesContent() {
  const { profile, activeTenancy } = usePortal();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newConvoSubject, setNewConvoSubject] = useState('');
  const [newConvoMessage, setNewConvoMessage] = useState('');
  const [creatingConvo, setCreatingConvo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const activeConvo = conversations.find(c => c.id === activeConversation);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  useEffect(() => { loadConversations(); }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (activeConversation) {
      loadMessages(activeConversation);
      // Skip polling while the tab is hidden — no point fetching messages in a background tab.
      pollRef.current = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          loadMessages(activeConversation);
        }
      }, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeConversation]);

  const loadConversations = async () => {
    try { const data = await getConversations(); setConversations(data); } catch {} finally { setLoadingConvos(false); }
  };

  const loadMessages = async (convoId: string) => {
    try { const data = await getMessages(convoId); setMessages(data); } catch {} finally { setLoadingMessages(false); }
  };

  const handleSelectConvo = (id: string) => {
    setActiveConversation(id);
    setLoadingMessages(true);
    setMessages([]);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !activeConversation || sending) return;
    const content = newMessage.trim();
    setNewMessage('');
    setSending(true);
    const optimisticMsg: Message = { id: `temp-${Date.now()}`, senderId: profile?.id || '', senderType: 'tenant', content, createdAt: new Date().toISOString(), isRead: true };
    setMessages(prev => [...prev, optimisticMsg]);
    try {
      await sendMessage(activeConversation, content);
      await loadMessages(activeConversation);
      loadConversations();
    } catch {} finally { setSending(false); }
  };

  const handleCreateConversation = async () => {
    if (!newConvoSubject.trim() || !newConvoMessage.trim() || !activeTenancy) return;
    setCreatingConvo(true);
    try {
      const convo = await createConversation(activeTenancy!.id, newConvoSubject.trim(), newConvoMessage.trim());
      setShowNewConvo(false); setNewConvoSubject(''); setNewConvoMessage('');
      await loadConversations();
      setActiveConversation(convo.id);
      setLoadingMessages(true);
    } catch {} finally { setCreatingConvo(false); }
  };

  const filteredConvos = conversations.filter(c => !searchQuery || c.subject?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
        <div className="flex h-full">
          <div className={`w-full md:w-80 lg:w-96 border-r border-gray-100 flex flex-col ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Messages</h3>
                <button onClick={() => setShowNewConvo(true)} className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search conversations..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingConvos ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
              ) : filteredConvos.length > 0 ? filteredConvos.map(convo => (
                <button key={convo.id} onClick={() => handleSelectConvo(convo.id)}
                  className={`w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${activeConversation === convo.id ? 'bg-cyan-50/50' : ''}`}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-cyan-100">
                    <Building2 className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 truncate">{convo.subject || 'Conversation'}</p>
                      {convo.lastMessageAt && <p className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{formatMessageTime(convo.lastMessageAt)}</p>}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{convo.lastMessage || 'No messages yet'}</p>
                  </div>
                  {(convo.unreadCount || 0) > 0 && (
                    <span className="w-5 h-5 bg-cyan-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0">{convo.unreadCount}</span>
                  )}
                </button>
              )) : (
                <div className="p-8 text-center">
                  <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No conversations yet</p>
                  <button onClick={() => setShowNewConvo(true)} className="mt-3 text-sm text-cyan-600 hover:underline font-medium">Start a conversation</button>
                </div>
              )}
            </div>
          </div>

          <div className={`flex-1 flex flex-col ${!activeConversation ? 'hidden md:flex' : 'flex'}`}>
            {activeConvo ? (
              <>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                  <button onClick={() => setActiveConversation(null)} className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-cyan-100">
                    <Building2 className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{activeConvo.subject || 'Conversation'}</p>
                    <p className="text-xs text-gray-400">Property Management</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-sm text-gray-400">No messages yet. Say hello!</div>
                  ) : messages.map((msg, idx) => {
                    const isMine = msg.senderType === 'tenant';
                    const showDate = idx === 0 || new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex items-center justify-center my-4">
                            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                              {new Date(msg.createdAt).toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] ${isMine ? 'order-2' : ''}`}>
                            <div className={`px-4 py-2.5 rounded-2xl ${isMine ? 'bg-cyan-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                            <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'} px-1`}>
                              <span className="text-[10px] text-gray-400">
                                {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isMine && (msg.isRead ? <CheckCheck className="w-3 h-3 text-cyan-500" /> : <Check className="w-3 h-3 text-gray-400" />)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <div className="px-4 py-3 border-t border-gray-100">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                      <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Type a message..." rows={1}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none"
                        style={{ minHeight: '42px', maxHeight: '120px' }} />
                    </div>
                    <button onClick={handleSend} disabled={!newMessage.trim() || sending}
                      className="p-2.5 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-7 h-7 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Select a conversation</p>
                  <p className="text-xs text-gray-400 mt-1">Choose from your existing conversations or start a new one</p>
                  <button onClick={() => setShowNewConvo(true)} className="mt-4 px-4 py-2 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 transition-colors">
                    <Plus className="w-4 h-4 inline mr-1.5" /> New Conversation
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewConvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !creatingConvo && setShowNewConvo(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">New Conversation</h3>
              <button onClick={() => !creatingConvo && setShowNewConvo(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                <input type="text" value={newConvoSubject} onChange={e => setNewConvoSubject(e.target.value)} placeholder="e.g. Question about lease renewal"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
                <textarea value={newConvoMessage} onChange={e => setNewConvoMessage(e.target.value)} placeholder="Type your message..."
                  rows={4} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 resize-none" />
              </div>
              <button onClick={handleCreateConversation} disabled={!newConvoSubject.trim() || !newConvoMessage.trim() || creatingConvo}
                className="w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                {creatingConvo ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending...</span> : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <PortalShell title="Messages">
      <MessagesContent />
    </PortalShell>
  );
}
