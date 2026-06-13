'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManagerStore } from '@/store/windowManagerStore';
import { WorkspaceContent } from '@/components/workspace/WorkspaceContent';
import { workspaceApi, type WorkspaceMember, type WorkspaceConversation } from '@/lib/workspace-api';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Contact Rail Types ──────────────────────────────────────
interface ConversationContact {
    userId: string;
    displayName: string;
    email?: string;
    conversationId: string;
    isOnline?: boolean;
}

// ─── Contact Rail (left icon strip) ─────────────────────────
interface ContactRailProps {
    contacts: ConversationContact[];
    activeConversationId?: string | null;
    onSelectKobby: () => void;
    onSelectContact: (contact: ConversationContact) => void;
    isKobbyActive: boolean;
}

function ContactRail({ contacts, activeConversationId, onSelectKobby, onSelectContact, isKobbyActive }: ContactRailProps) {
    return (
        <div className="flex-shrink-0 w-14 bg-card/40 border-r border-border/50 flex flex-col items-center py-3 gap-1 overflow-y-auto">
            {/* Kobby AI — pinned at top */}
            <button
                onClick={onSelectKobby}
                className={cn(
                    'relative w-10 h-10 rounded-xl flex items-center justify-center transition-all group',
                    isKobbyActive
                        ? 'bg-violet-600 shadow-lg shadow-violet-600/30'
                        : 'bg-muted hover:bg-violet-600/20'
                )}
                title="Kobby AI"
            >
                <Bot className={cn('w-5 h-5', isKobbyActive ? 'text-foreground' : 'text-violet-600 dark:text-violet-400')} />
                <Pin className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-amber-500" />
            </button>

            {/* Divider — only show if there are contacts */}
            {contacts.length > 0 && (
                <div className="w-6 border-t border-border/50 my-1" />
            )}

            {/* Conversation contacts — only people you've chatted with */}
            {contacts.map((contact) => {
                const initial = (contact.displayName || 'U')[0].toUpperCase();
                const isActive = activeConversationId === contact.conversationId;

                return (
                    <button
                        key={contact.userId}
                        onClick={() => onSelectContact(contact)}
                        className={cn(
                            'relative w-10 h-10 rounded-xl flex items-center justify-center transition-all group',
                            isActive
                                ? 'bg-emerald-600 shadow-lg shadow-emerald-600/20'
                                : 'bg-muted hover:bg-zinc-700'
                        )}
                        title={contact.displayName}
                    >
                        <span className={cn(
                            'text-xs font-bold',
                            isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                        )}>
                            {initial}
                        </span>
                        {/* Online indicator */}
                        <span className={cn(
                            'absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-border',
                            contact.isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
                        )} />
                    </button>
                );
            })}
        </div>
    );
}

// ─── Main Panel ──────────────────────────────────────────────
export function FloatingWindowManager() {
    const { panel, closePanel } = useWindowManagerStore();
    const [mounted, setMounted] = useState(false);
    const [contacts, setContacts] = useState<ConversationContact[]>([]);
    const [forceTab, setForceTab] = useState<'kobby' | 'chat' | null>(null);
    const [forceConversationId, setForceConversationId] = useState<string | null>(null);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

    useEffect(() => { setMounted(true); }, []);

    // Close on Escape
    useEffect(() => {
        if (!panel.isOpen) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [panel.isOpen, closePanel]);

    // Load DM conversations when panel opens (only people you've chatted with)
    useEffect(() => {
        if (!panel.isOpen || !panel.data?.entityType || !panel.data?.entityId) return;

        workspaceApi.getOrCreate(panel.data.entityType, panel.data.entityId)
            .then(async ({ workspace }) => {
                if (!workspace?.id) return;
                const { conversations } = await workspaceApi.getConversations(workspace.id);

                // Extract contacts from DM conversations only
                const dmContacts: ConversationContact[] = conversations
                    .filter((c: WorkspaceConversation) => c.conversation_type === 'dm')
                    .map((c: WorkspaceConversation) => {
                        // DM key is "userId1:userId2"
                        const ids = (c.dm_key || '').split(':').filter(Boolean);
                        const otherUserId = ids.find((id) => id !== panel.data?.currentUserId) || ids[0] || '';
                        return {
                            userId: otherUserId,
                            displayName: c.name || otherUserId.substring(0, 8),
                            conversationId: c.id,
                        };
                    })
                    .filter((c: ConversationContact) => c.userId);

                // Try to enrich names from workspace members
                try {
                    const { members } = await workspaceApi.getMembers(workspace.id);
                    for (const contact of dmContacts) {
                        const member = members.find((m: WorkspaceMember) => m.user_id === contact.userId);
                        if (member) {
                            contact.displayName = member.display_name || member.email || contact.displayName;
                            contact.email = member.email;
                        }
                    }
                } catch { /* members enrichment is optional */ }

                setContacts(dmContacts);
            })
            .catch(() => {});
    }, [panel.isOpen, panel.data?.entityType, panel.data?.entityId, panel.data?.currentUserId]);

    // Reset state when panel closes
    useEffect(() => {
        if (!panel.isOpen) {
            setForceTab(null);
            setForceConversationId(null);
        }
    }, [panel.isOpen]);

    const handleSelectKobby = useCallback(() => {
        setForceTab('kobby');
        setForceConversationId(null);
    }, []);

    const handleSelectContact = useCallback((contact: ConversationContact) => {
        setForceTab('chat');
        setForceConversationId(contact.conversationId);
        setActiveConversationId(contact.conversationId);
    }, []);

    // Track active conversation from WorkspaceContent
    const handleConversationChange = useCallback((conversationId: string | null) => {
        setActiveConversationId(conversationId);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {panel.isOpen && (
                <>
                    {/* Click-away layer — no blur, transparent */}
                    <motion.div
                        key="workspace-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={closePanel}
                        className="fixed inset-0 z-[200]"
                    />

                    {/* Slide-in Panel */}
                    <motion.div
                        key="workspace-panel"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed top-0 right-0 z-[201] h-full w-full md:w-[480px] flex bg-background border-l border-border shadow-2xl shadow-black/50"
                    >
                        {/* Left Contact Rail */}
                        <ContactRail
                            contacts={contacts}
                            activeConversationId={activeConversationId}
                            onSelectKobby={handleSelectKobby}
                            onSelectContact={handleSelectContact}
                            isKobbyActive={forceTab === 'kobby'}
                        />

                        {/* Right Content Area */}
                        <div className="flex-1 flex flex-col min-w-0">
                            {/* Panel Header */}
                            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-card/60 border-b border-border">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                                    <span className="text-sm font-semibold text-zinc-100">
                                        {panel.title || 'Workspace'}
                                    </span>
                                </div>
                                <button
                                    onClick={closePanel}
                                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-zinc-200 transition-colors"
                                    aria-label="Close workspace"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-h-0 overflow-hidden">
                                {panel.type === 'workspace' && panel.data && (
                                    <WorkspaceContent
                                        {...panel.data}
                                        onClose={closePanel}
                                        initialTab={forceTab || undefined}
                                        forceConversationId={forceConversationId}
                                        onConversationChange={handleConversationChange}
                                    />
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
