'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { WorkspaceMember, MemberRole } from '@/lib/workspace-api';
import { User, Eye, Crown } from 'lucide-react';

interface WorkspaceMemberListProps {
    members: WorkspaceMember[];
    currentUserId?: string | null;
    onlineUserIds?: string[];
    onRefresh?: () => void;
    onMemberClick?: (member: WorkspaceMember) => void;
    onCreateGroup?: (groupName: string, memberIds: string[]) => void;
    onCreateChannel?: (name: string) => void;
}

const roleConfig: Record<MemberRole, { icon: typeof User; label: string; color: string }> = {
    admin: { icon: Crown, label: 'Admin', color: 'text-amber-600 dark:text-amber-400' },
    member: { icon: User, label: 'Member', color: 'text-muted-foreground' },
    viewer: { icon: Eye, label: 'Viewer', color: 'text-muted-foreground' },
};

export function WorkspaceMemberList({ members, currentUserId, onlineUserIds = [], onRefresh, onMemberClick, onCreateGroup, onCreateChannel }: WorkspaceMemberListProps) {
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [isCreatingChannel, setIsCreatingChannel] = useState(false);
    const [channelName, setChannelName] = useState('');

    const handleCreateChannel = () => {
        if (!channelName.trim() || !onCreateChannel) return;
        onCreateChannel(channelName.trim());
        setChannelName('');
        setIsCreatingChannel(false);
    };

    const selectableMembers = useMemo(
        () => members.filter((member) => member.user_id !== currentUserId),
        [members, currentUserId]
    );

    const toggleMemberSelection = (memberId: string) => {
        setSelectedMemberIds((prev) =>
            prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
        );
    };

    const handleCreateGroup = () => {
        if (!groupName.trim() || selectedMemberIds.length === 0 || !onCreateGroup) return;
        onCreateGroup(groupName.trim(), selectedMemberIds);
        setGroupName('');
        setSelectedMemberIds([]);
        setIsCreatingGroup(false);
    };

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Members ({members.length})
                </p>
                <div className="flex items-center gap-2">
                    {onCreateChannel && (
                        <button
                            onClick={() => { setIsCreatingChannel((p) => !p); setIsCreatingGroup(false); }}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            {isCreatingChannel ? 'Cancel' : 'New Channel'}
                        </button>
                    )}
                    {onCreateGroup && (
                        <button
                            onClick={() => { setIsCreatingGroup((prev) => !prev); setIsCreatingChannel(false); }}
                            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                            {isCreatingGroup ? 'Cancel' : 'New Group'}
                        </button>
                    )}
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                        >
                            Refresh
                        </button>
                    )}
                </div>
            </div>

            {isCreatingChannel && (
                <div className="mb-4 p-3 rounded-xl border border-border bg-card/40 space-y-2">
                    <input
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannel(); }}
                        placeholder="Channel name"
                        autoFocus
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-muted-foreground">Open to everyone in the workspace.</p>
                    <button
                        type="button"
                        onClick={handleCreateChannel}
                        disabled={!channelName.trim()}
                        className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-500"
                    >
                        Create channel
                    </button>
                </div>
            )}

            {isCreatingGroup && (
                <div className="mb-4 p-3 rounded-xl border border-border bg-card/40 space-y-2">
                    <input
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Group name"
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-zinc-200 placeholder:text-muted-foreground focus:outline-none"
                    />
                    <p className="text-[10px] text-muted-foreground">Select members below, then create the group.</p>
                    <button
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={!groupName.trim() || selectedMemberIds.length === 0}
                        className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-500"
                    >
                        Create Group ({selectedMemberIds.length})
                    </button>
                </div>
            )}

            <div className="space-y-1">
                {members.map((member) => {
                    const isCurrentUser = member.user_id === currentUserId;
                    const isOnline = onlineUserIds.includes(member.user_id);
                    const roleInfo = roleConfig[member.role] || roleConfig.member;
                    const RoleIcon = roleInfo.icon;

                    const isSelected = selectedMemberIds.includes(member.user_id);

                    return (
                        <button
                            key={member.user_id}
                            type="button"
                            onClick={() => {
                                if (isCreatingGroup) {
                                    toggleMemberSelection(member.user_id);
                                    return;
                                }
                                onMemberClick?.(member);
                            }}
                            className={cn(
                                'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                                isCurrentUser ? 'bg-muted/60' : 'hover:bg-card',
                                isCreatingGroup && isSelected && 'ring-1 ring-emerald-500/60 bg-emerald-500/10'
                            )}
                        >
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-foreground text-sm font-bold shadow">
                                    {(member.display_name || member.email || 'U')[0].toUpperCase()}
                                </div>
                                {/* Online indicator */}
                                <span className={cn(
                                    'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950',
                                    isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
                                )} />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium text-zinc-200 truncate">
                                        {member.display_name || member.email || 'Unknown User'}
                                    </p>
                                    {isCurrentUser && (
                                        <span className="text-xs text-muted-foreground">(you)</span>
                                    )}
                                </div>
                                {member.email && member.display_name && (
                                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                )}
                            </div>

                            {/* Role badge */}
                            <div className={cn('flex items-center gap-1', roleInfo.color)}>
                                <RoleIcon className="w-3 h-3" />
                                <span className="text-xs font-medium">{roleInfo.label}</span>
                            </div>

                            {isCreatingGroup && member.user_id !== currentUserId && (
                                <div className={cn(
                                    'ml-2 w-4 h-4 rounded border flex items-center justify-center text-[10px]',
                                    isSelected ? 'border-emerald-500 bg-emerald-500 text-foreground' : 'border-border text-transparent'
                                )}>
                                    ✓
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {members.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                        <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No members yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Invite team members to collaborate</p>
                </div>
            )}
        </div>
    );
}
