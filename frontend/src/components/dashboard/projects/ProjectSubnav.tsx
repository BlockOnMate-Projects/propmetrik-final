'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ProjectSubnavProps {
  projectId: string;
}

const buildItems = (projectId: string) => [
  { label: 'Overview', href: `/dashboard/projects/${projectId}` },
  { label: 'Milestones', href: `/dashboard/projects/${projectId}/milestones` },
  { label: 'Change Orders', href: `/dashboard/projects/${projectId}/change-orders` },
  { label: 'RFIs', href: `/dashboard/projects/${projectId}/rfis` },
  { label: 'Submittals', href: `/dashboard/projects/${projectId}/submittals` },
  { label: 'Photos', href: `/dashboard/projects/${projectId}/photos` },
  { label: 'Punch Lists', href: `/dashboard/projects/${projectId}/punch-lists` },
  { label: 'Site Logs', href: `/dashboard/projects/${projectId}/site-logs` },
  { label: 'Procurement', href: `/dashboard/projects/${projectId}/procurement` },
  { label: 'Checklists', href: `/dashboard/projects/${projectId}/checklists` },
  { label: 'Budget/Cost', href: `/dashboard/projects/${projectId}/budget-cost` },
  { label: 'Draws/Pay Apps', href: `/dashboard/projects/${projectId}/draws-pay-apps` },
  { label: 'Issues/Risks', href: `/dashboard/projects/${projectId}/issues-risks` },
];

export default function ProjectSubnav({ projectId }: ProjectSubnavProps) {
  const pathname = usePathname();
  const items = useMemo(() => buildItems(projectId), [projectId]);

  return (
    <div className="border border-border bg-background rounded-xl px-2 py-2 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                isActive
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
