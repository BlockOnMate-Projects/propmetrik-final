'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Target,
    TrendingUp,
    TrendingDown,
    Minus,
    Trophy,
    Medal,
    Star,
    Users,
    Calendar,
    Plus,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Clock,
    Flame,
    Award,
    Crown,
    Zap,
    BarChart3,
    Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

// Types
interface SalesTarget {
    id: string;
    agent_id: string | null;
    team_id: string | null;
    target_type: 'deals' | 'revenue' | 'commission' | 'viewings' | 'listings' | 'calls';
    target_period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    target_value: number;
    current_value: number;
    percentage_complete: number;
    period_start: string;
    period_end: string;
    status: 'on_track' | 'at_risk' | 'behind' | 'achieved' | 'exceeded';
    pacing_status: 'ahead' | 'on_pace' | 'behind';
    agent_name?: string;
    team_name?: string;
    days_remaining?: number;
}

interface LeaderboardEntry {
    agent_id: string;
    agent_name: string;
    avatar_url: string | null;
    total_deals: number;
    total_revenue: number;
    targets_achieved: number;
    achievement_points: number;
    current_streak: number;
    rank?: number;
}

interface TargetStats {
    total_targets: number;
    achieved: number;
    on_track: number;
    at_risk: number;
    behind: number;
    achievement_rate: number;
}

interface Achievement {
    id: string;
    badge_name: string;
    badge_description: string;
    badge_icon: string;
    points: number;
    earned_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Helper functions
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: 'GHS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatNumber(num: number): string {
    return new Intl.NumberFormat('en-GH').format(num);
}

function getPacingIcon(status: string) {
    switch (status) {
        case 'ahead':
            return <TrendingUp className="h-4 w-4 text-green-500" />;
        case 'behind':
            return <TrendingDown className="h-4 w-4 text-red-500" />;
        default:
            return <Minus className="h-4 w-4 text-yellow-500" />;
    }
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'achieved':
        case 'exceeded':
            return 'bg-green-500/10 text-green-500 border-green-500/20';
        case 'on_track':
            return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        case 'at_risk':
            return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
        case 'behind':
            return 'bg-red-500/10 text-red-500 border-red-500/20';
        default:
            return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
    }
}

function getProgressColor(percentage: number): string {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
}

function getBadgeIcon(iconName: string) {
    const icons: Record<string, any> = {
        star: Star,
        trophy: Trophy,
        medal: Medal,
        flame: Flame,
        award: Award,
        crown: Crown,
        zap: Zap,
    };
    const Icon = icons[iconName] || Trophy;
    return <Icon className="h-5 w-5" />;
}

// Components
function CircularProgress({ value, size = 120, strokeWidth = 8 }: { value: number; size?: number; strokeWidth?: number }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (Math.min(value, 100) / 100) * circumference;
    
    const getColor = () => {
        if (value >= 100) return '#22c55e';
        if (value >= 75) return '#3b82f6';
        if (value >= 50) return '#eab308';
        return '#ef4444';
    };

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg className="transform -rotate-90" width={size} height={size}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-zinc-800"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={getColor()}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-500 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{Math.round(value)}%</span>
            </div>
        </div>
    );
}

