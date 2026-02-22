'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    MessageCircle,
    Send,
    Phone,
    Image,
    FileText,
    Smile,
    Paperclip,
    Check,
    CheckCheck,
    Clock,
    AlertCircle,
    X,
    Maximize2,
    Minimize2,
    RefreshCw,
    User,
    MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Types
interface WhatsAppMessage {
    id: string;
    wa_message_id?: string;
    direction: 'inbound' | 'outbound';
    from_phone?: string;
    to_phone: string;
    message_type: 'text' | 'template' | 'document' | 'image';
    content?: string;
    template_name?: string;
    media_url?: string;
    status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
    error_message?: string;
    sent_by_name?: string;
    created_at: string;
}

interface Template {
    name: string;
    language: string;
    category: string;
    description: string;
    components: Array<{
        type: string;
        text: string;
    }>;
}

interface WhatsAppChatProps {
    contactId?: string;
    contactName?: string;
    contactPhone?: string;
    contactAvatar?: string;
    dealId?: string;
    dealName?: string;
    isExpanded?: boolean;
    onClose?: () => void;
    className?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Helper functions
function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-GH', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-GH', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
        });
    }
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'read':
            return <CheckCheck className="h-3 w-3 text-info" />;
        case 'delivered':
            return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
        case 'sent':
            return <Check className="h-3 w-3 text-muted-foreground" />;
        case 'pending':
            return <Clock className="h-3 w-3 text-muted-foreground" />;
        case 'failed':
            return <AlertCircle className="h-3 w-3 text-destructive" />;
        default:
            return null;
    }
}

