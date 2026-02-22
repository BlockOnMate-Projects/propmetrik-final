'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Target,
    TrendingUp,
    TrendingDown,
    Trophy,
    Star,
    Award,
    Users,
    DollarSign,
    Calendar,
    RefreshCw,
    Plus,
    Filter,
    BarChart3,
    ArrowUp,
    ArrowDown,
    Minus,
    CheckCircle2,
    AlertCircle,
    Clock,
    Medal,
    Flame,
    Crown,
    ChevronRight,
    Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/crm/EmptyState';
import { toast } from 'sonner';

// Types
interface SalesTarget {
    id: string;
    agent_id: string;
    agent_name: string;
    target_type: 'revenue' | 'deals' | 'listings' | 'viewings';
    period: 'monthly' | 'quarterly' | 'yearly';
    target_value: number;
    current_value: number;
    progress_percentage: number;
    status: 'on_track' | 'at_risk' | 'behind' | 'exceeded' | 'completed';
    start_date: string;
    end_date: string;
    created_at: string;
}

interface LeaderboardEntry {
    rank: number;
    agent_id: string;
    agent_name: string;
    avatar_url?: string;
    total_revenue: number;
    total_deals: number;
    avg_deal_value: number;
    commission_earned: number;
    targets_met: number;
    targets_total: number;
    score: number;
}

interface TargetStats {
    total_targets: number;
    on_track: number;
    at_risk: number;
    behind: number;
    exceeded: number;
    avg_completion: number;
}

interface Achievement {
    id: string;
    agent_id: string;
    agent_name: string;
    achievement_type: string;
    title: string;
    description: string;
    awarded_at: string;
    badge_icon?: string;
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
        case 'exceeded':
        case 'on_track':
            return <TrendingUp className="h-4 w-4 text-green-500" />;
        case 'at_risk':
            return <Minus className="h-4 w-4 text-yellow-500" />;
        case 'behind':
            return <TrendingDown className="h-4 w-4 text-red-500" />;
        default:
            return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'exceeded':
            return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
        case 'on_track':
        case 'completed':
            return 'bg-green-500/10 text-green-500 border-green-500/20';
        case 'at_risk':
            return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
        case 'behind':
            return 'bg-red-500/10 text-red-500 border-red-500/20';
        default:
            return 'bg-muted text-muted-foreground border-border';
    }
}

function getProgressColor(percentage: number): string {
    if (percentage >= 100) return 'text-purple-500';
    if (percentage >= 75) return 'text-green-500';
    if (percentage >= 50) return 'text-yellow-500';
    return 'text-red-500';
}

function getBadgeIcon(type: string) {
    switch (type) {
        case 'top_performer':
            return <Crown className="h-5 w-5 text-yellow-500" />;
        case 'deal_closer':
            return <Trophy className="h-5 w-5 text-blue-500" />;
        case 'streak':
            return <Flame className="h-5 w-5 text-orange-500" />;
        case 'milestone':
            return <Star className="h-5 w-5 text-green-500" />;
        default:
            return <Medal className="h-5 w-5 text-primary" />;
    }
}

// Circular Progress Component
function CircularProgress({ percentage, size = 64 }: { percentage: number; size?: number }) {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
    const colorClass = getProgressColor(percentage);

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg className="transform -rotate-90" width={size} height={size}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-muted"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className={colorClass}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xs font-bold ${colorClass}`}>{Math.round(percentage)}%</span>
            </div>
        </div>
    );
}

