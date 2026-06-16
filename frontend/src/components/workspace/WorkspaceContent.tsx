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
import { Users, MessageSquare, Bot, Wifi, WifiOff, Search, ExternalLink, X, UserPlus, UserMinus } from 'lucide-react';
import { useSession } from 'next-auth/react';

type ActiveTab = 'chat' | 'members' | 'kobby';

interface WorkspaceContentProps {
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    currentUserId?: string | null;
    token?: string | null;
    onClose?: () => void;
    initialTab?: 'chat' | 'kobby';
    forceConversationId?: string | null;
    onConversationChange?: (conversationId: string | null) => void;
}

export function WorkspaceContent({
    entityType,
    entityId,
    entityName,
    currentUserId,
    token,
    onClose,
    initialTab,
    forceConversationId,
    onConversationChange,
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
    const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab || 'chat');
    const [loading, setLoading] = useState(true);

    // Respond to external tab switches (from contact rail)
    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    // Respond to forced conversation selection (from contact rail DM click)
    useEffect(() => {
        if (forceConversationId) {
            setActiveConversationId(forceConversationId);
            setActiveTab('chat');
        }
    }, [forceConversationId]);

    // Notify parent of conversation changes
    useEffect(() => {
        onConversationChange?.(activeConversationId);
    }, [activeConversationId, onConversationChange]);
    const [error, setError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; content: string } | null>(null);
    const [prefillText, setPrefillText] = useState('');
    const [prefillNonce, setPrefillNonce] = useState(0);

    // Group member management modals
    const [showAddMemberPicker, setShowAddMemberPicker] = useState(false);
    const [showRemoveMemberPicker, setShowRemoveMemberPicker] = useState(false);
    const [conversationMembers, setConversationMembers] = useState<WorkspaceMember[]>([]);

    const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

    const getConversationLabel = useCallback((conversation: WorkspaceConversation): string => {
        if (conversation.conversation_type === 'channel') {
            return `# ${conversation.name || 'General'}`;
        }

        if (conversation.conversation_type === 'group') {
            return `Group: ${conversation.name || 'Untitled Group'}`;
        }

        // DM label: prefer the server-resolved name; fall back to dm_key + members lookup
        if (conversation.display_name) return conversation.display_name;
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

    // Load conversations (only when workspace changes, not on activeConversationId change)
    useEffect(() => {
        if (!workspace) return;
        workspaceApi.getConversations(workspace.id)
            .then(({ conversations: list }) => {
                setConversations(list);
                setActiveConversationId((prev) => {
                    if (prev) return prev; // keep existing selection
                    const fallback = list.find((c) => c.conversation_type === 'channel' && c.name === 'General') || list[0] || null;
                    return fallback?.id || null;
                });
            })
            .catch(() => { });
    }, [workspace]);

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

    // A new DM/group was created with me — surface it in my conversation list live.
    const handleConversation = useCallback((conversation: WorkspaceConversation) => {
        setConversations((prev) => {
            if (prev.some((c) => c.id === conversation.id)) {
                return prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c));
            }
            return [conversation, ...prev];
        });
    }, []);

    const handleMessageEdited = useCallback((messageId: string, content: string, editedAt: string) => {
        setMessages((prev) =>
            prev.map((m) =>
                m.id === messageId ? { ...m, content, edited_at: editedAt } : m
            )
        );
    }, []);

    const handleMessageDeleted = useCallback((messageId: string) => {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
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
                    conversation_id: activeConversationId || '',
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
        sendKobbyQuery,
        deleteMessage: wsDeleteMessage,
    } = useWorkspaceSocket({
        workspaceId: workspace?.id || '',
        token: resolvedToken,
        onMessage: handleNewMessage,
        onConversation: handleConversation,
        onMessageEdited: handleMessageEdited,
        onMessageDeleted: handleMessageDeleted,
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

    // Reconnect replay: when the socket comes back online, re-pull the active
    // conversation's history so nothing sent during the outage is missed.
    useEffect(() => {
        if (!connected || !workspace || !activeConversationId) return;
        workspaceApi.getMessages(workspace.id, undefined, 50, activeConversationId)
            .then(({ messages: msgs }) => setMessages(msgs))
            .catch(() => { });
    }, [connected, workspace, activeConversationId]);

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
                            conversation_id: activeConversationId || '',
                            sender_id: resolvedUserId || 'current-user',
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
        [workspace, sendMessage, sendKobbyQuery, entityType, entityId, activeTab, resolvedUserId, activeConversationId]
    );

    const handleKobbyFollowUp = useCallback((suggestion: string) => {
        if (!workspace) return;
        const sessionId = `kobby-${Date.now()}`;
        sendKobbyQuery(suggestion, entityType, entityId, sessionId, activeConversationId || undefined);
    }, [workspace, sendKobbyQuery, entityType, entityId, activeConversationId]);

    const handleRead = useCallback((messageId: string) => markRead(messageId), [markRead]);

    const handleDeleteMessage = useCallback((messageId: string) => {
        wsDeleteMessage(messageId);
        // Optimistic removal
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }, [wsDeleteMessage]);

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

    const handleCreateChannel = useCallback((name: string) => {
        if (!workspace || !name.trim()) return;
        workspaceApi.createChannelConversation(workspace.id, name.trim())
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

    // Open add member picker — shows workspace members NOT in the group
    const handleOpenAddMemberPicker = useCallback(async () => {
        if (!workspace || !activeConversationId) return;
        try {
            const { members: groupMembers } = await workspaceApi.getConversationMembers(workspace.id, activeConversationId);
            setConversationMembers(groupMembers);
            setShowAddMemberPicker(true);
        } catch (err: any) {
            setError(err.message || 'Failed to load group members');
        }
    }, [workspace, activeConversationId]);

    // Open remove member picker — shows current group members
    const handleOpenRemoveMemberPicker = useCallback(async () => {
        if (!workspace || !activeConversationId) return;
        try {
            const { members: groupMembers } = await workspaceApi.getConversationMembers(workspace.id, activeConversationId);
            setConversationMembers(groupMembers);
            setShowRemoveMemberPicker(true);
        } catch (err: any) {
            setError(err.message || 'Failed to load group members');
        }
    }, [workspace, activeConversationId]);

    const handleAddGroupMember = useCallback(async (userId: string) => {
        if (!workspace || !activeConversationId) return;
        try {
            await workspaceApi.addConversationMember(workspace.id, activeConversationId, userId);
            setShowAddMemberPicker(false);
        } catch (err: any) {
            setError(err.message || 'Failed to add member');
        }
    }, [workspace, activeConversationId]);

    const handleRemoveGroupMember = useCallback(async (userId: string) => {
        if (!workspace || !activeConversationId) return;
        try {
            await workspaceApi.removeConversationMember(workspace.id, activeConversationId, userId);
            setConversationMembers((prev) => prev.filter((m) => m.user_id !== userId));
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

    // Build a lookup map for thread parent messages
    const messageMap = new Map(messages.map((m) => [m.id, m]));

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Error banner */}
            {error && (
                <div className="flex-shrink-0 px-4 py-2 bg-red-950/60 border-b border-red-800/40 text-xs text-red-600 dark:text-red-300 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-600 dark:text-red-400 hover:text-red-200 ml-2">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Connection status bar */}
            {!connected && (
                <div className="flex-shrink-0 px-4 py-1.5 bg-amber-950/40 border-b border-amber-800/30 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <WifiOff className="w-3 h-3" />
                    <span className="animate-pulse">Reconnecting...</span>
                </div>
            )}

            {/* Tabs */}
            <div className="flex-shrink-0 flex gap-1 px-4 py-2 bg-card/30">
                {(['chat', 'members', 'kobby'] as ActiveTab[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-medium transition-all',
                            activeTab === tab
                                ? 'bg-muted text-zinc-100 shadow-sm'
                                : 'text-muted-foreground hover:text-muted-foreground'
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
                        <div className="flex-1 flex flex-col min-w-0">
                            {activeTab === 'chat' && (
                                <div className="px-4 py-2 border-b border-border/60 bg-card/20 text-[11px] text-muted-foreground flex items-center justify-between">
                                    <span>
                                        {activeConversation
                                            ? getConversationLabel(activeConversation)
                                            : 'Select a conversation'}
                                    </span>
                                    {conversations.length > 1 && (
                                        <select
                                            value={activeConversationId || ''}
                                            onChange={(e) => setActiveConversationId(e.target.value || null)}
                                            className="bg-background border border-border rounded px-2 py-1 text-[11px]"
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
                                <div className="px-4 py-2 border-b border-border/60 bg-card/40 text-[11px] text-muted-foreground flex items-center gap-2">
                                    <button type="button" onClick={handleRenameConversation} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-300">Rename</button>
                                    <button type="button" onClick={handleOpenAddMemberPicker} className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-300">
                                        <UserPlus className="w-3 h-3" /> Add
                                    </button>
                                    <button type="button" onClick={handleOpenRemoveMemberPicker} className="flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-300">
                                        <UserMinus className="w-3 h-3" /> Remove
                                    </button>
                                    <button type="button" onClick={handleLeaveConversation} className="text-muted-foreground hover:text-zinc-200">Leave</button>
                                    <button type="button" onClick={handleArchiveConversation} className="text-red-600 dark:text-red-400 hover:text-red-300">Archive</button>
                                </div>
                            )}

                            {/* Add Member Picker Modal */}
                            {showAddMemberPicker && (
                                <MemberPickerOverlay
                                    title="Add Member to Group"
                                    members={members.filter((m) => !conversationMembers.some((cm) => cm.user_id === m.user_id))}
                                    onSelect={handleAddGroupMember}
                                    onClose={() => setShowAddMemberPicker(false)}
                                    emptyText="All workspace members are already in this group."
                                />
                            )}

                            {/* Remove Member Picker Modal */}
                            {showRemoveMemberPicker && (
                                <MemberPickerOverlay
                                    title="Remove Member from Group"
                                    members={conversationMembers.filter((m) => m.user_id !== resolvedUserId)}
                                    onSelect={handleRemoveGroupMember}
                                    onClose={() => setShowRemoveMemberPicker(false)}
                                    emptyText="No members to remove."
                                    variant="danger"
                                />
                            )}

                            <MessageList
                                messages={activeTab === 'kobby'
                                    ? messages.filter(m => m.sender_type === 'kobby_ai' || (m.metadata as any)?.kobby_query === true)
                                    : messages.filter((m) => activeConversationId ? m.conversation_id === activeConversationId : true)}
                                allMessages={messageMap}
                                currentUserId={resolvedUserId}
                                typingUsers={typingUsers}
                                isKobbyThinking={isKobbyThinking}
                                kobbyPendingQuery={kobbyPendingQuery}
                                onVisible={handleRead}
                                onKobbyFollowUp={handleKobbyFollowUp}
                                onReply={handleReply}
                                onDelete={handleDeleteMessage}
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
                        currentUserId={resolvedUserId}
                        onlineUserIds={onlineUsers}
                        onMemberClick={handleMemberClick}
                        onCreateGroup={handleCreateGroup}
                        onCreateChannel={handleCreateChannel}
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

// ============================================================================
// Member Picker Overlay (replaces window.prompt)
// ============================================================================

function MemberPickerOverlay({
    title,
    members,
    onSelect,
    onClose,
    emptyText = 'No members available.',
    variant = 'default',
}: {
    title: string;
    members: WorkspaceMember[];
    onSelect: (userId: string) => void;
    onClose: () => void;
    emptyText?: string;
    variant?: 'default' | 'danger';
}) {
    return (
        <div className="border-b border-border/60 bg-card/80 backdrop-blur-sm">
            <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wider">{title}</h4>
                    <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
                {members.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic py-2">{emptyText}</p>
                ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                        {members.map((m) => (
                            <button
                                key={m.user_id}
                                type="button"
                                onClick={() => onSelect(m.user_id)}
                                className={cn(
                                    'w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors',
                                    variant === 'danger'
                                        ? 'hover:bg-red-950/40 hover:text-red-300'
                                        : 'hover:bg-muted hover:text-zinc-100',
                                    'text-muted-foreground'
                                )}
                            >
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-foreground text-[10px] font-bold flex-shrink-0">
                                    {(m.display_name || m.email || 'U')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="truncate font-medium">{m.display_name || m.email || 'Unknown'}</p>
                                    {m.email && m.display_name && (
                                        <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                                    )}
                                </div>
                                <span className={cn(
                                    'text-[10px] font-medium',
                                    variant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                                )}>
                                    {variant === 'danger' ? 'Remove' : 'Add'}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
