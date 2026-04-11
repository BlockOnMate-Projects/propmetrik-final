/**
 * Realtime Connection Status Indicator
 * 
 * Shows the current SSE connection status in the dashboard.
 */

'use client';

import React from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useRealtimeStatus } from '@/lib/realtime-provider';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface RealtimeStatusProps {
  className?: string;
  showLabel?: boolean;
}

export function RealtimeStatus({ className, showLabel = false }: RealtimeStatusProps) {
  const { isConnected, reconnectAttempts, statusText, statusColor } = useRealtimeStatus();

  const Icon = isConnected
    ? Wifi
    : reconnectAttempts > 0
      ? RefreshCw
      : WifiOff;

  const colorClasses = {
    green: 'text-emerald-500',
    yellow: 'text-amber-500',
    red: 'text-red-500',
  };

  const bgClasses = {
    green: 'bg-emerald-500/20',
    yellow: 'bg-amber-500/20',
    red: 'bg-red-500/20',
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1 rounded-md transition-colors',
            bgClasses[statusColor],
            className
          )}
        >
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              colorClasses[statusColor],
              reconnectAttempts > 0 && 'animate-spin'
            )}
          />
          {showLabel && (
            <span className={cn('text-xs font-mono', colorClasses[statusColor])}>
              {isConnected ? 'LIVE' : reconnectAttempts > 0 ? 'RECONNECTING' : 'OFFLINE'}
            </span>
          )}
          {isConnected && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-zinc-900 text-zinc-100 border-zinc-800">
        <p className="text-xs">
          {statusText}
          {isConnected && ' - Real-time updates active'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default RealtimeStatus;
