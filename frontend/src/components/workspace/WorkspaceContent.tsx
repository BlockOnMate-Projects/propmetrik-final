'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { workspaceApi, type EntityType, type WorkspaceMessage, type Workspace, type WorkspaceMember } from '@/lib/workspace-api';
import { useWorkspaceSocket } from './hooks/useWorkspaceSocket';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { WorkspaceMemberList } from './WorkspaceMemberList';
import { KobbySuggestionChips } from './KobbyAIBubble';
import { useKobbyAI } from './hooks/useKobbyAI';
import { Button } from '@/components/ui/button';
import { Users, MessageSquare, Bot, Wifi, WifiOff, Search, ExternalLink } from 'lucide-react';

type ActiveTab = 'chat' | 'members' | 'kobby';

interface WorkspaceContentProps {
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    currentUserId?: string | null;
    token?: string | null;
    onClose?: () => void;
}

export function WorkspaceContent({
    entityType,
    entityId,
    entityName,
    currentUserId,
    token,
    onClose,
}: WorkspaceContentProps) {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
    const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; content: string } | null>(null);

    // Load workspace data
    useEffect(() => {
        setLoading(true);
        workspaceApi
            .getOrCreate(entityType, entityId)
            .then(({ workspace: ws, members: m }) => {
                setWorkspace(ws);
                setMembers(m);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [entityType, entityId]);

    // Load initial messages
    useEffect(() => {
        if (!workspace) return;
        workspaceApi.getMessages(workspace.id).then(({ messages: msgs }) => {
            setMessages(msgs);
        });
    }, [workspace]);

    const handleNewMessage = useCallback((msg: WorkspaceMessage) => {
        setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
        });
    }, []);

    const handleMessageEdited = useCallback((messageId: string, content: string, editedAt: string) => {
        setMessages((prev) =>
            prev.map((m) =>
                m.id === messageId ? { ...m, content, edited_at: new Date(editedAt) } : m
            )
        );
    }, []);

    const {
        connected,
        initialMessages,
        typingUsers,
        sendMessage,
        sendTyping,
        markRead,
        isKobbyThinking,
        kobbyPendingQuery,
        onlineUsers,
        sendKobbyQuery
    } = useWorkspaceSocket({
        workspaceId: workspace?.id || '',
        token: token || null,
        onMessage: handleNewMessage,
        onMessageEdited: handleMessageEdited,
    });

    const { suggestions } = useKobbyAI({
        workspaceId: workspace?.id || '',
        entityType,
        entityId,
    });

    useEffect(() => {
        if (initialMessages.length > 0) {
            setMessages(initialMessages);
        }
    }, [initialMessages]);

    const handleSend = useCallback(
        (content: string, metadata?: any, threadId?: string) => {
            if (!workspace) return;
            const text = content.trim();
            if (text.toLowerCase().startsWith('@kobby')) {
                const query = text.replace(/^@kobby/i, '').trim();
                if (query) {
                    const sessionId = `kobby-${Date.now()}`;
                    sendKobbyQuery(query, entityType, entityId, sessionId);
                }
            } else {
                sendMessage(content, threadId, metadata);
            }
        },
        [workspace, sendMessage, sendKobbyQuery, entityType, entityId]
    );

    const handleKobbyFollowUp = useCallback((suggestion: string) => {
        if (!workspace) return;
        const sessionId = `kobby-${Date.now()}`;
        sendKobbyQuery(suggestion, entityType, entityId, sessionId);
    }, [workspace, sendKobbyQuery, entityType, entityId]);

    const handleRead = useCallback((messageId: string) => markRead(messageId), [markRead]);

    const handleReply = useCallback((message: WorkspaceMessage) => {
        setReplyingTo({
            id: message.id,
            senderName: message.sender_name || 'User',
            content: message.content
        });
    }, []);

    const panelTitle = entityName || (entityType === 'platform' ? 'Workspace' : `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Workspace`);

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            {/* Header (Integrated inside content for modularity) */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-zinc-800/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg">
                        <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xs font-semibold text-zinc-100">{panelTitle === 'General' ? 'Workspace' : panelTitle}</h3>
                        <div className="flex items-center gap-1 mt-0.5">
                            {connected ? (
                                <span className="text-[10px] text-emerald-400">Connected</span>
                            ) : (
                                <span className="text-[10px] text-amber-400 animate-pulse">Reconnecting</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-zinc-500 hover:text-zinc-300"
                        onClick={() => window.open(`/api/workspace/${workspace?.id}/export`, '_blank')}
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 flex gap-1 px-4 py-2 bg-zinc-900/30">
                {(['chat', 'members', 'kobby'] as ActiveTab[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-medium transition-all',
                            activeTab === tab
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                        )}
                    >
                        {tab === 'chat' ? (
                            <MessageSquare className="w-3 h-3" />
                        ) : tab === 'kobby' ? (
                            <Bot className="w-3 h-3 text-amber-500" />
                        ) : (
                            <Users className="w-3 h-3" />
                        )}
                        {tab === 'kobby' ? 'KOBBY AI' : tab.toUpperCase()}
                        {tab === 'members' && members.length > 0 && (
                            <span className="ml-1 text-[9px] opacity-60">({members.length})</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full" />
                    </div>
                ) : activeTab === 'chat' || activeTab === 'kobby' ? (
                    <div className="flex-1 flex min-h-0">
                        {/* History Sidebar — shows recent Kobby AI sessions grouped by date */}
                        {entityType === 'platform' && (
                            <div className="w-48 flex-shrink-0 border-r border-zinc-800/60 bg-zinc-900/20 hidden md:flex flex-col">
                                <div className="px-3 py-2 border-b border-zinc-800/40">
                                    <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">History</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {(() => {
                                        const kobbyMsgs = messages.filter(
                                            (m) => m.sender_type === 'kobby_ai' && m.metadata?.query
                                        );
                                        if (kobbyMsgs.length === 0) {
                                            return (
                                                <p className="px-2 py-1.5 text-[10px] text-zinc-600 italic">
                                                    No AI sessions yet. Try @kobby!
                                                </p>
                                            );
                                        }
                                        // Show last 10 unique queries
                                        const seen = new Set<string>();
                                        const unique = kobbyMsgs.reverse().filter((m) => {
                                            const q = (m.metadata?.query || '').toLowerCase();
                                            if (seen.has(q)) return false;
                                            seen.add(q);
                                            return true;
                                        }).slice(0, 10);
                                        return unique.map((m) => (
                                            <button
                                                key={m.id}
                                                onClick={() => {
                                                    setActiveTab('kobby');
                                                }}
                                                className="w-full text-left px-2 py-1.5 rounded text-[10px] text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors truncate border border-transparent hover:border-zinc-700/50"
                                                title={m.metadata?.query}
                                            >
                                                {m.metadata?.query}
                                            </button>
                                        ));
                                    })()}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 flex flex-col min-w-0">
                            <MessageList
                                messages={activeTab === 'kobby'
                                    ? messages.filter(m => m.sender_type === 'kobby_ai' || m.content.toLowerCase().includes('@kobby'))
                                    : messages}
                                currentUserId={currentUserId}
                                typingUsers={typingUsers}
                                isKobbyThinking={isKobbyThinking}
                                kobbyPendingQuery={kobbyPendingQuery}
                                onVisible={handleRead}
                                onKobbyFollowUp={handleKobbyFollowUp}
                                onReply={handleReply}
                            />
                            <MessageInput
                                workspaceId={workspace?.id || ''}
                                onSend={handleSend}
                                onTyping={sendTyping}
                                connected={connected}
                                disabled={!workspace || isKobbyThinking}
                                replyingTo={replyingTo}
                                onCancelReply={() => setReplyingTo(null)}
                                placeholder={activeTab === 'kobby' ? "Ask Kobby anything..." : "Message or @kobby..."}
                            />
                        </div>
                    </div>
                ) : (
                    <WorkspaceMemberList
                        members={members}
                        currentUserId={currentUserId}
                        onlineUserIds={onlineUsers}
                        onRefresh={() =>
                            workspace &&
                            workspaceApi.getMembers(workspace.id).then(({ members: m }) => setMembers(m))
                        }
                    />
                )}
            </div>
        </div>
    );
}
