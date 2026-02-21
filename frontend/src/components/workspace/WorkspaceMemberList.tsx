'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { WorkspaceMember, MemberRole } from '@/lib/workspace-api';
import { Shield, User, Eye, Crown } from 'lucide-react';

interface WorkspaceMemberListProps {
    members: WorkspaceMember[];
    currentUserId?: string | null;
    onlineUserIds?: string[];
    onRefresh?: () => void;
}

const roleConfig: Record<MemberRole, { icon: typeof User; label: string; color: string }> = {
    admin: { icon: Crown, label: 'Admin', color: 'text-amber-400' },
    member: { icon: User, label: 'Member', color: 'text-zinc-300' },
    viewer: { icon: Eye, label: 'Viewer', color: 'text-zinc-500' },
};

export function WorkspaceMemberList({ members, currentUserId, onlineUserIds = [], onRefresh }: WorkspaceMemberListProps) {
    return (
        <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Members ({members.length})
                </p>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Refresh
                    </button>
                )}
            </div>

            <div className="space-y-1">
                {members.map((member) => {
                    const isCurrentUser = member.user_id === currentUserId;
                    const isOnline = onlineUserIds.includes(member.user_id);
                    const roleInfo = roleConfig[member.role] || roleConfig.member;
                    const RoleIcon = roleInfo.icon;

                    return (
                        <div
                            key={member.user_id}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                                isCurrentUser ? 'bg-zinc-800/60' : 'hover:bg-zinc-900'
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
                        </div>
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
