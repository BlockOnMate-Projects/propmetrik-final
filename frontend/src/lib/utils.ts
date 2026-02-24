import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(Number(num))) {
    return '0';
  }
  const n = Number(num);
  if (n >= 1000000000000) {
    return (n / 1000000000000).toFixed(1) + 'T';
  }
  if (n >= 1000000000) {
    return (n / 1000000000).toFixed(1) + 'B';
  }
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M';
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'K';
  }
  return n.toString();
}

export function formatCurrency(amount: number, currency = 'GHS'): string {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: currency === 'GHS' ? 'GHS' : currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch (e) {
    return 'N/A';
  }
}

export function formatRelativeTime(date: Date | string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(date);
  } catch (e) {
    return 'N/A';
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours < 24) return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'text-emerald-500',
    running: 'text-blue-500',
    completed: 'text-emerald-500',
    failed: 'text-red-500',
    pending: 'text-amber-500',
    paused: 'text-gray-400',
    cancelled: 'text-gray-500',
  };
  return colors[status.toLowerCase()] || 'text-gray-400';
}

export function getTierLabel(tier: string): string {
  const labels: Record<string, string> = {
    tier1_government: 'Tier 1: Government',
    tier2_financial: 'Tier 2: Financial',
    tier3_partners: 'Tier 3: Partners',
    tier3b_user_generated: 'Tier 3B: User Generated',
    tier4_market_data: 'Tier 4: Market Data',
    tier5_public_web: 'Tier 5: Public Web',
  };
  return labels[tier] || tier;
}

export function getTierColor(tier: string): string {
  const colors: Record<string, string> = {
    tier1_government: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    tier2_financial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    tier3_partners: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    tier3b_user_generated: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    tier4_market_data: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    tier5_public_web: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  return colors[tier] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}