function TargetCard({ target }: { target: SalesTarget }) {
    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            deals: 'Deals Closed',
            revenue: 'Revenue',
            commission: 'Commission',
            viewings: 'Viewings',
            listings: 'Listings',
            calls: 'Calls Made',
        };
        return labels[type] || type;
    };

    const getValue = (value: number) => {
        if (target.target_type === 'revenue' || target.target_type === 'commission') {
            return formatCurrency(value);
        }
        return formatNumber(value);
    };

    return (
        <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-amber-500" />
                        <CardTitle className="text-base">{getTypeLabel(target.target_type)}</CardTitle>
                    </div>
                    <Badge variant="outline" className={getStatusColor(target.status)}>
                        {target.status.replace('_', ' ')}
                    </Badge>
                </div>
                <CardDescription>
                    {target.agent_name || target.team_name || 'Organization Target'}
                    {' • '}
                    {target.target_period.charAt(0).toUpperCase() + target.target_period.slice(1)}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-6">
                    <CircularProgress value={target.percentage_complete} size={100} />
                    <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400">Current</span>
                            <span className="font-medium">{getValue(target.current_value)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400">Target</span>
                            <span className="font-medium">{getValue(target.target_value)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400">Pacing</span>
                            <div className="flex items-center gap-1">
                                {getPacingIcon(target.pacing_status)}
                                <span className="capitalize">{target.pacing_status.replace('_', ' ')}</span>
                            </div>
                        </div>
                        {target.days_remaining !== undefined && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-400">Days Left</span>
                                <div className="flex items-center gap-1">
                                    <Clock className="h-4 w-4" />
                                    <span>{target.days_remaining}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function LeaderboardTable({ entries, period }: { entries: LeaderboardEntry[]; period: string }) {
    return (
        <Table>
            <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Deals</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Targets Hit</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="text-right">Streak</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {entries.map((entry, index) => (
                    <TableRow key={entry.agent_id} className="border-zinc-800">
                        <TableCell>
                            {index === 0 ? (
                                <div className="flex items-center justify-center w-8 h-8 bg-amber-500/10 rounded-full">
                                    <Crown className="h-4 w-4 text-amber-500" />
                                </div>
                            ) : index === 1 ? (
                                <div className="flex items-center justify-center w-8 h-8 bg-zinc-400/10 rounded-full">
                                    <Medal className="h-4 w-4 text-zinc-400" />
                                </div>
                            ) : index === 2 ? (
                                <div className="flex items-center justify-center w-8 h-8 bg-amber-700/10 rounded-full">
                                    <Medal className="h-4 w-4 text-amber-700" />
                                </div>
                            ) : (
                                <span className="text-zinc-500 font-medium ml-2">{index + 1}</span>
                            )}
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={entry.avatar_url || undefined} />
                                    <AvatarFallback className="bg-zinc-800 text-xs">
                                        {entry.agent_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{entry.agent_name}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{entry.total_deals}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(entry.total_revenue)}</TableCell>
                        <TableCell className="text-right">
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                {entry.targets_achieved}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                <Star className="h-4 w-4 text-amber-500" />
                                <span>{entry.achievement_points}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-right">
                            {entry.current_streak > 0 ? (
                                <div className="flex items-center justify-end gap-1">
                                    <Flame className="h-4 w-4 text-orange-500" />
                                    <span>{entry.current_streak}</span>
                                </div>
                            ) : (
                                <span className="text-zinc-500">-</span>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
                {entries.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                            No leaderboard data available
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

function CreateTargetDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        target_type: 'deals',
        target_period: 'monthly',
        target_value: '',
        is_bulk: false,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const endpoint = formData.is_bulk ? '/api/crm/targets/bulk' : '/api/crm/targets';
            
            // Calculate period dates
            const now = new Date();
            let periodStart: Date;
            let periodEnd: Date;

            switch (formData.target_period) {
                case 'daily':
                    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    periodEnd = new Date(periodStart);
                    periodEnd.setDate(periodEnd.getDate() + 1);
                    break;
                case 'weekly':
                    const dayOfWeek = now.getDay();
                    periodStart = new Date(now);
                    periodStart.setDate(now.getDate() - dayOfWeek);
                    periodEnd = new Date(periodStart);
                    periodEnd.setDate(periodEnd.getDate() + 7);
                    break;
                case 'quarterly':
                    const quarter = Math.floor(now.getMonth() / 3);
                    periodStart = new Date(now.getFullYear(), quarter * 3, 1);
                    periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
                    break;
                case 'yearly':
                    periodStart = new Date(now.getFullYear(), 0, 1);
                    periodEnd = new Date(now.getFullYear(), 11, 31);
                    break;
                default: // monthly
                    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            }

            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    target_type: formData.target_type,
                    target_period: formData.target_period,
                    target_value: parseFloat(formData.target_value),
                    period_start: periodStart.toISOString(),
                    period_end: periodEnd.toISOString(),
                }),
            });

            if (!response.ok) throw new Error('Failed to create target');

            toast.success(formData.is_bulk ? 'Targets created for all agents' : 'Target created successfully');
            onOpenChange(false);
            onCreated();
            setFormData({ target_type: 'deals', target_period: 'monthly', target_value: '', is_bulk: false });
        } catch (error) {
            toast.error('Failed to create target');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader>
                    <DialogTitle>Create New Target</DialogTitle>
                    <DialogDescription>
                        Set a new performance target for your team
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Target Type</Label>
                        <Select value={formData.target_type} onValueChange={(v) => setFormData(prev => ({ ...prev, target_type: v }))}>
                            <SelectTrigger className="bg-zinc-800 border-zinc-700">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="deals">Deals Closed</SelectItem>
                                <SelectItem value="revenue">Revenue</SelectItem>
                                <SelectItem value="commission">Commission</SelectItem>
                                <SelectItem value="viewings">Viewings Conducted</SelectItem>
                                <SelectItem value="listings">Listings Added</SelectItem>
                                <SelectItem value="calls">Calls Made</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Period</Label>
                        <Select value={formData.target_period} onValueChange={(v) => setFormData(prev => ({ ...prev, target_period: v }))}>
                            <SelectTrigger className="bg-zinc-800 border-zinc-700">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Target Value</Label>
                        <Input
                            type="number"
                            placeholder={formData.target_type === 'revenue' || formData.target_type === 'commission' ? 'Enter amount' : 'Enter count'}
                            value={formData.target_value}
                            onChange={(e) => setFormData(prev => ({ ...prev, target_value: e.target.value }))}
                            className="bg-zinc-800 border-zinc-700"
                            required
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="is_bulk"
                            checked={formData.is_bulk}
                            onChange={(e) => setFormData(prev => ({ ...prev, is_bulk: e.target.checked }))}
                            className="rounded border-zinc-700"
                        />
                        <Label htmlFor="is_bulk" className="font-normal cursor-pointer">
                            Create for all active agents
                        </Label>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700">
                            {loading ? 'Creating...' : 'Create Target'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function TargetsPage() {
    const router = useRouter();
    const [targets, setTargets] = useState<SalesTarget[]>([]);
    const [stats, setStats] = useState<TargetStats | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [leaderboardPeriod, setLeaderboardPeriod] = useState<'mtd' | 'qtd' | 'ytd'>('mtd');
    const [filterType, setFilterType] = useState<string>('all');
    const [filterPeriod, setFilterPeriod] = useState<string>('all');

    const fetchData = useCallback(async () => {
        try {
            const [targetsRes, statsRes, leaderboardRes] = await Promise.all([
                fetch(`${API_BASE}/api/crm/targets`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/crm/targets/stats`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/crm/targets/leaderboard?period=${leaderboardPeriod}`, { credentials: 'include' }),
            ]);

            if (targetsRes.ok) {
                const data = await targetsRes.json();
                setTargets(data.targets || []);
            }

            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data.stats);
            }

            if (leaderboardRes.ok) {
                const data = await leaderboardRes.json();
                setLeaderboard(data.leaderboard || []);
            }
        } catch (error) {
            console.error('Failed to fetch targets data:', error);
            toast.error('Failed to load targets');
        } finally {
            setLoading(false);
        }
    }, [leaderboardPeriod]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await fetch(`${API_BASE}/api/crm/targets/refresh-all`, {
                method: 'POST',
                credentials: 'include',
            });
            await fetchData();
            toast.success('Targets refreshed');
        } catch (error) {
            toast.error('Failed to refresh targets');
        } finally {
            setRefreshing(false);
        }
    };

    const filteredTargets = targets.filter(t => {
        if (filterType !== 'all' && t.target_type !== filterType) return false;
        if (filterPeriod !== 'all' && t.target_period !== filterPeriod) return false;
        return true;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Target className="h-6 w-6 text-amber-500" />
                        Sales Targets & Performance
                    </h1>
                    <p className="text-zinc-400 mt-1">
                        Track goals, monitor progress, and celebrate achievements
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                        onClick={() => setCreateDialogOpen(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Target
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">Total Targets</p>
                                    <p className="text-2xl font-bold">{stats.total_targets}</p>
                                </div>
                                <Target className="h-8 w-8 text-zinc-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">Achieved</p>
                                    <p className="text-2xl font-bold text-green-500">{stats.achieved}</p>
                                </div>
                                <CheckCircle2 className="h-8 w-8 text-green-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">On Track</p>
                                    <p className="text-2xl font-bold text-blue-500">{stats.on_track}</p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-blue-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">At Risk</p>
                                    <p className="text-2xl font-bold text-yellow-500">{stats.at_risk}</p>
                                </div>
                                <AlertCircle className="h-8 w-8 text-yellow-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">Achievement Rate</p>
                                    <p className="text-2xl font-bold">{stats.achievement_rate}%</p>
                                </div>
                                <Trophy className="h-8 w-8 text-amber-600" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Main Content */}
            <Tabs defaultValue="targets" className="space-y-4">
                <TabsList className="bg-zinc-900 border border-zinc-800">
                    <TabsTrigger value="targets" className="data-[state=active]:bg-zinc-800">
                        <Target className="h-4 w-4 mr-2" />
                        Active Targets
                    </TabsTrigger>
                    <TabsTrigger value="leaderboard" className="data-[state=active]:bg-zinc-800">
                        <Trophy className="h-4 w-4 mr-2" />
                        Leaderboard
                    </TabsTrigger>
                    <TabsTrigger value="achievements" className="data-[state=active]:bg-zinc-800">
                        <Award className="h-4 w-4 mr-2" />
                        Achievements
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="targets" className="space-y-4">
                    {/* Filters */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-zinc-400" />
                            <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="deals">Deals</SelectItem>
                                    <SelectItem value="revenue">Revenue</SelectItem>
                                    <SelectItem value="commission">Commission</SelectItem>
                                    <SelectItem value="viewings">Viewings</SelectItem>
                                    <SelectItem value="listings">Listings</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                            <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800">
                                <SelectValue placeholder="Period" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Periods</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Target Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredTargets.map((target) => (
                            <TargetCard key={target.id} target={target} />
                        ))}
                        {filteredTargets.length === 0 && (
                            <Card className="col-span-full bg-zinc-900 border-zinc-800">
                                <CardContent className="flex flex-col items-center justify-center py-12">
                                    <Target className="h-12 w-12 text-zinc-600 mb-4" />
                                    <h3 className="text-lg font-medium">No Targets Found</h3>
                                    <p className="text-zinc-400 mt-1">Create your first target to start tracking performance</p>
                                    <Button
                                        className="mt-4 bg-amber-600 hover:bg-amber-700"
                                        onClick={() => setCreateDialogOpen(true)}
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Target
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="leaderboard" className="space-y-4">
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Trophy className="h-5 w-5 text-amber-500" />
                                        Agent Leaderboard
                                    </CardTitle>
                                    <CardDescription>
                                        Top performers ranked by deals, revenue, and achievements
                                    </CardDescription>
                                </div>
                                <Select value={leaderboardPeriod} onValueChange={(v: any) => setLeaderboardPeriod(v)}>
                                    <SelectTrigger className="w-[120px] bg-zinc-800 border-zinc-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mtd">This Month</SelectItem>
                                        <SelectItem value="qtd">This Quarter</SelectItem>
                                        <SelectItem value="ytd">This Year</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <LeaderboardTable entries={leaderboard} period={leaderboardPeriod} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="achievements" className="space-y-4">
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Award className="h-5 w-5 text-amber-500" />
                                Recent Achievements
                            </CardTitle>
                            <CardDescription>
                                Badges and milestones earned by your team
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {achievements.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {achievements.map((achievement) => (
                                        <div
                                            key={achievement.id}
                                            className="flex items-center gap-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700"
                                        >
                                            <div className="flex items-center justify-center w-12 h-12 bg-amber-500/10 rounded-full text-amber-500">
                                                {getBadgeIcon(achievement.badge_icon)}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-medium">{achievement.badge_name}</h4>
                                                <p className="text-sm text-zinc-400">{achievement.badge_description}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Star className="h-3 w-3 text-amber-500" />
                                                    <span className="text-xs text-amber-500">{achievement.points} points</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Award className="h-12 w-12 text-zinc-600 mb-4" />
                                    <h3 className="text-lg font-medium">No Achievements Yet</h3>
                                    <p className="text-zinc-400 mt-1">Achievements will appear here as they are earned</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Create Target Dialog */}
            <CreateTargetDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onCreated={fetchData}
            />
        </div>
    );
}