// Target Card Component
function TargetCard({ target }: { target: SalesTarget }) {
    const typeLabels: Record<string, string> = {
        revenue: 'Revenue',
        deals: 'Deals',
        listings: 'Listings',
        viewings: 'Viewings',
    };

    const typeIcons: Record<string, React.ReactNode> = {
        revenue: <DollarSign className="h-4 w-4" />,
        deals: <Trophy className="h-4 w-4" />,
        listings: <BarChart3 className="h-4 w-4" />,
        viewings: <Users className="h-4 w-4" />,
    };

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-primary">{typeIcons[target.target_type]}</span>
                            <span className="text-sm font-medium text-muted-foreground">{typeLabels[target.target_type]}</span>
                            <Badge variant="outline" className={getStatusColor(target.status)}>
                                {target.status.replace('_', ' ')}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                            <Avatar className="h-6 w-6">
                                <AvatarFallback className="bg-muted text-xs">
                                    {target.agent_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{target.agent_name}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mb-3">
                            {target.period} &middot;{' '}
                            {new Date(target.start_date).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                            {' - '}
                            {new Date(target.end_date).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                        </div>
                        
                        {/* Progress bar */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                    {target.target_type === 'revenue' 
                                        ? formatCurrency(target.current_value)
                                        : formatNumber(target.current_value)}
                                </span>
                                <span className="font-medium">
                                    {target.target_type === 'revenue'
                                        ? formatCurrency(target.target_value)
                                        : formatNumber(target.target_value)}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        target.progress_percentage >= 100
                                            ? 'bg-purple-500'
                                            : target.progress_percentage >= 75
                                            ? 'bg-green-500'
                                            : target.progress_percentage >= 50
                                            ? 'bg-yellow-500'
                                            : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(target.progress_percentage, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="ml-4 flex flex-col items-center gap-1">
                        <CircularProgress percentage={target.progress_percentage} />
                        {getPacingIcon(target.status)}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// Leaderboard Table
function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
    return (
        <Table>
            <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Deals</TableHead>
                    <TableHead className="text-right">Avg Deal</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Targets Met</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {entries.map((entry) => (
                    <TableRow key={entry.agent_id} className="border-border">
                        <TableCell>
                            <div className="flex items-center justify-center">
                                {entry.rank === 1 && <Crown className="h-5 w-5 text-yellow-500" />}
                                {entry.rank === 2 && <Medal className="h-5 w-5 text-gray-400" />}
                                {entry.rank === 3 && <Medal className="h-5 w-5 text-amber-700" />}
                                {entry.rank > 3 && <span className="text-muted-foreground">{entry.rank}</span>}
                            </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                    {entry.avatar_url && <AvatarImage src={entry.avatar_url} />}
                                    <AvatarFallback className="bg-muted text-xs">
                                        {entry.agent_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{entry.agent_name}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(entry.total_revenue)}</TableCell>
                        <TableCell className="text-right">{entry.total_deals}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.avg_deal_value)}</TableCell>
                        <TableCell className="text-right text-green-500">{formatCurrency(entry.commission_earned)}</TableCell>
                        <TableCell className="text-right">
                            <span className="text-primary">{entry.targets_met}</span>
                            <span className="text-muted-foreground">/{entry.targets_total}</span>
                        </TableCell>
                        <TableCell className="text-right">
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                {entry.score}
                            </Badge>
                        </TableCell>
                    </TableRow>
                ))}
                {entries.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No leaderboard data available
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

// Create Target Dialog
function CreateTargetDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        agent_id: '',
        target_type: 'revenue',
        period: 'monthly',
        target_value: '',
    });

    const handleSubmit = async () => {
        if (!formData.target_value) return;
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/api/crm/targets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...formData,
                    target_value: parseFloat(formData.target_value),
                }),
            });

            if (!response.ok) throw new Error('Failed to create target');
            toast.success('Target created successfully');
            onOpenChange(false);
            onCreated();
        } catch (error) {
            toast.error('Failed to create target');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Create Sales Target
                    </DialogTitle>
                    <DialogDescription>
                        Set a new performance target for an agent
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Agent ID</Label>
                        <Input
                            placeholder="Enter agent ID"
                            value={formData.agent_id}
                            onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Target Type</Label>
                            <Select
                                value={formData.target_type}
                                onValueChange={(v) => setFormData({ ...formData, target_type: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="revenue">Revenue</SelectItem>
                                    <SelectItem value="deals">Deals</SelectItem>
                                    <SelectItem value="listings">Listings</SelectItem>
                                    <SelectItem value="viewings">Viewings</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Period</Label>
                            <Select
                                value={formData.period}
                                onValueChange={(v) => setFormData({ ...formData, period: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                    <SelectItem value="yearly">Yearly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Target Value</Label>
                        <Input
                            type="number"
                            placeholder={formData.target_type === 'revenue' ? 'Target amount in GHS' : 'Target count'}
                            value={formData.target_value}
                            onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !formData.target_value}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {loading ? 'Creating...' : 'Create Target'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Main Page Component
export default function TargetsPage() {
    const router = useRouter();
    const [targets, setTargets] = useState<SalesTarget[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [stats, setStats] = useState<TargetStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    // Filters
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [periodFilter, setPeriodFilter] = useState<string>('all');

    const fetchData = useCallback(async () => {
        try {
            const [targetsRes, leaderboardRes, achievementsRes] = await Promise.all([
                fetch(`${API_BASE}/api/crm/targets?limit=100`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/crm/targets/leaderboard`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/crm/targets/achievements?limit=50`, { credentials: 'include' }),
            ]);

            if (targetsRes.ok) {
                const data = await targetsRes.json();
                setTargets(data.targets || []);
                setStats(data.stats || null);
            }
            if (leaderboardRes.ok) {
                const data = await leaderboardRes.json();
                setLeaderboard(data.leaderboard || []);
            }
            if (achievementsRes.ok) {
                const data = await achievementsRes.json();
                setAchievements(data.achievements || []);
            }
        } catch (error) {
            console.error('Failed to fetch targets data:', error);
            toast.error('Failed to load targets data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRefresh = () => {
        setLoading(true);
        fetchData();
    };

    const filteredTargets = targets.filter(t => {
        if (typeFilter !== 'all' && t.target_type !== typeFilter) return false;
        if (periodFilter !== 'all' && t.period !== periodFilter) return false;
        return true;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                        <Target className="h-6 w-6 text-primary" />
                        Sales Targets
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Track performance targets and team achievements
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => setCreateDialogOpen(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Target
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Targets</p>
                                    <p className="text-2xl font-bold">{stats.total_targets}</p>
                                </div>
                                <Target className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">On Track</p>
                                    <p className="text-2xl font-bold text-green-500">{stats.on_track}</p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-green-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">At Risk</p>
                                    <p className="text-2xl font-bold text-yellow-500">{stats.at_risk}</p>
                                </div>
                                <AlertCircle className="h-8 w-8 text-yellow-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Behind</p>
                                    <p className="text-2xl font-bold text-red-500">{stats.behind}</p>
                                </div>
                                <TrendingDown className="h-8 w-8 text-red-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Avg Completion</p>
                                    <p className="text-2xl font-bold text-primary">{Math.round(stats.avg_completion)}%</p>
                                </div>
                                <Percent className="h-8 w-8 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Main Content Tabs */}
            <Tabs defaultValue="targets" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="targets">
                        <Target className="h-4 w-4 mr-2" />
                        Targets
                    </TabsTrigger>
                    <TabsTrigger value="leaderboard">
                        <Trophy className="h-4 w-4 mr-2" />
                        Leaderboard
                    </TabsTrigger>
                    <TabsTrigger value="achievements">
                        <Award className="h-4 w-4 mr-2" />
                        Achievements
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="targets" className="space-y-4">
                    {/* Filters */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="revenue">Revenue</SelectItem>
                                    <SelectItem value="deals">Deals</SelectItem>
                                    <SelectItem value="listings">Listings</SelectItem>
                                    <SelectItem value="viewings">Viewings</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Select value={periodFilter} onValueChange={setPeriodFilter}>
                            <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Period" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Periods</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {filteredTargets.length === 0 ? (
                        <EmptyState
                            icon={Target}
                            title="No targets found"
                            description="Create sales targets to track agent performance and drive results."
                            actions={[
                                {
                                    label: 'Create Target',
                                    onClick: () => setCreateDialogOpen(true),
                                    icon: Plus,
                                },
                            ]}
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredTargets.map((target) => (
                                <TargetCard key={target.id} target={target} />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="leaderboard" className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Trophy className="h-5 w-5 text-yellow-500" />
                                Sales Leaderboard
                            </CardTitle>
                            <CardDescription>
                                Agent performance rankings based on deals and targets
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <LeaderboardTable entries={leaderboard} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="achievements" className="space-y-4">
                    {achievements.length === 0 ? (
                        <EmptyState
                            icon={Award}
                            title="No achievements yet"
                            description="Achievements are automatically awarded when agents hit milestones and targets."
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {achievements.map((achievement) => (
                                <Card key={achievement.id} className="shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="pt-6">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 rounded-full bg-muted">
                                                {getBadgeIcon(achievement.achievement_type)}
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold">{achievement.title}</h3>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {achievement.description}
                                                </p>
                                                <div className="flex items-center gap-2 mt-3">
                                                    <Avatar className="h-5 w-5">
                                                        <AvatarFallback className="bg-muted text-[10px]">
                                                            {achievement.agent_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-xs text-muted-foreground">
                                                        {achievement.agent_name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        &middot; {new Date(achievement.awarded_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
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
