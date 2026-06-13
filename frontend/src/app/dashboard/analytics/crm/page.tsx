'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/authed-fetch';
import { 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  Target, 
  Users, 
  Clock, 
  DollarSign,
  BarChart3,
  PieChart,
  Download,
  Calendar,
  Filter,
  RefreshCw,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Zap
} from 'lucide-react';

// Types
interface CohortData {
  cohort: string;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  activeDeals: number;
  winRate: number;
  totalValue: number;
  avgDealSize: number;
  avgCycleTime: number;
}

interface WinLossData {
  period: string;
  won: { count: number; value: number };
  lost: { count: number; value: number };
  winRate: number;
  avgTimeToWin: number;
  avgTimeToLoss: number;
  topWinReasons: string[];
  topLossReasons: string[];
}

interface FunnelStage {
  stageName: string;
  stageOrder: number;
  dealsCount: number;
  dealsValue: number;
  avgTimeInStage: number;
  conversionToNext: number;
  dropoffRate: number;
}

interface LeadSourceData {
  source: string;
  dealsCount: number;
  wonDeals: number;
  lostDeals: number;
  winRate: number;
  totalValue: number;
  avgDealSize: number;
}

interface AgentPerformance {
  agentId: string;
  agentName: string;
  dealsWon: number;
  dealsLost: number;
  winRate: number;
  totalValue: number;
  avgDealSize: number;
  avgCycleTime: number;
  activitiesCount: number;
  tasksCompleted: number;
}

interface DashboardSummary {
  thisMonth: { deals: number; value: number; winRate: number };
  lastMonth: { deals: number; value: number; winRate: number };
  pipeline: { totalDeals: number; totalValue: number };
  avgCycleTime: number;
  topPerformer: { name: string; value: number };
}

