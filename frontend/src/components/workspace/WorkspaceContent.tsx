'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { workspaceApi, type EntityType, type WorkspaceMessage, type Workspace, type WorkspaceMember, type WorkspaceConversation } from '@/lib/workspace-api';
import { useWorkspaceSocket } from './hooks/useWorkspaceSocket';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { WorkspaceMemberList } from './WorkspaceMemberList';
import { KobbySuggestionChips } from './KobbyAIBubble';
import { useKobbyAI } from './hooks/useKobbyAI';
import { Button } from '@/components/ui/button';
import { Users, MessageSquare, Bot, Wifi, WifiOff, Search, ExternalLink } from 'lucide-react';
import { useSession } from 'next-auth/react';

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
    const { data: session } = useSession();
    const resolvedToken = token || ((session as any)?.accessToken ?? null);
    const resolvedUserId = currentUserId || ((session as any)?.user?.id as string | undefined) || null;
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [conversations, setConversations] = useState<WorkspaceConversation[]>([]);
    const [conversationUnreadCounts, setConversationUnreadCounts] = useState<Record<string, number>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
    const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; content: string } | null>(null);
    const [prefillText, setPrefillText] = useState('');
    const [prefillNonce, setPrefillNonce] = useState(0);

    const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

    const getConversationLabel = useCallback((conversation: WorkspaceConversation): string => {
        if (conversation.conversation_type === 'channel') {
            return `# ${conversation.name || 'General'}`;
        }

        if (conversation.conversation_type === 'group') {
            return `Group: ${conversation.name || 'Untitled Group'}`;
        }

        // DM label: show the other participant's name/email
        const dmKey = conversation.dm_key || '';
        const ids = dmKey.split(':').filter(Boolean);
        const otherUserId = ids.find((id) => id !== resolvedUserId) || ids[0];

        if (!otherUserId) return 'Direct Message';

        const otherMember = members.find((m) => m.user_id === otherUserId);
        return otherMember?.display_name || otherMember?.email || 'Direct Message';
    }, [members, resolvedUserId]);

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

    // Load conversations
    useEffect(() => {
        if (!workspace) return;
        workspaceApi.getConversations(workspace.id)
            .then(({ conversations: list }) => {
                setConversations(list);
                if (!activeConversationId) {
                    const fallback = list.find((c) => c.conversation_type === 'channel' && c.name === 'General') || list[0] || null;
                    setActiveConversationId(fallback?.id || null);
                }
            })
            .catch(() => { });
    }, [workspace, activeConversationId]);

    useEffect(() => {
        if (!workspace) return;
        workspaceApi.getConversationUnreadCounts(workspace.id)
            .then(({ counts }) => setConversationUnreadCounts(counts || {}))
            .catch(() => { });
    }, [workspace, messages]);

    // Load initial messages for active conversation
    useEffect(() => {
        if (!workspace || !activeConversationId) return;
        workspaceApi.getMessages(workspace.id, undefined, 50, activeConversationId).then(({ messages: msgs }) => {
            setMessages(msgs);
        });
        workspaceApi.markConversationRead(workspace.id, activeConversationId).catch(() => { });
    }, [workspace, activeConversationId]);

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

    const handleKobbyResponse = useCallback((query: string, response: any, conversationId?: string) => {
        setMessages((prev) => {
            if (conversationId && activeConversationId && conversationId !== activeConversationId) {
                return prev;
            }
            const responseId = `kobby-local-${Date.now()}`;
            return [
                ...prev,
                {
                    id: responseId,
                    workspace_id: workspace?.id || '',
                    sender_id: null,
                    sender_type: 'kobby_ai',
                    message_type: 'ai_response',
                    content: response?.answer || 'Kobby response received.',
                    metadata: {
                        query,
                        confidence: response?.confidence,
                        sources: response?.sources,
                        followUpSuggestions: response?.followUpSuggestions,
                        dataPoints: response?.dataPoints,
                    },
                    thread_id: null,
                    created_at: new Date().toISOString(),
                    edited_at: null,
                    deleted_at: null,
                },
            ];
        });
    }, [workspace?.id, activeConversationId]);

    const handleKobbyError = useCallback((kobbyError: string) => {
        setError(kobbyError);
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
        token: resolvedToken,
        onMessage: handleNewMessage,
        onMessageEdited: handleMessageEdited,
        onKobbyResponse: handleKobbyResponse,
        onKobbyError: handleKobbyError,
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
            if (activeTab === 'kobby' || text.toLowerCase().startsWith('@kobby')) {
                const query = text.replace(/^@kobby/i, '').trim();
                if (query) {
                    // Echo user's Kobby prompt in-tab for conversational flow
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `kobby-query-${Date.now()}`,
                            workspace_id: workspace.id,
                            sender_id: currentUserId || 'current-user',
                            sender_type: 'user',
                            message_type: 'text',
                            content: query,
                            metadata: { kobby_query: true },
                            thread_id: null,
                            created_at: new Date().toISOString(),
                            edited_at: null,
                            deleted_at: null,
                            sender_name: 'You',
                        },
                    ]);

                    const sessionId = `kobby-${Date.now()}`;
                    sendKobbyQuery(query, entityType, entityId, sessionId, activeConversationId || undefined);
                }
            } else {
                sendMessage(content, activeConversationId || undefined, threadId, metadata);
            }
        },
        [workspace, sendMessage, sendKobbyQuery, entityType, entityId, activeTab, currentUserId, activeConversationId]
    );

    const handleKobbyFollowUp = useCallback((suggestion: string) => {
        if (!workspace) return;
        const sessionId = `kobby-${Date.now()}`;
        sendKobbyQuery(suggestion, entityType, entityId, sessionId, activeConversationId || undefined);
    }, [workspace, sendKobbyQuery, entityType, entityId, activeConversationId]);

    const handleRead = useCallback((messageId: string) => markRead(messageId), [markRead]);

    const handleMemberClick = useCallback((member: WorkspaceMember) => {
        if (!workspace) return;
        workspaceApi.createDMConversation(workspace.id, member.user_id).then(({ conversation }) => {
            setActiveTab('chat');
            setActiveConversationId(conversation.id);
            setConversations((prev) => [
                conversation,
                ...prev.filter((c) => c.id !== conversation.id),
            ]);
        }).catch((err) => setError(err.message));
    }, [workspace]);

    const handleCreateGroup = useCallback((groupName: string, memberIds: string[]) => {
        if (!workspace) return;
        workspaceApi.createGroupConversation(workspace.id, groupName.trim(), memberIds)
            .then(({ conversation }) => {
                setActiveTab('chat');
                setActiveConversationId(conversation.id);
                setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
            })
            .catch((err) => setError(err.message));
    }, [workspace]);

    const handleRenameConversation = useCallback(async () => {
        if (!workspace || !activeConversationId || !activeConversation) return;
        const nextName = window.prompt('Rename conversation', activeConversation.name || '');
        if (!nextName?.trim()) return;

        try {
            const { conversation } = await workspaceApi.renameConversation(workspace.id, activeConversationId, nextName.trim());
            setConversations((prev) => prev.map((c) => (c.id === conversation.id ? conversation : c)));
        } catch (err: any) {
            setError(err.message || 'Failed to rename conversation');
        }
    }, [workspace, activeConversationId, activeConversation]);

    const handleLeaveConversation = useCallback(async () => {
        if (!workspace || !activeConversationId || !activeConversation) return;
        const confirmed = window.confirm(`Leave ${activeConversation.name || 'this conversation'}?`);
        if (!confirmed) return;

        try {
            await workspaceApi.leaveConversation(workspace.id, activeConversationId);
            const { conversations: list } = await workspaceApi.getConversations(workspace.id);
            setConversations(list);
            const fallback = list.find((c) => c.conversation_type === 'channel' && c.name === 'General') || list[0] || null;
            setActiveConversationId(fallback?.id || null);
        } catch (err: any) {
            setError(err.message || 'Failed to leave conversation');
        }
    }, [workspace, activeConversationId, activeConversation]);

    const handleArchiveConversation = useCallback(async () => {
        if (!workspace || !activeConversationId || !activeConversation) return;
        const confirmed = window.confirm(`Archive group ${activeConversation.name || 'conversation'}?`);
        if (!confirmed) return;

        try {
            await workspaceApi.archiveConversation(workspace.id, activeConversationId);
            const { conversations: list } = await workspaceApi.getConversations(workspace.id);
            setConversations(list);
            const fallback = list.find((c) => c.conversation_type === 'channel' && c.name === 'General') || list[0] || null;
            setActiveConversationId(fallback?.id || null);
        } catch (err: any) {
            setError(err.message || 'Failed to archive conversation');
        }
    }, [workspace, activeConversationId, activeConversation]);

    const handleAddGroupMember = useCallback(async () => {
        if (!workspace || !activeConversationId) return;
        const targetUserId = window.prompt('Enter user ID to add to this group');
        if (!targetUserId?.trim()) return;
        try {
            await workspaceApi.addConversationMember(workspace.id, activeConversationId, targetUserId.trim());
        } catch (err: any) {
            setError(err.message || 'Failed to add member');
        }
    }, [workspace, activeConversationId]);

    const handleRemoveGroupMember = useCallback(async () => {
        if (!workspace || !activeConversationId) return;
        try {
            const { members: groupMembers } = await workspaceApi.getConversationMembers(workspace.id, activeConversationId);
            const membersList = groupMembers.map((m) => `${m.user_id} (${m.display_name || m.email || 'Unknown'})`).join('\n');
            const targetUserId = window.prompt(`Enter user ID to remove:\n${membersList}`);
            if (!targetUserId?.trim()) return;
            await workspaceApi.removeConversationMember(workspace.id, activeConversationId, targetUserId.trim());
        } catch (err: any) {
            setError(err.message || 'Failed to remove member');
        }
    }, [workspace, activeConversationId]);

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
                        {/* Left Sidebar — conversation history (chat) / Kobby query history (kobby) */}
                        {entityType === 'platform' && (
                            <div className="w-48 flex-shrink-0 border-r border-zinc-800/60 bg-zinc-900/20 hidden md:flex flex-col">
                                <div className="px-3 py-2 border-b border-zinc-800/40">
                                    <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                                        {activeTab === 'chat' ? 'Chats' : 'History'}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {activeTab === 'chat' ? (
                                        conversations.length === 0 ? (
                                            <p className="px-2 py-1.5 text-[10px] text-zinc-600 italic">No conversations yet.</p>
                                        ) : conversations.map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => {
                                                    setActiveConversationId(c.id);
                                                    setActiveTab('chat');
                                                }}
                                                className={cn(
                                                    'w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors truncate border',
                                                    activeConversationId === c.id
                                                        ? 'bg-zinc-800/80 text-zinc-100 border-zinc-700/70'
                                                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-transparent hover:border-zinc-700/50'
                                                )}
                                                title={getConversationLabel(c)}
                                            >
                                                {getConversationLabel(c)}
                                                {(conversationUnreadCounts[c.id] || 0) > 0 && (
                                                    <span className="ml-1 text-emerald-400">({conversationUnreadCounts[c.id]})</span>
                                                )}
                                            </button>
                                        ))
                                    ) : (() => {
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
                            {activeTab === 'chat' && (
                                <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/20 text-[11px] text-zinc-400 flex items-center justify-between">
                                    <span>
                                        {activeConversation
                                            ? getConversationLabel(activeConversation)
                                            : 'Select a conversation'}
                                    </span>
                                    {conversations.length > 1 && (
                                        <select
                                            value={activeConversationId || ''}
                                            onChange={(e) => setActiveConversationId(e.target.value || null)}
                                            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px]"
                                        >
                                            {conversations.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {(getConversationLabel(c))
                                                        + ((conversationUnreadCounts[c.id] || 0) > 0 ? ` (${conversationUnreadCounts[c.id]})` : '')}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                            {activeTab === 'chat' && activeConversation?.conversation_type === 'group' && (
                                <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/40 text-[11px] text-zinc-400 flex items-center gap-2">
                                    <button type="button" onClick={handleRenameConversation} className="text-emerald-400 hover:text-emerald-300">Rename</button>
                                    <button type="button" onClick={handleAddGroupMember} className="text-emerald-400 hover:text-emerald-300">Add Member</button>
                                    <button type="button" onClick={handleRemoveGroupMember} className="text-amber-400 hover:text-amber-300">Remove Member</button>
                                    <button type="button" onClick={handleLeaveConversation} className="text-zinc-400 hover:text-zinc-200">Leave</button>
                                    <button type="button" onClick={handleArchiveConversation} className="text-red-400 hover:text-red-300">Archive</button>
                                </div>
                            )}
                            <MessageList
                                messages={activeTab === 'kobby'
                                    ? messages.filter(m => m.sender_type === 'kobby_ai' || (m.metadata as any)?.kobby_query === true)
                                    : messages.filter((m) => activeConversationId ? m.conversation_id === activeConversationId : true)}
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
                                onTyping={() => sendTyping(activeConversationId || undefined)}
                                connected={connected}
                                disabled={!workspace || isKobbyThinking}
                                replyingTo={replyingTo}
                                onCancelReply={() => setReplyingTo(null)}
                                placeholder={activeTab === 'kobby' ? "Ask Kobby anything..." : "Message or @kobby..."}
                                token={resolvedToken}
                                prefillText={prefillText}
                                prefillNonce={prefillNonce}
                            />
                        </div>
                    </div>
                ) : (
                    <WorkspaceMemberList
                        members={members}
                        currentUserId={currentUserId}
                        onlineUserIds={onlineUsers}
                        onMemberClick={handleMemberClick}
                        onCreateGroup={handleCreateGroup}
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
