'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    MessageCircle,
    Search,
    RefreshCw,
    User,
    Phone,
    Clock,
    CheckCheck,
    Filter,
    BarChart3,
    Send,
    Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WhatsAppChat } from '@/components/crm/WhatsAppChat';
import { EmptyState } from '@/components/crm/EmptyState';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Types
interface Conversation {
    conversation_id: string;
    contact_id?: string;
    phone_number: string;
    contact_name?: string;
    avatar_url?: string;
    message_count: number;
    last_message_at: string;
    last_message?: string;
    unread_count: number;
}

interface MessagingStats {
    total_messages: number;
    sent: number;
    received: number;
    delivered: number;
    read: number;
    failed: number;
    unique_contacts: number;
    last_24h: number;
    last_7d: number;
}

interface ApiStatus {
    configured: boolean;
    status: string;
    message: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

// Conversation List Item
function ConversationItem({
    conversation,
    isSelected,
    onClick,
}: {
    conversation: Conversation;
    isSelected: boolean;
    onClick: () => void;
}) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-border',
                isSelected ? 'bg-muted' : 'hover:bg-muted/50'
            )}
        >
            <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={conversation.avatar_url || undefined} />
                <AvatarFallback className="bg-green-600 text-foreground">
                    {conversation.contact_name
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase() || <User className="h-5 w-5" />}
                </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <span className="font-medium truncate">
                        {conversation.contact_name || conversation.phone_number}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelativeTime(conversation.last_message_at)}
                    </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <p className="text-sm text-muted-foreground truncate pr-2">
                        {conversation.last_message || 'No messages'}
                    </p>
                    {conversation.unread_count > 0 && (
                        <Badge className="bg-green-600 text-foreground shrink-0">
                            {conversation.unread_count}
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    );
}

// Stats Card
function StatsCard({ stats }: { stats: MessagingStats }) {
    return (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <Card className="shadow-sm">
                <CardContent className="pt-4 pb-3 px-3">
                    <div className="text-center">
                        <p className="text-2xl font-bold">{stats.total_messages}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm">
                <CardContent className="pt-4 pb-3 px-3">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-blue-500">{stats.sent}</p>
                        <p className="text-xs text-muted-foreground">Sent</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm">
                <CardContent className="pt-4 pb-3 px-3">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-green-500">{stats.received}</p>
                        <p className="text-xs text-muted-foreground">Received</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm">
                <CardContent className="pt-4 pb-3 px-3">
                    <div className="text-center">
                        <p className="text-2xl font-bold">{stats.unique_contacts}</p>
                        <p className="text-xs text-muted-foreground">Contacts</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm">
                <CardContent className="pt-4 pb-3 px-3">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{stats.last_24h}</p>
                        <p className="text-xs text-muted-foreground">24h</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm">
                <CardContent className="pt-4 pb-3 px-3">
                    <div className="text-center">
                        <p className="text-2xl font-bold">{stats.last_7d}</p>
                        <p className="text-xs text-muted-foreground">7 days</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function MessagingPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [stats, setStats] = useState<MessagingStats | null>(null);
    const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [convRes, statsRes, statusRes] = await Promise.all([
                fetch(`${API_BASE}/api/messaging/conversations`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/messaging/stats`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/messaging/status`, { credentials: 'include' }),
            ]);

            if (convRes.ok) {
                const data = await convRes.json();
                setConversations(data.conversations || []);
            }
            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data.stats);
            }
            if (statusRes.ok) {
                const data = await statusRes.json();
                setApiStatus(data);
            }
        } catch (error) {
            console.error('Failed to fetch messaging data:', error);
            toast.error('Failed to load messaging data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredConversations = conversations.filter((c) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            c.contact_name?.toLowerCase().includes(query) ||
            c.phone_number.includes(query) ||
            c.last_message?.toLowerCase().includes(query)
        );
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-green-500" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                        <MessageCircle className="h-6 w-6 text-green-500" />
                        WhatsApp Messaging
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage conversations with contacts and leads
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {apiStatus && (
                        <Badge
                            variant="outline"
                            className={cn(
                                apiStatus.configured
                                    ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                    : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                            )}
                        >
                            {apiStatus.status}
                        </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={fetchData}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Stats */}
            {stats && <StatsCard stats={stats} />}

            {/* Not Configured Warning */}
            {apiStatus && !apiStatus.configured && (
                <Card className="bg-yellow-500/10 border-yellow-500/20">
                    <CardContent className="py-4">
                        <div className="flex items-center gap-3">
                            <Settings className="h-5 w-5 text-yellow-500" />
                            <div>
                                <p className="font-medium text-yellow-500">WhatsApp API Not Configured</p>
                                <p className="text-sm text-muted-foreground">
                                    Configure your WhatsApp Business API credentials to send and receive messages.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main Content */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Conversation List */}
                <Card className="w-[360px] shadow-sm flex flex-col">
                    <CardHeader className="pb-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search conversations..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        {filteredConversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <MessageCircle className="h-12 w-12 mb-2" />
                                <p>No conversations</p>
                                <p className="text-sm">Messages will appear here</p>
                            </div>
                        ) : (
                            filteredConversations.map((conv) => (
                                <ConversationItem
                                    key={conv.conversation_id}
                                    conversation={conv}
                                    isSelected={selectedConversation?.conversation_id === conv.conversation_id}
                                    onClick={() => setSelectedConversation(conv)}
                                />
                            ))
                        )}
                    </ScrollArea>
                </Card>

                {/* Chat Panel */}
                <div className="flex-1">
                    {selectedConversation ? (
                        <WhatsAppChat
                            contactId={selectedConversation.contact_id || undefined}
                            contactName={selectedConversation.contact_name || undefined}
                            contactPhone={selectedConversation.phone_number}
                            contactAvatar={selectedConversation.avatar_url || undefined}
                            className="h-full"
                        />
                    ) : (
                        <Card className="shadow-sm h-full flex flex-col items-center justify-center">
                            <MessageCircle className="h-16 w-16 text-muted-foreground/30 mb-4" />
                            <h3 className="text-lg font-medium text-muted-foreground">Select a conversation</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Choose a conversation from the list to view messages
                            </p>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
