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
}

const roleConfig: Record<MemberRole, { icon: typeof User; label: string; color: string }> = {
    admin: { icon: Crown, label: 'Admin', color: 'text-amber-400' },
    member: { icon: User, label: 'Member', color: 'text-zinc-300' },
    viewer: { icon: Eye, label: 'Viewer', color: 'text-zinc-500' },
};

export function WorkspaceMemberList({ members, currentUserId, onlineUserIds = [], onRefresh, onMemberClick, onCreateGroup }: WorkspaceMemberListProps) {
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

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
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Members ({members.length})
                </p>
                <div className="flex items-center gap-2">
                    {onCreateGroup && (
                        <button
                            onClick={() => setIsCreatingGroup((prev) => !prev)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                            {isCreatingGroup ? 'Cancel' : 'New Group'}
                        </button>
                    )}
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            Refresh
                        </button>
                    )}
                </div>
            </div>

            {isCreatingGroup && (
                <div className="mb-4 p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                    <input
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Group name"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                    />
                    <p className="text-[10px] text-zinc-500">Select members below, then create the group.</p>
                    <button
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={!groupName.trim() || selectedMemberIds.length === 0}
                        className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-500"
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
                                isCurrentUser ? 'bg-zinc-800/60' : 'hover:bg-zinc-900',
                                isCreatingGroup && isSelected && 'ring-1 ring-emerald-500/60 bg-emerald-500/10'
                            )}
                        >
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold shadow">
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
                                        <span className="text-xs text-zinc-500">(you)</span>
                                    )}
                                </div>
                                {member.email && member.display_name && (
                                    <p className="text-xs text-zinc-500 truncate">{member.email}</p>
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
                                    isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-700 text-transparent'
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
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mb-3">
                        <User className="w-5 h-5 text-zinc-600" />
                    </div>
                    <p className="text-sm text-zinc-400">No members yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Invite team members to collaborate</p>
                </div>
            )}
        </div>
    );
}
