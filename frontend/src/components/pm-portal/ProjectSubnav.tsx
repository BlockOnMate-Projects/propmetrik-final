'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ProjectSubnavProps {
  projectId: string;
}

const buildItems = (projectId: string) => [
  { label: 'Overview', href: `/pm-portal/projects/${projectId}` },
  { label: 'Milestones', href: `/pm-portal/projects/${projectId}/milestones` },
  { label: 'Change Orders', href: `/pm-portal/projects/${projectId}/change-orders` },
  { label: 'RFIs', href: `/pm-portal/projects/${projectId}/rfis` },
  { label: 'Submittals', href: `/pm-portal/projects/${projectId}/submittals` },
  { label: 'Photos', href: `/pm-portal/projects/${projectId}/photos` },
  { label: 'Punch Lists', href: `/pm-portal/projects/${projectId}/punch-lists` },
  { label: 'Site Logs', href: `/pm-portal/projects/${projectId}/site-logs` },
  { label: 'Procurement', href: `/pm-portal/projects/${projectId}/procurement` },
  { label: 'Checklists', href: `/pm-portal/projects/${projectId}/checklists` },
  { label: 'Budget/Cost', href: `/pm-portal/projects/${projectId}/budget-cost` },
  { label: 'Draws/Pay Apps', href: `/pm-portal/projects/${projectId}/draws-pay-apps` },
  { label: 'Issues/Risks', href: `/pm-portal/projects/${projectId}/issues-risks` },
];

export default function ProjectSubnav({ projectId }: ProjectSubnavProps) {
  const pathname = usePathname();
  const items = useMemo(() => buildItems(projectId), [projectId]);

  return (
    <div className="border border-zinc-800 bg-zinc-950 rounded-xl px-2 py-2 overflow-x-auto">
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
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
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
