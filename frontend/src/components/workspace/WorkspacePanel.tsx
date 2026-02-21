'use client';

import { useEffect, useState } from 'react';
import { useWindowManagerStore } from '@/store/windowManagerStore';
import { cn } from '@/lib/utils';
import { workspaceApi, type EntityType } from '@/lib/workspace-api';
import { MessageSquare } from 'lucide-react';

// ============================================================================
// FLOATING TRIGGER BUTTON
// ============================================================================

interface WorkspaceFloatingButtonProps {
    onClick: () => void;
    unreadCount?: number;
}

export function WorkspaceFloatingButton({ onClick, unreadCount = 0 }: WorkspaceFloatingButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'fixed bottom-6 right-6 z-[60]',
                'flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl',
                'bg-gradient-to-br from-emerald-500 to-teal-600',
                'hover:from-emerald-400 hover:to-teal-500',
                'text-white font-medium text-sm',
                'transition-all duration-300 hover:scale-105 active:scale-95',
                'shadow-emerald-500/30 hover:shadow-emerald-500/50'
            )}
        >
            <MessageSquare className="w-4 h-4" />
            <span>Workspace</span>
            {unreadCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white text-emerald-700 text-xs font-bold">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
}

// ============================================================================
// SELF-CONTAINED WORKSPACE WIDGET
// ============================================================================

interface WorkspaceWidgetProps {
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    currentUserId?: string | null;
    token?: string | null;
}

export function WorkspaceWidget({
    entityType,
    entityId,
    entityName,
    currentUserId,
    token: initialToken,
}: WorkspaceWidgetProps) {
    const [unreadCount, setUnreadCount] = useState(0);
    const [token, setToken] = useState<string | null>(initialToken || (typeof window !== 'undefined' ? localStorage.getItem('token') : null));
    const { openWindow } = useWindowManagerStore();

    useEffect(() => {
        if (!initialToken && typeof window !== 'undefined') {
            const stored = localStorage.getItem('token');
            if (stored) setToken(stored);
        }
    }, [initialToken]);

    useEffect(() => {
        workspaceApi
            .getOrCreate(entityType, entityId)
            .then(({ unreadCount: c }) => setUnreadCount(c))
            .catch(() => { });
    }, [entityType, entityId]);

    const handleOpenWorkspace = () => {
        openWindow({
            id: `workspace-${entityType}-${entityId}`,
            type: 'workspace',
            title: entityName || 'Workspace',
            data: {
                entityType,
                entityId,
                entityName,
                currentUserId,
                token: token || initialToken
            },
            size: { width: 440, height: 600 },
            position: { x: window.innerWidth - 460, y: 100 }
        });
        setUnreadCount(0);
    };

    return (
        <WorkspaceFloatingButton
            onClick={handleOpenWorkspace}
            unreadCount={unreadCount}
        />
    );
}
