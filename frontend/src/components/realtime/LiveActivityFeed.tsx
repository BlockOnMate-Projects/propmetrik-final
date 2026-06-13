'use client';

/**
 * Live Activity Feed Component
 * Shows real-time activity updates via SSE
 * Phase 5.11: Real-time & Calendar Features
 */

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Clock,
  Phone,
  Mail,
  Calendar,
  FileText,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  User,
  Bell,
} from 'lucide-react';
import { useRealtime, RealtimeEvent, RealtimeEventType } from '@/lib/realtime-api';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  timestamp: Date;
  isNew?: boolean;
}

interface LiveActivityFeedProps {
  initialActivities?: ActivityItem[];
  maxItems?: number;
  showNewIndicator?: boolean;
  onActivityClick?: (activity: ActivityItem) => void;
  filterEntityType?: string;
  filterEntityId?: string;
}

const activityIcons: Record<string, React.ReactNode> = {
  'deal.created': <FileText className="h-4 w-4 text-blue-500" />,
  'deal.updated': <FileText className="h-4 w-4 text-muted-foreground" />,
  'deal.stage_changed': <ArrowRight className="h-4 w-4 text-purple-500" />,
  'activity.created': <Clock className="h-4 w-4 text-green-500" />,
  'task.created': <CheckCircle className="h-4 w-4 text-orange-500" />,
  'task.completed': <CheckCircle className="h-4 w-4 text-green-500" />,
  'viewing.booked': <Calendar className="h-4 w-4 text-blue-500" />,
  'viewing.confirmed': <Calendar className="h-4 w-4 text-green-500" />,
  'document.signed': <FileText className="h-4 w-4 text-green-500" />,
  notification: <Bell className="h-4 w-4 text-yellow-500" />,
  default: <Clock className="h-4 w-4 text-muted-foreground" />,
};

function getActivityIcon(type: string): React.ReactNode {
  return activityIcons[type] || activityIcons.default;
}

function formatEventToActivity(event: RealtimeEvent): ActivityItem {
  const payload = event.payload as Record<string, unknown>;
  
  let title = 'Activity';
  let description = '';
  
  switch (event.type) {
    case RealtimeEventType.DEAL_CREATED:
      title = 'New deal created';
      description = payload.title as string || '';
      break;
    case RealtimeEventType.DEAL_STAGE_CHANGED:
      title = 'Deal stage changed';
      description = `${payload.fromStage || 'Previous'} → ${payload.toStage || 'New stage'}`;
      break;
    case RealtimeEventType.TASK_CREATED:
      title = 'New task added';
      description = payload.title as string || '';
      break;
    case RealtimeEventType.TASK_COMPLETED:
      title = 'Task completed';
      description = payload.title as string || '';
      break;
    case RealtimeEventType.ACTIVITY_CREATED:
      title = `New ${payload.type || 'activity'}`;
      description = payload.notes as string || '';
      break;
    case RealtimeEventType.VIEWING_BOOKED:
      title = 'Viewing scheduled';
      description = payload.contactName as string || 'New viewing';
      break;
    case RealtimeEventType.VIEWING_CONFIRMED:
      title = 'Viewing confirmed';
      description = payload.contactName as string || '';
      break;
    case RealtimeEventType.DOCUMENT_SIGNED:
      title = 'Document signed';
      description = payload.documentName as string || '';
      break;
    default:
      title = event.type.replace(/\./g, ' ').replace(/^\w/, c => c.toUpperCase());
      description = typeof payload.message === 'string' ? payload.message : '';
  }
  
  return {
    id: `${event.type}-${Date.now()}-${Math.random()}`,
    type: event.type,
    title,
    description,
    entityType: event.entityType,
    entityId: event.entityId,
    userId: event.userId,
    userName: payload.userName as string,
    timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
    isNew: true,
  };
}

export function LiveActivityFeed({
  initialActivities = [],
  maxItems = 20,
  showNewIndicator = true,
  onActivityClick,
  filterEntityType,
  filterEntityId,
}: LiveActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>(initialActivities);
  const [newCount, setNewCount] = useState(0);
  
  // Listen to all relevant event types
  useRealtime(
    [
      RealtimeEventType.DEAL_CREATED,
      RealtimeEventType.DEAL_UPDATED,
      RealtimeEventType.DEAL_STAGE_CHANGED,
      RealtimeEventType.ACTIVITY_CREATED,
      RealtimeEventType.TASK_CREATED,
      RealtimeEventType.TASK_COMPLETED,
      RealtimeEventType.VIEWING_BOOKED,
      RealtimeEventType.VIEWING_CONFIRMED,
      RealtimeEventType.DOCUMENT_SIGNED,
    ],
    (event) => {
      // Apply filters if specified
      if (filterEntityType && event.entityType !== filterEntityType) return;
      if (filterEntityId && event.entityId !== filterEntityId) return;
      
      const activity = formatEventToActivity(event);
      
      setActivities(prev => {
        const updated = [activity, ...prev].slice(0, maxItems);
        return updated;
      });
      
      if (showNewIndicator) {
        setNewCount(prev => prev + 1);
      }
    },
    [filterEntityType, filterEntityId]
  );
  
  // Clear new indicator after 3 seconds
  useEffect(() => {
    if (newCount > 0) {
      const timer = setTimeout(() => {
        setActivities(prev => prev.map(a => ({ ...a, isNew: false })));
        setNewCount(0);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [newCount]);
  
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No recent activity</p>
        <p className="text-sm">Updates will appear here in real-time</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-1">
      {showNewIndicator && newCount > 0 && (
        <div className="flex items-center justify-center gap-1 py-1 px-2 bg-blue-50 text-blue-600 text-xs rounded animate-pulse">
          <Bell className="h-3 w-3" />
          {newCount} new update{newCount > 1 ? 's' : ''}
        </div>
      )}
      
      <div className="space-y-2">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
              activity.isNew
                ? 'bg-blue-50 animate-highlight'
                : 'hover:bg-muted'
            } ${onActivityClick ? 'cursor-pointer' : ''}`}
            onClick={() => onActivityClick?.(activity)}
          >
            <div className="flex-shrink-0 mt-0.5">
              {getActivityIcon(activity.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {activity.title}
              </p>
              {activity.description && (
                <p className="text-sm text-muted-foreground truncate">
                  {activity.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {activity.userName && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {activity.userName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                </span>
              </div>
            </div>
            
            {activity.isNew && (
              <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact activity ticker for headers/navbars
 */
export function ActivityTicker({ maxItems = 5 }: { maxItems?: number }) {
  const [latestActivity, setLatestActivity] = useState<ActivityItem | null>(null);
  
  useRealtime('*', (event) => {
    setLatestActivity(formatEventToActivity(event));
    
    // Clear after 5 seconds
    setTimeout(() => setLatestActivity(null), 5000);
  });
  
  if (!latestActivity) return null;
  
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-lg animate-slideIn">
      {getActivityIcon(latestActivity.type)}
      <span className="truncate max-w-xs">{latestActivity.title}</span>
    </div>
  );
}

export default LiveActivityFeed;
