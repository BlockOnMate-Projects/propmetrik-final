'use client';

/**
 * Presence Indicator Component
 * Shows who's currently viewing a resource
 * Phase 5.11: Real-time & Calendar Features
 */

import { usePresence, PresenceUser } from '@/lib/realtime-api';

interface PresenceIndicatorProps {
  resourceType: string;
  resourceId: string | undefined;
  currentUser?: {
    name?: string;
    avatar?: string;
    email?: string;
  };
  maxDisplayed?: number;
  showLabel?: boolean;
}

const avatarColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-red-500',
  'bg-teal-500',
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(userId: string): string {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
}

export function PresenceIndicator({
  resourceType,
  resourceId,
  currentUser,
  maxDisplayed = 5,
  showLabel = true,
}: PresenceIndicatorProps) {
  const presence = usePresence(resourceType, resourceId, currentUser);
  
  if (presence.length === 0) return null;
  
  const displayedUsers = presence.slice(0, maxDisplayed);
  const remainingCount = presence.length - maxDisplayed;
  
  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <span className="text-xs text-gray-500">
          {presence.length === 1 ? '1 viewer' : `${presence.length} viewers`}
        </span>
      )}
      
      <div className="flex -space-x-2">
        {displayedUsers.map((user, index) => (
          <div
            key={user.userId}
            className={`relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-medium ${getAvatarColor(user.userId)}`}
            style={{ zIndex: maxDisplayed - index }}
            title={user.userInfo.name || user.userInfo.email || 'Anonymous'}
          >
            {user.userInfo.avatar ? (
              <img
                src={user.userInfo.avatar}
                alt={user.userInfo.name || 'User'}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              getInitials(user.userInfo.name || user.userInfo.email || 'U')
            )}
            
            {/* Online indicator dot */}
            <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-white" />
          </div>
        ))}
        
        {remainingCount > 0 && (
          <div
            className="relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center bg-gray-400 text-white text-xs font-medium"
            title={`${remainingCount} more viewers`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact presence badge for smaller spaces
 */
export function PresenceBadge({
  resourceType,
  resourceId,
  currentUser,
}: Omit<PresenceIndicatorProps, 'maxDisplayed' | 'showLabel'>) {
  const presence = usePresence(resourceType, resourceId, currentUser);
  
  if (presence.length === 0) return null;
  
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">
      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
      <span>{presence.length} viewing</span>
    </div>
  );
}

/**
 * Real-time connection status indicator
 */
export function ConnectionStatus({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
      <span className="text-xs text-gray-500">
        {isConnected ? 'Live' : 'Connecting...'}
      </span>
    </div>
  );
}

export default PresenceIndicator;
