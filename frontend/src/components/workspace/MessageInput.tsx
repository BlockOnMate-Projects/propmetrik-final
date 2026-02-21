'use client';

import { useState, useRef, KeyboardEvent, useCallback } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface MessageInputProps {
    workspaceId: string;
    onSend: (content: string, metadata?: any, threadId?: string) => void;
    onTyping?: () => void;
    disabled?: boolean;
    placeholder?: string;
    connected?: boolean;
    replyingTo?: { id: string; senderName: string; content: string } | null;
    onCancelReply?: () => void;
}

export function MessageInput({
    workspaceId,
    onSend,
    onTyping,
    disabled,
    placeholder = 'Type a message... (or @kobby to ask AI)',
    connected = true,
    replyingTo,
    onCancelReply,
}: MessageInputProps) {
    const [value, setValue] = useState('');
    const [isKobbyMention, setIsKobbyMention] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [attachment, setAttachment] = useState<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleChange = (val: string) => {
        setValue(val);

        // Detect @kobby mention
        const hasMention = val.toLowerCase().includes('@kobby');
        setIsKobbyMention(hasMention);

        // Throttle typing indicator
        if (onTyping) {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                onTyping();
            }, 300);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // 1. Get presigned URL
            const res = await fetch(`/api/workspace/${workspaceId}/files/presigned-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ fileName: file.name, fileType: file.type }),
            });
            const { presignedUrl, fileKey } = await res.json();

            // 2. Upload to S3/Mock
            await fetch(presignedUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type },
            });

            // 3. Persist metadata
            const metaRes = await fetch(`/api/workspace/${workspaceId}/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    fileKey,
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size
                }),
            });
            const { file: fileData } = await metaRes.json();

            setAttachment(fileData);
        } catch (err) {
            console.error('File upload failed', err);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSend = useCallback(() => {
        const content = value.trim();
        if ((!content && !attachment) || disabled) return;

        const metadata = attachment ? { file: attachment } : undefined;
        onSend(content, metadata, replyingTo?.id);

        setValue('');
        setAttachment(null);
        setIsKobbyMention(false);
        onCancelReply?.();
        textareaRef.current?.focus();
    }, [value, attachment, disabled, onSend, replyingTo, onCancelReply]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="border-t border-zinc-800/60 bg-zinc-950/60 px-4 py-3">
            {/* Reply Preview */}
            {replyingTo && (
                <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 animate-slide-up">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Replying to {replyingTo.senderName}</p>
                        <p className="text-xs text-zinc-400 truncate">{replyingTo.content}</p>
                    </div>
                    <button
                        onClick={onCancelReply}
                        className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300"
                    >
                        <span className="text-lg">×</span>
                    </button>
                </div>
            )}

            {/* Kobby AI suggestion chip */}
            {isKobbyMention && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-violet-950/60 border border-violet-800/40 text-xs text-violet-300 animate-fade-in">
                    <span className="text-base">✨</span>
                    <span>
                        <span className="font-semibold text-violet-200">Kobby AI</span> — asking about this{' '}
                        workspace entity. Press Enter to send.
                    </span>
                </div>
            )}

            {/* Connection indicator */}
            {!connected && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800/40 text-xs text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Reconnecting to workspace...
                </div>
            )}

            <div className="flex items-end gap-2">
                {/* File attachment button */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <button
                    type="button"
                    disabled={disabled || !connected || isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        "flex-shrink-0 p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        attachment && "text-emerald-500 bg-emerald-500/10"
                    )}
                    title="Attach file"
                >
                    {isUploading ? (
                        <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                    ) : (
                        <Paperclip className="w-4 h-4" />
                    )}
                </button>

                {/* Text area */}
                <div className="flex flex-col flex-1 gap-2">
                    {attachment && (
                        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-800/40 border border-emerald-500/20 w-fit animate-fade-in">
                            <Paperclip className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] text-zinc-300 truncate max-w-[150px]">{attachment.file_name}</span>
                            <button
                                onClick={() => setAttachment(null)}
                                className="ml-1 text-zinc-500 hover:text-zinc-300"
                            >
                                ×
                            </button>
                        </div>
                    )}
                    <div className="relative">
                        <Textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => handleChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            disabled={disabled || !connected}
                            rows={1}
                            className={cn(
                                'resize-none min-h-[40px] max-h-[120px] text-sm',
                                'bg-zinc-800/60 border-zinc-700/50 rounded-xl',
                                'text-zinc-100 placeholder:text-zinc-500',
                                'focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-600/50',
                                'transition-all duration-200',
                                'scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent',
                                isKobbyMention && 'border-violet-700/50 focus:ring-violet-500/50 focus:border-violet-600/50'
                            )}
                            style={{ fieldSizing: 'content' } as any}
                        />
                    </div>
                </div>

                {/* Send button */}
                <Button
                    type="button"
                    size="icon"
                    onClick={handleSend}
                    disabled={(!value.trim() && !attachment) || disabled || !connected || isUploading}
                    className={cn(
                        'flex-shrink-0 w-9 h-9 rounded-xl shadow-lg transition-all duration-200',
                        isKobbyMention
                            ? 'bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 shadow-violet-500/25'
                            : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/25',
                        'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none'
                    )}
                >
                    <Send className="w-4 h-4" />
                </Button>
            </div>

            {/* Hint */}
            <p className="text-xs text-zinc-600 mt-2 ml-1">
                Enter to send · Shift+Enter new line · @kobby to ask AI
            </p>
        </div>
    );
}