// Message Bubble Component
function MessageBubble({ message }: { message: WhatsAppMessage }) {
    const isOutbound = message.direction === 'outbound';

    return (
        <div className={cn('flex mb-2', isOutbound ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2',
                    isOutbound
                        ? 'bg-whatsapp text-white rounded-br-none'
                        : 'bg-muted text-white rounded-bl-none'
                )}
            >
                {message.message_type === 'template' && (
                    <Badge variant="outline" className="mb-1 text-xs bg-transparent border-white/30 text-white/70">
                        Template: {message.template_name}
                    </Badge>
                )}
                
                {message.message_type === 'document' && message.media_url && (
                    <div className="flex items-center gap-2 mb-1 p-2 bg-black/20 rounded">
                        <FileText className="h-4 w-4" />
                        <a 
                            href={message.media_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm underline"
                        >
                            View Document
                        </a>
                    </div>
                )}

                {message.message_type === 'image' && message.media_url && (
                    <img 
                        src={message.media_url} 
                        alt="Shared image" 
                        className="max-w-full rounded mb-1"
                    />
                )}

                <p className="text-sm whitespace-pre-wrap break-words">
                    {message.content}
                </p>

                <div className={cn(
                    'flex items-center gap-1 mt-1',
                    isOutbound ? 'justify-end' : 'justify-start'
                )}>
                    <span className="text-[10px] text-white/60">
                        {formatTime(message.created_at)}
                    </span>
                    {isOutbound && getStatusIcon(message.status)}
                </div>

                {message.status === 'failed' && message.error_message && (
                    <p className="text-xs text-destructive mt-1">{message.error_message}</p>
                )}
            </div>
        </div>
    );
}

// Template Dialog Component
function TemplateDialog({
    open,
    onOpenChange,
    templates,
    onSend,
    loading,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    templates: Template[];
    onSend: (template: Template, params: string[]) => void;
    loading: boolean;
}) {
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [parameters, setParameters] = useState<string[]>([]);

    useEffect(() => {
        if (selectedTemplate) {
            // Extract parameter placeholders from template
            const bodyComponent = selectedTemplate.components.find(c => c.type === 'BODY');
            if (bodyComponent) {
                const matches = bodyComponent.text.match(/\{\{\d+\}\}/g) || [];
                setParameters(new Array(matches.length).fill(''));
            }
        }
    }, [selectedTemplate]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-background border-border max-w-md">
                <DialogHeader>
                    <DialogTitle>Send Template Message</DialogTitle>
                    <DialogDescription>
                        Select a pre-approved template to send
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Template</Label>
                        <Select onValueChange={(name) => {
                            const template = templates.find(t => t.name === name);
                            setSelectedTemplate(template || null);
                        }}>
                            <SelectTrigger className="bg-muted border-border">
                                <SelectValue placeholder="Select a template" />
                            </SelectTrigger>
                            <SelectContent>
                                {templates.map((t) => (
                                    <SelectItem key={t.name} value={t.name}>
                                        <div>
                                            <div className="font-medium">{t.name.replace(/_/g, ' ')}</div>
                                            <div className="text-xs text-muted-foreground">{t.description}</div>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedTemplate && (
                        <>
                            <div className="p-3 bg-muted rounded-lg text-sm">
                                <p className="text-muted-foreground mb-2">Preview:</p>
                                <p className="text-white">
                                    {selectedTemplate.components.find(c => c.type === 'BODY')?.text}
                                </p>
                            </div>

                            {parameters.length > 0 && (
                                <div className="space-y-3">
                                    <Label>Parameters</Label>
                                    {parameters.map((_, index) => (
                                        <Input
                                            key={index}
                                            placeholder={`Parameter {{${index + 1}}}`}
                                            value={parameters[index]}
                                            onChange={(e) => {
                                                const newParams = [...parameters];
                                                newParams[index] = e.target.value;
                                                setParameters(newParams);
                                            }}
                                            className="bg-muted border-border"
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!selectedTemplate || loading}
                        onClick={() => selectedTemplate && onSend(selectedTemplate, parameters)}
                        className="bg-whatsapp hover:bg-whatsapp/90"
                    >
                        {loading ? 'Sending...' : 'Send Template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Main WhatsApp Chat Component
export function WhatsAppChat({
    contactId,
    contactName,
    contactPhone,
    contactAvatar,
    dealId,
    dealName,
    isExpanded = false,
    onClose,
    className,
}: WhatsAppChatProps) {
    const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [expanded, setExpanded] = useState(isExpanded);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Fetch messages
    const fetchMessages = useCallback(async () => {
        if (!contactId && !contactPhone) return;

        setLoading(true);
        try {
            let url = `${API_BASE}/api/messaging/messages?limit=50`;
            if (contactId) url += `&contact_id=${contactId}`;
            if (dealId) url += `&deal_id=${dealId}`;
            if (contactPhone && !contactId) url += `&phone=${contactPhone}`;

            const response = await fetch(url, { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                setMessages((data.messages || []).reverse());
            }
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        } finally {
            setLoading(false);
        }
    }, [contactId, contactPhone, dealId]);

    // Fetch templates
    const fetchTemplates = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/messaging/templates`, { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                setTemplates(data.templates || []);
            }
        } catch (error) {
            console.error('Failed to fetch templates:', error);
        }
    }, []);

    useEffect(() => {
        fetchMessages();
        fetchTemplates();
    }, [fetchMessages, fetchTemplates]);

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Send text message
    const handleSend = async () => {
        if (!newMessage.trim() || !contactPhone) return;

        setSending(true);
        try {
            const response = await fetch(`${API_BASE}/api/messaging/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    phone_number: contactPhone,
                    message: newMessage,
                    contact_id: contactId,
                    deal_id: dealId,
                }),
            });

            if (response.ok) {
                setNewMessage('');
                fetchMessages();
                toast.success('Message sent');
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to send message');
            }
        } catch (error) {
            toast.error('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    // Send template message
    const handleSendTemplate = async (template: Template, params: string[]) => {
        if (!contactPhone) return;

        setSending(true);
        try {
            const response = await fetch(`${API_BASE}/api/messaging/send-template`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    phone_number: contactPhone,
                    template_name: template.name,
                    language: template.language,
                    parameters: params.map(p => ({ type: 'text', text: p })),
                    contact_id: contactId,
                    deal_id: dealId,
                }),
            });

            if (response.ok) {
                setTemplateDialogOpen(false);
                fetchMessages();
                toast.success('Template message sent');
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to send template');
            }
        } catch (error) {
            toast.error('Failed to send template');
        } finally {
            setSending(false);
        }
    };

    // Group messages by date
    const groupedMessages = messages.reduce((groups: Record<string, WhatsAppMessage[]>, message) => {
        const date = formatDate(message.created_at);
        if (!groups[date]) groups[date] = [];
        groups[date].push(message);
        return groups;
    }, {});

    if (!contactPhone) {
        return (
            <Card className={cn('bg-background border-border', className)}>
                <CardContent className="flex flex-col items-center justify-center py-8">
                    <Phone className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No phone number available</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn(
            'bg-background border-border flex flex-col',
            expanded ? 'fixed inset-4 z-50' : 'h-[500px]',
            className
        )}>
            {/* Header */}
            <CardHeader className="pb-2 border-b border-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={contactAvatar} />
                            <AvatarFallback className="bg-whatsapp text-white">
                                {contactName?.split(' ').map(n => n[0]).join('').toUpperCase() || <User className="h-5 w-5" />}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <MessageCircle className="h-4 w-4 text-whatsapp" />
                                {contactName || 'WhatsApp'}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{contactPhone}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={fetchMessages}>
                                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Refresh</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)}>
                            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                        {onClose && (
                            <Button variant="ghost" size="icon" onClick={onClose}>
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            {/* Messages */}
            <ScrollArea ref={scrollRef} className="flex-1 p-4">
                {loading && messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <MessageCircle className="h-12 w-12 mb-2" />
                        <p>No messages yet</p>
                        <p className="text-sm">Start a conversation!</p>
                    </div>
                ) : (
                    <>
                        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
                            <div key={date}>
                                <div className="flex justify-center my-3">
                                    <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                                        {date}
                                    </span>
                                </div>
                                {dateMessages.map((message) => (
                                    <MessageBubble key={message.id} message={message} />
                                ))}
                            </div>
                        ))}
                    </>
                )}
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t border-border">
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0">
                                <Paperclip className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="bg-background border-border">
                            <DropdownMenuItem onClick={() => setTemplateDialogOpen(true)}>
                                <FileText className="h-4 w-4 mr-2" />
                                Send Template
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>
                                <Image className="h-4 w-4 mr-2" />
                                Send Image (coming soon)
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                                <FileText className="h-4 w-4 mr-2" />
                                Send Document (coming soon)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Input
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        className="bg-muted border-border"
                        disabled={sending}
                    />

                    <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!newMessage.trim() || sending}
                        className="shrink-0 bg-whatsapp hover:bg-whatsapp/90"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Template Dialog */}
            <TemplateDialog
                open={templateDialogOpen}
                onOpenChange={setTemplateDialogOpen}
                templates={templates}
                onSend={handleSendTemplate}
                loading={sending}
            />
        </Card>
    );
}

// WhatsApp Button Component (for quick access)
export function WhatsAppButton({
    contactId,
    contactName,
    contactPhone,
    contactAvatar,
    dealId,
    dealName,
    variant = 'default',
    size = 'default',
}: WhatsAppChatProps & { 
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'lg' | 'icon';
}) {
    const [chatOpen, setChatOpen] = useState(false);

    if (!contactPhone) return null;

    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={variant}
                            size={size}
                            onClick={() => setChatOpen(true)}
                            className={cn(
                                size === 'icon' ? 'w-9 h-9' : '',
                                variant === 'default' && 'bg-whatsapp hover:bg-whatsapp/90'
                            )}
                        >
                            <MessageCircle className={cn('h-4 w-4', size !== 'icon' && 'mr-2')} />
                            {size !== 'icon' && 'WhatsApp'}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Send WhatsApp message</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <Dialog open={chatOpen} onOpenChange={setChatOpen}>
                <DialogContent className="p-0 max-w-md bg-transparent border-none">
                    <WhatsAppChat
                        contactId={contactId}
                        contactName={contactName}
                        contactPhone={contactPhone}
                        contactAvatar={contactAvatar}
                        dealId={dealId}
                        dealName={dealName}
                        onClose={() => setChatOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}

export default WhatsAppChat;
