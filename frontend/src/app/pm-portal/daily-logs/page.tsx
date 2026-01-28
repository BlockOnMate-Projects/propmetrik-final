'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  Wind,
  Users,
  HardHat,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Calendar,
  ThermometerSun,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { format, isToday, isYesterday, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { 
  siteLogsApi, 
  projectsApi,
  SiteLog,
  Project
} from '@/lib/pm-portal-api';

type Weather = 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'windy' | 'foggy';

const weatherIcons: Record<Weather, React.ElementType> = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  stormy: CloudRain,
  snowy: Snowflake,
  windy: Wind,
  foggy: Cloud,
};

const weatherLabels: Record<Weather, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
  stormy: 'Stormy',
  snowy: 'Snowy',
  windy: 'Windy',
  foggy: 'Foggy',
};

export default function DailyLogsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.id as string | undefined;
  
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<SiteLog | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(searchParams?.get('new') === 'true');
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    log_date: format(new Date(), 'yyyy-MM-dd'),
    weather: 'sunny' as Weather,
    temperature_high: '',
    temperature_low: '',
    work_performed: '',
    issues_delays: '',
    safety_observations: '',
    visitors: '',
    labor_count: '',
    equipment_on_site: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const logsResponse = await siteLogsApi.getAll({
        projectId,
        search: searchQuery || undefined,
      });
      
      setLogs(logsResponse.data);
      
      if (projectId) {
        try {
          const proj = await projectsApi.getById(projectId);
          setProject(proj);
        } catch {}
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast.error('Failed to load daily logs');
    } finally {
      setLoading(false);
    }
  }, [projectId, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateLog = async () => {
    if (!formData.log_date || !formData.work_performed) {
      toast.error('Please fill in required fields');
      return;
    }
    
    if (!projectId) {
      toast.error('Project ID is required');
      return;
    }
    
    setCreating(true);
    try {
      await siteLogsApi.create({
        project_id: projectId,
        log_date: formData.log_date,
        weather: formData.weather,
        temperature_high: formData.temperature_high ? parseFloat(formData.temperature_high) : undefined,
        temperature_low: formData.temperature_low ? parseFloat(formData.temperature_low) : undefined,
        work_performed: formData.work_performed,
        issues_delays: formData.issues_delays,
        safety_observations: formData.safety_observations,
        visitors: formData.visitors,
        labor_count: formData.labor_count ? parseInt(formData.labor_count) : undefined,
        equipment_on_site: formData.equipment_on_site,
      });
      
      toast.success('Daily log created successfully');
      setShowCreateDialog(false);
      setFormData({
        log_date: format(new Date(), 'yyyy-MM-dd'),
        weather: 'sunny',
        temperature_high: '',
        temperature_low: '',
        work_performed: '',
        issues_delays: '',
        safety_observations: '',
        visitors: '',
        labor_count: '',
        equipment_on_site: '',
      });
      fetchData();
    } catch (error) {
      console.error('Failed to create log:', error);
      toast.error('Failed to create daily log');
    } finally {
      setCreating(false);
    }
  };

  const handleViewLog = (log: SiteLog) => {
    setSelectedLog(log);
    setShowDetailSheet(true);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isToday(date)) return 'Today';
      if (isYesterday(date)) return 'Yesterday';
      return format(date, 'EEE, MMM d');
    } catch {
      return '—';
    }
  };

  const getDateLabel = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'MMMM d, yyyy');
    } catch {
      return '';
    }
  };

  // Calculate stats
  const thisWeekLogs = logs.filter(log => {
    if (!log.log_date) return false;
    const date = new Date(log.log_date);
    const now = new Date();
    return isWithinInterval(date, { start: startOfWeek(now), end: endOfWeek(now) });
  });
  
  const totalLaborHours = logs.reduce((sum, log) => sum + (log.labor_count || 0), 0);
  const hasIssuesCount = logs.filter(log => log.issues_delays).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          {projectId && (
            <Link href={`/pm-portal/projects/${projectId}`} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-sm mb-2 transition-colors">
              <ArrowLeft className="h-3 w-3" />Back to Project
            </Link>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Daily Logs</h1>
              <p className="text-zinc-400 text-sm">Track daily site activities and conditions</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />New Log Entry
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total Logs</p>
            <p className="text-2xl font-bold text-white mt-1">{logs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">This Week</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{thisWeekLogs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total Labor (Workers)</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{totalLaborHours}</p>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${hasIssuesCount > 0 ? 'border-orange-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Logs with Issues</p>
            <p className={`text-2xl font-bold mt-1 ${hasIssuesCount > 0 ? 'text-orange-400' : 'text-white'}`}>{hasIssuesCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search logs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500" />
        </div>
      </div>

      {/* Logs List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
      ) : logs.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Daily Logs Yet</h3>
            <p className="text-zinc-400 text-sm mb-4">Start documenting site activities</p>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-2" />New Log Entry</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const WeatherIcon = weatherIcons[log.weather as Weather] || Cloud;
            return (
              <Card key={log.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer" onClick={() => handleViewLog(log)}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 flex flex-col items-center text-center min-w-[60px]">
                      <span className="text-zinc-500 text-xs uppercase">{format(new Date(log.log_date), 'EEE')}</span>
                      <span className="text-2xl font-bold text-white">{format(new Date(log.log_date), 'd')}</span>
                      <span className="text-zinc-500 text-xs">{format(new Date(log.log_date), 'MMM')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-1.5 text-sm">
                          <WeatherIcon className="h-4 w-4 text-amber-400" />
                          <span className="text-zinc-300">{weatherLabels[log.weather as Weather] || log.weather}</span>
                        </div>
                        {(log.temperature_high || log.temperature_low) && (
                          <div className="flex items-center gap-1 text-sm text-zinc-400">
                            <ThermometerSun className="h-4 w-4" />
                            {log.temperature_low && <span>{log.temperature_low}°</span>}
                            {log.temperature_high && log.temperature_low && <span>-</span>}
                            {log.temperature_high && <span>{log.temperature_high}°F</span>}
                          </div>
                        )}
                        {log.labor_count && (
                          <div className="flex items-center gap-1 text-sm text-zinc-400">
                            <HardHat className="h-4 w-4" />
                            <span>{log.labor_count} workers</span>
                          </div>
                        )}
                      </div>
                      <p className="text-zinc-200 text-sm line-clamp-2">{log.work_performed}</p>
                      {log.issues_delays && (
                        <Badge className="mt-2 bg-orange-500/20 text-orange-400 border-0 text-xs">Has Issues/Delays</Badge>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {log.is_approved ? (
                        <Badge className="bg-green-500/20 text-green-400 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>
                      ) : (
                        <Badge className="bg-zinc-700/50 text-zinc-400 border-0">Draft</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Log Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">New Daily Log Entry</DialogTitle>
            <DialogDescription className="text-zinc-400">Record today's site activities and conditions</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Date *</Label>
                <Input type="date" value={formData.log_date} onChange={(e) => setFormData({ ...formData, log_date: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Weather</Label>
                <Select value={formData.weather} onValueChange={(v) => setFormData({ ...formData, weather: v as Weather })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(weatherLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Workers on Site</Label>
                <Input type="number" placeholder="0" value={formData.labor_count} onChange={(e) => setFormData({ ...formData, labor_count: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Low Temp (°F)</Label>
                <Input type="number" placeholder="65" value={formData.temperature_low} onChange={(e) => setFormData({ ...formData, temperature_low: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">High Temp (°F)</Label>
                <Input type="number" placeholder="85" value={formData.temperature_high} onChange={(e) => setFormData({ ...formData, temperature_high: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Work Performed Today *</Label>
              <Textarea placeholder="Describe work completed today..." value={formData.work_performed} onChange={(e) => setFormData({ ...formData, work_performed: e.target.value })} className="bg-zinc-800 border-zinc-700 min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Issues / Delays</Label>
              <Textarea placeholder="Any issues, delays, or concerns..." value={formData.issues_delays} onChange={(e) => setFormData({ ...formData, issues_delays: e.target.value })} className="bg-zinc-800 border-zinc-700 min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Safety Observations</Label>
              <Textarea placeholder="Safety incidents, near-misses, observations..." value={formData.safety_observations} onChange={(e) => setFormData({ ...formData, safety_observations: e.target.value })} className="bg-zinc-800 border-zinc-700 min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Visitors</Label>
                <Input placeholder="Owner, inspector, etc." value={formData.visitors} onChange={(e) => setFormData({ ...formData, visitors: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Equipment on Site</Label>
                <Input placeholder="Crane, excavator, etc." value={formData.equipment_on_site} onChange={(e) => setFormData({ ...formData, equipment_on_site: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleCreateLog} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700">
              {creating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : (<><Plus className="h-4 w-4 mr-2" />Save Log</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-400" />
              {selectedLog && getDateLabel(selectedLog.log_date)}
            </SheetTitle>
          </SheetHeader>
          {selectedLog && (
            <div className="mt-6 space-y-6">
              {/* Weather & Conditions */}
              <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-zinc-800/50 border border-zinc-800">
                {(() => {
                  const WeatherIcon = weatherIcons[selectedLog.weather as Weather] || Cloud;
                  return (
                    <div className="flex items-center gap-2">
                      <WeatherIcon className="h-5 w-5 text-amber-400" />
                      <span className="text-white">{weatherLabels[selectedLog.weather as Weather] || selectedLog.weather}</span>
                    </div>
                  );
                })()}
                {(selectedLog.temperature_high || selectedLog.temperature_low) && (
                  <div className="flex items-center gap-1 text-zinc-300">
                    <ThermometerSun className="h-4 w-4 text-orange-400" />
                    {selectedLog.temperature_low}° - {selectedLog.temperature_high}°F
                  </div>
                )}
                {selectedLog.labor_count && (
                  <div className="flex items-center gap-1 text-zinc-300">
                    <HardHat className="h-4 w-4 text-blue-400" />
                    {selectedLog.labor_count} workers
                  </div>
                )}
              </div>
              
              {/* Work Performed */}
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-2">Work Performed</h4>
                <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedLog.work_performed}</p>
              </div>
              
              {/* Issues */}
              {selectedLog.issues_delays && (
                <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <h4 className="text-sm font-medium text-orange-400 mb-2">Issues / Delays</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedLog.issues_delays}</p>
                </div>
              )}
              
              {/* Safety */}
              {selectedLog.safety_observations && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Safety Observations</h4>
                  <p className="text-zinc-200 text-sm whitespace-pre-wrap">{selectedLog.safety_observations}</p>
                </div>
              )}
              
              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedLog.visitors && (
                  <div className="space-y-1">
                    <p className="text-zinc-500">Visitors</p>
                    <p className="text-zinc-200">{selectedLog.visitors}</p>
                  </div>
                )}
                {selectedLog.equipment_on_site && (
                  <div className="space-y-1">
                    <p className="text-zinc-500">Equipment on Site</p>
                    <p className="text-zinc-200">{selectedLog.equipment_on_site}</p>
                  </div>
                )}
              </div>
              
              {/* Footer */}
              <div className="pt-4 border-t border-zinc-800 text-sm text-zinc-500">
                Created by {selectedLog.created_by_name || 'Unknown'} • {format(new Date(selectedLog.created_at), 'MMM d, yyyy h:mm a')}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