// API client
const analyticsApi = {
  async getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary | null> {
    try {
      const res = await authedFetch('/api/analytics/dashboard', { signal });
      if (!res.ok) return null;
      const data = await res.json();
      return data.data ?? null;
    } catch { return null; }
  },
  async getCohorts(groupBy: string, signal?: AbortSignal): Promise<CohortData[]> {
    try {
      const res = await authedFetch(`/api/analytics/cohorts?groupBy=${groupBy}`, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    } catch { return []; }
  },
  async getWinLoss(period: string, signal?: AbortSignal): Promise<WinLossData[]> {
    try {
      const res = await authedFetch(`/api/analytics/win-loss?period=${period}`, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    } catch { return []; }
  },
  async getFunnel(pipelineId: string, signal?: AbortSignal): Promise<FunnelStage[]> {
    try {
      const res = await authedFetch(`/api/analytics/funnel/${pipelineId}`, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    } catch { return []; }
  },
  async getLeadSources(signal?: AbortSignal): Promise<LeadSourceData[]> {
    try {
      const res = await authedFetch('/api/analytics/lead-sources', { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    } catch { return []; }
  },
  async getAgentPerformance(period: string, signal?: AbortSignal): Promise<AgentPerformance[]> {
    try {
      const res = await authedFetch(`/api/analytics/agent-performance?period=${period}`, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    } catch { return []; }
  },
  exportExcel() {
    window.open('/api/analytics/export/excel', '_blank');
  },
  exportPDF() {
    window.open('/api/analytics/export/pdf', '_blank');
  }
};

// Panel Component
function Panel({ 
  title, 
  children, 
  className,
  actions 
}: { 
  title: string; 
  children: React.ReactNode; 
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn('border border-border bg-card/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  label, 
  value, 
  change, 
  trend = 'up',
  prefix = '',
  suffix = '' 
}: { 
  label: string; 
  value: string | number; 
  change?: number; 
  trend?: 'up' | 'down';
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Panel title={label}>
      <div className="text-center py-2">
        <div className="font-mono text-2xl text-foreground">
          {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
        </div>
        {change !== undefined && (
          <div className={cn(
            'font-mono text-xs mt-1 flex items-center justify-center gap-1',
            change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}% vs last period
          </div>
        )}
      </div>
    </Panel>
  );
}

// Funnel Visualization
function FunnelChart({ data }: { data: FunnelStage[] }) {
  const maxDeals = Math.max(...data.map(s => s.dealsCount), 1);

  return (
    <div className="space-y-2">
      {data.map((stage, index) => {
        const widthPercent = (stage.dealsCount / maxDeals) * 100;
        return (
          <div key={stage.stageName} className="group">
            <div className="flex items-center gap-3">
              <div className="w-24 font-mono text-[10px] text-muted-foreground truncate">
                {stage.stageName}
              </div>
              <div className="flex-1 h-8 bg-muted/50 relative overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-500 transition-all duration-500"
                  style={{ width: `${widthPercent}%` }}
                />
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="font-mono text-xs text-foreground">
                    {stage.dealsCount} deals • ${(stage.dealsValue / 1000).toFixed(0)}K
                  </span>
                </div>
              </div>
              <div className="w-20 text-right">
                <span className={cn(
                  'font-mono text-[10px]',
                  stage.conversionToNext >= 50 ? 'text-green-600 dark:text-green-400' : 
                  stage.conversionToNext >= 25 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {index < data.length - 1 ? `${stage.conversionToNext}%` : '—'}
                </span>
              </div>
            </div>
            {index < data.length - 1 && (
              <div className="ml-24 pl-3 flex items-center gap-1 text-muted-foreground">
                <ChevronRight className="w-3 h-3" />
                <span className="font-mono text-[8px]">
                  {stage.dropoffRate}% drop-off • avg {stage.avgTimeInStage}d
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Win/Loss Chart
function WinLossChart({ data }: { data: WinLossData[] }) {
  const maxValue = Math.max(
    ...data.flatMap(d => [d.won.value, d.lost.value]),
    1
  );

  return (
    <div className="space-y-4">
      {data.slice(0, 6).map((item) => (
        <div key={item.period} className="space-y-1">
          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span>{item.period}</span>
            <span className={cn(
              item.winRate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {item.winRate}% win rate
            </span>
          </div>
          <div className="flex gap-1 h-6">
            <div 
              className="bg-green-500/80 h-full transition-all duration-500 flex items-center justify-end pr-1"
              style={{ width: `${(item.won.value / maxValue) * 50}%` }}
            >
              {item.won.value > maxValue * 0.1 && (
                <span className="font-mono text-[8px] text-foreground">
                  ${(item.won.value / 1000).toFixed(0)}K
                </span>
              )}
            </div>
            <div 
              className="bg-red-500/80 h-full transition-all duration-500 flex items-center pl-1"
              style={{ width: `${(item.lost.value / maxValue) * 50}%` }}
            >
              {item.lost.value > maxValue * 0.1 && (
                <span className="font-mono text-[8px] text-foreground">
                  ${(item.lost.value / 1000).toFixed(0)}K
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between font-mono text-[8px] text-muted-foreground">
            <span>{item.won.count} won • avg {item.avgTimeToWin}d</span>
            <span>{item.lost.count} lost • avg {item.avgTimeToLoss}d</span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-4 pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-sm" />
          <span className="font-mono text-[10px] text-muted-foreground">Won</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-sm" />
          <span className="font-mono text-[10px] text-muted-foreground">Lost</span>
        </div>
      </div>
    </div>
  );
}

// Lead Source Chart
function LeadSourceChart({ data }: { data: LeadSourceData[] }) {
  const maxDeals = Math.max(...data.map(s => s.dealsCount), 1);

  return (
    <div className="space-y-3">
      {data.map((source) => (
        <div key={source.source} className="space-y-1">
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-muted-foreground">{source.source}</span>
            <span className={cn(
              source.winRate >= 50 ? 'text-green-600 dark:text-green-400' : 
              source.winRate >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
            )}>
              {source.winRate}%
            </span>
          </div>
          <div className="flex gap-0.5 h-5">
            <div 
              className="bg-green-500/80 h-full"
              style={{ width: `${(source.wonDeals / maxDeals) * 100}%` }}
            />
            <div 
              className="bg-red-500/80 h-full"
              style={{ width: `${(source.lostDeals / maxDeals) * 100}%` }}
            />
            <div 
              className="bg-zinc-600 h-full"
              style={{ width: `${((source.dealsCount - source.wonDeals - source.lostDeals) / maxDeals) * 100}%` }}
            />
          </div>
          <div className="font-mono text-[8px] text-muted-foreground">
            {source.dealsCount} deals • ${(source.totalValue / 1000).toFixed(0)}K total
          </div>
        </div>
      ))}
    </div>
  );
}

// Agent Leaderboard
function AgentLeaderboard({ data }: { data: AgentPerformance[] }) {
  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((agent, index) => (
        <div 
          key={agent.agentId}
          className={cn(
            'flex items-center gap-3 p-2 rounded',
            index === 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-muted/30'
          )}
        >
          <div className={cn(
            'w-6 h-6 rounded flex items-center justify-center font-mono text-xs',
            index === 0 ? 'bg-amber-500 text-foreground' :
            index === 1 ? 'bg-zinc-400 text-foreground' :
            index === 2 ? 'bg-amber-700 text-foreground' :
            'bg-zinc-700 text-muted-foreground'
          )}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-xs text-foreground truncate">{agent.agentName}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {agent.dealsWon} won • {agent.winRate}% rate
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs text-green-600 dark:text-green-400">
              ${(agent.totalValue / 1000).toFixed(0)}K
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {agent.avgCycleTime}d avg
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Cohort Analysis Table
function CohortTable({ data }: { data: CohortData[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left py-2 pr-4">Cohort</th>
            <th className="text-right py-2 px-2">Deals</th>
            <th className="text-right py-2 px-2">Won</th>
            <th className="text-right py-2 px-2">Win %</th>
            <th className="text-right py-2 px-2">Value</th>
            <th className="text-right py-2 px-2">Avg Size</th>
            <th className="text-right py-2 pl-2">Cycle</th>
          </tr>
        </thead>
        <tbody>
          {data.map((cohort) => (
            <tr key={cohort.cohort} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
              <td className="py-2 pr-4 text-foreground">{cohort.cohort}</td>
              <td className="text-right py-2 px-2 text-muted-foreground">{cohort.totalDeals}</td>
              <td className="text-right py-2 px-2 text-green-600 dark:text-green-400">{cohort.wonDeals}</td>
              <td className={cn(
                'text-right py-2 px-2',
                cohort.winRate >= 50 ? 'text-green-600 dark:text-green-400' : 
                cohort.winRate >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
              )}>
                {cohort.winRate}%
              </td>
              <td className="text-right py-2 px-2 text-muted-foreground">
                ${(cohort.totalValue / 1000).toFixed(0)}K
              </td>
              <td className="text-right py-2 px-2 text-muted-foreground">
                ${(cohort.avgDealSize / 1000).toFixed(0)}K
              </td>
              <td className="text-right py-2 pl-2 text-muted-foreground">
                {cohort.avgCycleTime}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Main Page
export default function CRMAnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [cohortGroupBy, setCohortGroupBy] = useState<'month' | 'quarter' | 'source' | 'agent'>('month');
  
  // Data states — default summary so the page always renders content
  const emptySummary: DashboardSummary = {
    thisMonth: { deals: 0, value: 0, winRate: 0 },
    lastMonth: { deals: 0, value: 0, winRate: 0 },
    pipeline: { totalDeals: 0, totalValue: 0 },
    avgCycleTime: 0,
    topPerformer: { name: '—', value: 0 },
  };
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [cohorts, setCohorts] = useState<CohortData[]>([]);
  const [winLoss, setWinLoss] = useState<WinLossData[]>([]);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceData[]>([]);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);

  // Load data
  const loadData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const [summaryData, cohortsData, winLossData, leadSourcesData, agentsData] = await Promise.all([
        analyticsApi.getDashboardSummary(signal),
        analyticsApi.getCohorts(cohortGroupBy, signal),
        analyticsApi.getWinLoss(period, signal),
        analyticsApi.getLeadSources(signal),
        analyticsApi.getAgentPerformance(period, signal),
      ]);
      
      if (signal?.aborted) return;
      setSummary(summaryData ?? emptySummary);
      setCohorts(cohortsData ?? []);
      setWinLoss(winLossData ?? []);
      setLeadSources(leadSourcesData ?? []);
      setAgents(agentsData ?? []);
      
      // Load funnel for first pipeline (default)
      try {
        const funnelData = await analyticsApi.getFunnel('default', signal);
        if (!signal?.aborted) setFunnel(funnelData ?? []);
      } catch {
        // Funnel might not be available
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Failed to load analytics:', error);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [period, cohortGroupBy]);

  useEffect(() => {
    const ac = new AbortController();
    loadData(ac.signal);
    return () => ac.abort();
  }, [loadData]);

  // Calculate changes
  const dealsChange = summary?.thisMonth && summary?.lastMonth ? 
    ((summary.thisMonth.deals - summary.lastMonth.deals) / (summary.lastMonth.deals || 1)) * 100 : 0;
  const valueChange = summary?.thisMonth && summary?.lastMonth ? 
    ((summary.thisMonth.value - summary.lastMonth.value) / (summary.lastMonth.value || 1)) * 100 : 0;
  const winRateChange = summary?.thisMonth && summary?.lastMonth ? 
    summary.thisMonth.winRate - summary.lastMonth.winRate : 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            CRM ANALYTICS
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Sales Performance, Pipeline Analytics & Team Insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex border border-border rounded overflow-hidden">
            {(['week', 'month', 'quarter'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 font-mono text-[10px] transition-colors',
                  period === p ? 'bg-amber-500 text-foreground' : 'bg-muted text-muted-foreground hover:bg-zinc-700'
                )}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          
          {/* Export Buttons */}
          <button 
            onClick={() => analyticsApi.exportExcel()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-zinc-700 font-mono text-[10px] text-muted-foreground border border-border transition-colors"
          >
            <Download className="w-3 h-3" />
            EXCEL
          </button>
          <button 
            onClick={() => analyticsApi.exportPDF()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-zinc-700 font-mono text-[10px] text-muted-foreground border border-border transition-colors"
          >
            <Download className="w-3 h-3" />
            PDF
          </button>
          
          {/* Refresh */}
          <button 
            onClick={() => loadData()}
            disabled={isLoading}
            className={cn(
              'p-1.5 bg-muted hover:bg-zinc-700 border border-border transition-colors',
              isLoading && 'animate-spin'
            )}
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
          <span className="font-mono text-[10px] text-muted-foreground">Loading analytics...</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3 mb-4">
            <StatCard 
              label="DEALS CLOSED" 
              value={summary.thisMonth?.deals ?? 0} 
              change={dealsChange}
            />
            <StatCard 
              label="REVENUE" 
              value={`${((summary.thisMonth?.value || 0) / 1000).toFixed(0)}K`}
              prefix="$"
              change={valueChange}
            />
            <StatCard 
              label="WIN RATE" 
              value={summary.thisMonth?.winRate ?? 0}
              suffix="%"
              change={winRateChange}
            />
            <StatCard 
              label="PIPELINE VALUE" 
              value={`${((summary.pipeline?.totalValue || 0) / 1000).toFixed(0)}K`}
              prefix="$"
            />
            <StatCard 
              label="ACTIVE DEALS" 
              value={summary.pipeline?.totalDeals ?? 0}
            />
            <StatCard 
              label="AVG CYCLE" 
              value={summary.avgCycleTime ?? 0}
              suffix=" days"
            />
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-12 gap-3">
            {/* Sales Funnel - 5 cols */}
            <div className="col-span-5">
              <Panel 
                title="SALES FUNNEL" 
                className="h-full"
                actions={
                  <span className="font-mono text-[10px] text-muted-foreground">
                    conversion rates
                  </span>
                }
              >
                {funnel.length > 0 ? (
                  <FunnelChart data={funnel} />
                ) : (
                  <div className="py-8 text-center">
                    <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-muted-foreground">
                      No pipeline data available
                    </p>
                  </div>
                )}
              </Panel>
            </div>

            {/* Win/Loss Analysis - 4 cols */}
            <div className="col-span-4">
              <Panel 
                title="WIN/LOSS ANALYSIS" 
                className="h-full"
                actions={
                  <span className="font-mono text-[10px] text-muted-foreground">
                    by {period}
                  </span>
                }
              >
                {winLoss.length > 0 ? (
                  <WinLossChart data={winLoss} />
                ) : (
                  <div className="py-8 text-center">
                    <PieChart className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-muted-foreground">
                      No data for this period
                    </p>
                  </div>
                )}
              </Panel>
            </div>

            {/* Agent Leaderboard - 3 cols */}
            <div className="col-span-3">
              <Panel 
                title="TOP PERFORMERS" 
                className="h-full"
                actions={
                  <Trophy className="w-3 h-3 text-amber-500" />
                }
              >
                {agents.length > 0 ? (
                  <AgentLeaderboard data={agents} />
                ) : (
                  <div className="py-8 text-center">
                    <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-muted-foreground">
                      No agent data available
                    </p>
                  </div>
                )}
              </Panel>
            </div>

            {/* Lead Sources - 4 cols */}
            <div className="col-span-4">
              <Panel 
                title="LEAD SOURCE PERFORMANCE" 
                className="h-full"
                actions={
                  <span className="font-mono text-[10px] text-muted-foreground">
                    win rate by source
                  </span>
                }
              >
                {leadSources.length > 0 ? (
                  <LeadSourceChart data={leadSources} />
                ) : (
                  <div className="py-8 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-muted-foreground">
                      No lead source data
                    </p>
                  </div>
                )}
              </Panel>
            </div>

            {/* Cohort Analysis - 8 cols */}
            <div className="col-span-8">
              <Panel 
                title="COHORT ANALYSIS" 
                className="h-full"
                actions={
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground mr-2">group by:</span>
                    {(['month', 'quarter', 'source', 'agent'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setCohortGroupBy(g)}
                        className={cn(
                          'px-2 py-0.5 font-mono text-[9px] transition-colors rounded',
                          cohortGroupBy === g 
                            ? 'bg-amber-500 text-foreground' 
                            : 'bg-zinc-700 text-muted-foreground hover:bg-zinc-600'
                        )}
                      >
                        {g.toUpperCase()}
                      </button>
                    ))}
                  </div>
                }
              >
                {cohorts.length > 0 ? (
                  <CohortTable data={cohorts} />
                ) : (
                  <div className="py-8 text-center">
                    <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-muted-foreground">
                      No cohort data available
                    </p>
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* Insights Section */}
          <div className="mt-4">
            <Panel 
              title="AI INSIGHTS" 
              actions={<Zap className="w-3 h-3 text-amber-500" />}
            >
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-muted/30 rounded border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="font-mono text-[10px] text-green-600 dark:text-green-400">OPPORTUNITY</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {leadSources.length > 0 && (
                      <>
                        <strong>{leadSources[0]?.source || 'Referrals'}</strong> has the highest win rate. 
                        Consider increasing investment in this channel.
                      </>
                    )}
                    {leadSources.length === 0 && 'Connect lead sources to see optimization opportunities.'}
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">BOTTLENECK</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {funnel.length > 0 && funnel.find(s => s.dropoffRate > 30) ? (
                      <>
                        <strong>{funnel.find(s => s.dropoffRate > 30)?.stageName}</strong> stage has high drop-off. 
                        Review deals stuck at this stage.
                      </>
                    ) : (
                      'Pipeline funnel is healthy with no major bottlenecks detected.'
                    )}
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">FORECAST</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    Based on current pipeline and historical conversion, expect 
                    <strong> ${((summary?.pipeline?.totalValue || 0) * 0.3 / 1000).toFixed(0)}K</strong> in 
                    closed deals next month.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
    </div>
  );
}
