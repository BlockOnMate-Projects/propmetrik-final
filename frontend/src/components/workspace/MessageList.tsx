'use client';

import { useEffect, useRef, memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { WorkspaceMessage } from '@/lib/workspace-api';
import { Bot, Info, Paperclip, Share2 } from 'lucide-react';
import { KobbyAIBubble, KobbyThinkingIndicator } from './KobbyAIBubble';
import { useWindowManagerStore } from '@/store/windowManagerStore';
import { Button } from '@/components/ui/button';

interface MessageListProps {
    messages: WorkspaceMessage[];
    currentUserId?: string | null;
    typingUsers?: Set<string>;
    isKobbyThinking?: boolean;
    kobbyPendingQuery?: string | null;
    onVisible?: (messageId: string) => void; // for read tracking
    onKobbyFollowUp?: (suggestion: string) => void;
    onReply?: (message: WorkspaceMessage) => void;
}

function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

// Group messages by date
function groupMessagesByDate(messages: WorkspaceMessage[]) {
    const groups: { date: string; messages: WorkspaceMessage[] }[] = [];
    let currentDate = '';

    for (const msg of messages) {
        const date = new Date(msg.created_at).toDateString();
        if (date !== currentDate) {
            currentDate = date;
            groups.push({ date: msg.created_at, messages: [msg] });
        } else {
            groups[groups.length - 1].messages.push(msg);
        }
    }
    return groups;
}

const MessageBubble = memo(function MessageBubble({
    message,
    isOwn,
    onVisible,
    onKobbyFollowUp,
    onReply,
}: {
    message: WorkspaceMessage;
    isOwn: boolean;
    onVisible?: (id: string) => void;
    onKobbyFollowUp?: (suggestion: string) => void;
    onReply?: (message: WorkspaceMessage) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!onVisible || isOwn) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    onVisible(message.id);
                    observer.disconnect();
                }
            },
            { threshold: 0.5 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [message.id, isOwn, onVisible]);

    if (message.sender_type === 'system') {
        return (
            <div className="flex justify-center my-1">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    <span>{message.content}</span>
                </div>
            </div>
        );
    }

    if (message.sender_type === 'kobby_ai') {
        const md = message.metadata || {};
        const responseData = {
            answer: message.content,
            confidence: md.confidence || 0.8,
            sources: md.sources || [],
            followUpSuggestions: md.followUpSuggestions || [],
            dataPoints: md.dataPoints || [],
        };

        const { openWindow } = useWindowManagerStore();

        const handlePopOut = () => {
            openWindow({
                id: `insight-${message.id}`,
                type: 'insight',
                title: `Analysis: ${md.query || 'Kobby Insight'}`,
                data: {
                    content: message.content,
                    dataPoints: md.dataPoints,
                    sources: md.sources
                },
                size: { width: 500, height: 400 },
                position: { x: 50, y: 150 }
            });
        };

        return (
            <div ref={ref} className="group relative">
                <KobbyAIBubble
                    query={md.query}
                    response={responseData}
                    timestamp={message.created_at}
                    onFollowUp={onKobbyFollowUp}
                />
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePopOut}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2 font-mono text-[10px] bg-violet-950/40 border border-violet-800/40 text-violet-300 hover:bg-violet-900"
                >
                    <Share2 className="w-3 h-3 mr-1" />
                    POP OUT
                </Button>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            className={cn(
                'flex gap-2 mb-3 items-end',
                isOwn ? 'flex-row-reverse' : 'flex-row'
            )}
        >
            {/* Avatar */}
            {!isOwn && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold shadow">
                    {(message.sender_name || 'U')[0].toUpperCase()}
                </div>
            )}

            <div className={cn('max-w-[75%]', isOwn ? 'items-end' : 'items-start', 'flex flex-col')}>
                {!isOwn && message.sender_name && (
                    <p className="text-xs font-medium text-zinc-400 mb-1 ml-1">{message.sender_name}</p>
                )}
                <div
                    className={cn(
                        'px-4 py-2.5 text-sm leading-relaxed rounded-2xl break-words relative group',
                        isOwn
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-br-sm shadow-lg shadow-emerald-500/10'
                            : 'bg-zinc-800 text-zinc-100 rounded-bl-sm border border-zinc-700/50'
                    )}
                >
                    {/* Reply button */}
                    <button
                        onClick={() => onReply?.(message)}
                        className={cn(
                            "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-zinc-900/80 text-zinc-400 hover:text-zinc-200",
                            isOwn ? "-left-10" : "-right-10"
                        )}
                        title="Reply"
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 17 4 12 9 7" />
                            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                        </svg>
                    </button>

                    {message.thread_id && (
                        <div className="mb-2 p-2 rounded bg-black/20 border-l-2 border-emerald-500/50 text-[11px] opacity-80 italic italic">
                            Replying to a message...
                        </div>
                    )}

                    {message.content}

                    {message.metadata?.file && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-2">
                            {(message.metadata as any).file.file_type?.startsWith('image/') ? (
                                <img
                                    src={(message.metadata as any).file.url}
                                    alt={(message.metadata as any).file.file_name}
                                    className="rounded-lg max-w-full h-auto border border-white/5 cursor-pointer hover:opacity-90"
                                    onClick={() => window.open((message.metadata as any).file.url, '_blank')}
                                />
                            ) : (
                                <a
                                    href={(message.metadata as any).file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 p-2 rounded bg-black/20 hover:bg-black/40 transition-colors"
                                >
                                    <Paperclip className="w-3.5 h-3.5" />
                                    <span className="text-xs truncate">{(message.metadata as any).file.file_name}</span>
                                </a>
                            )}
                        </div>
                    )}
                </div>
                <p className={cn('text-xs text-zinc-600 mt-1', isOwn ? 'mr-1 text-right' : 'ml-1')}>
                    {formatTime(message.created_at)}
                </p>
            </div>
        </div>
    );
});

export function MessageList({
    messages,
    currentUserId,
    typingUsers,
    isKobbyThinking,
    kobbyPendingQuery,
    onVisible,
    onKobbyFollowUp,
    onReply,
}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
        if (isNearBottom) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Initial scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }, []);

    const groups = groupMessagesByDate(messages);

    return (
        <div
            ref={containerRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-700"
        >
            {groups.map((group) => (
                <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-zinc-800" />
                        <span className="text-xs text-zinc-500 flex-shrink-0 font-medium">
                            {formatDate(group.date)}
                        </span>
                        <div className="flex-1 h-px bg-zinc-800" />
                    </div>

                    {group.messages.map((msg) => (
                        <MessageBubble
                            key={msg.id}
                            message={msg}
                            isOwn={msg.sender_id === currentUserId}
                            onVisible={onVisible}
                            onKobbyFollowUp={onKobbyFollowUp}
                            onReply={onReply}
                        />
                    ))}
                </div>
            ))}

            {/* Typing indicator */}
            {typingUsers && typingUsers.size > 0 && (
                <div className="flex items-center gap-2 pl-1 py-1">
                    <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs text-zinc-500">
                        {typingUsers.size === 1 ? 'Someone is' : `${typingUsers.size} people are`} typing...
                    </span>
                </div>
            )}

            {/* Kobby thinking indicator */}
            {isKobbyThinking && (
                <div className="py-2">
                    <KobbyThinkingIndicator query={kobbyPendingQuery || undefined} />
                </div>
            )}

            <div ref={bottomRef} />
        </div>
    );
}
