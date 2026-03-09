'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Calendar,
  Cloud,
  CloudRain,
  Sun,
  CloudSun,
  Users,
  Camera,
  Clock,
  MapPin,
  AlertTriangle,
  Hammer,
  Edit,
  Eye,
  Trash2,
  Loader2,
  RefreshCw,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { authedFetch } from '@/lib/authed-fetch';
import { siteLogSchema, validateForm } from '@/lib/schemas/pm.schemas';
import { FieldError, FormErrorSummary } from '@/components/ui/form-errors';
import { Pagination } from '@/components/ui/pagination-controls';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetch = authedFetch;

// Types
interface SiteLog {
  id: string;
  projectId: string;
  projectName: string;
  reportDate: string;
  weatherCondition: string | null;
  temperatureCelsius: number | null;
  informalLaborCount: number;
  informalLaborNotes: string | null;
  workPerformed: string | null;
  incidentsOrDelays: string | null;
  submissionSource: string;
  submittedBy: string;
  submittedByName: string | null;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
}

interface SiteLogFormData {
  projectId: string;
  reportDate: string;
  weatherCondition: string;
  temperatureCelsius: string;
  informalLaborCount: string;
  informalLaborNotes: string;
  workPerformed: string;
  incidentsOrDelays: string;
}

const weatherIcons: Record<string, any> = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  partly_cloudy: CloudSun,
};

const weatherLabels: Record<string, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
  partly_cloudy: 'Partly Cloudy',
};

const defaultFormData: SiteLogFormData = {
  projectId: '',
  reportDate: new Date().toISOString().split('T')[0],
  weatherCondition: 'sunny',
  temperatureCelsius: '30',
  informalLaborCount: '0',
  informalLaborNotes: '',
  workPerformed: '',
  incidentsOrDelays: '',
};

export default function SiteLogsPage() {
  const [siteLogs, setSiteLogs] = useState<SiteLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Dialog states
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewSheet, setShowViewSheet] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SiteLog | null>(null);
  const [formData, setFormData] = useState<SiteLogFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);
  
  const { toast } = useToast();

  // Stats
  const stats = {
    totalLogs: siteLogs.length,
    totalLabor: siteLogs.reduce((sum, log) => sum + (log.informalLaborCount || 0), 0),
    avgInformalLabor: siteLogs.length > 0 
      ? Math.round(siteLogs.reduce((sum, log) => sum + (log.informalLaborCount || 0), 0) / siteLogs.length) 
      : 0,
    totalPhotos: siteLogs.reduce((sum, log) => sum + (log.photoCount || 0), 0),
    logsWithIncidents: siteLogs.filter(l => l.incidentsOrDelays).length,
  };

  // Fetch site logs
  const fetchSiteLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'all') {
        params.append('projectId', selectedProjectId);
      }
      if (search) {
        params.append('search', search);
      }
      params.append('pageSize', '20');
      params.append('page', String(page));

      const response = await fetch(`${API_BASE}/api/site-diaries?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setSiteLogs(result.data || []);
        const total = result.total || result.pagination?.total || (result.data || []).length;
        setTotalCount(total);
        setTotalPages(Math.ceil(total / 20));
      } else {
        throw new Error(result.error || 'Failed to fetch site logs');
      }
    } catch (error: any) {
      console.error('Error fetching site logs:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch site logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, search, page, toast]);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects?pageSize=100`);
      const result = await response.json();
      
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchSiteLogs();
  }, [fetchSiteLogs]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = validateForm(siteLogSchema, formData);
    if (!validation.success) { setFormErrors(validation.errors!); return; }
    setFormErrors(null);

    try {
      setSubmitting(true);
      
      const payload = {
        projectId: formData.projectId,
        reportDate: formData.reportDate,
        weatherCondition: formData.weatherCondition,
        temperatureCelsius: formData.temperatureCelsius ? parseFloat(formData.temperatureCelsius) : null,
        informalLaborCount: parseInt(formData.informalLaborCount) || 0,
        informalLaborNotes: formData.informalLaborNotes || null,
        workPerformed: formData.workPerformed || null,
        incidentsOrDelays: formData.incidentsOrDelays || null,
        submissionSource: 'web',
      };

      const isEdit = showEditDialog && selectedLog;
      const url = isEdit 
        ? `${API_BASE}/api/site-diaries/${selectedLog.id}`
        : `${API_BASE}/api/site-diaries`;
      
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: isEdit ? 'Site log updated successfully' : 'Site log created successfully',
        });
        setShowNewDialog(false);
        setShowEditDialog(false);
        setFormData(defaultFormData);
        setSelectedLog(null);
        fetchSiteLogs();
      } else {
        throw new Error(result.error || 'Failed to save site log');
      }
    } catch (error: any) {
      console.error('Error saving site log:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save site log',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedLog) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/site-diaries/${selectedLog.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Site log deleted successfully',
        });
        setShowDeleteDialog(false);
        setSelectedLog(null);
        fetchSiteLogs();
      } else {
        throw new Error(result.error || 'Failed to delete site log');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete site log',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (log: SiteLog) => {
    setSelectedLog(log);
    setFormData({
      projectId: log.projectId,
      reportDate: log.reportDate.split('T')[0],
      weatherCondition: log.weatherCondition || 'sunny',
      temperatureCelsius: log.temperatureCelsius?.toString() || '30',
      informalLaborCount: log.informalLaborCount?.toString() || '0',
      informalLaborNotes: log.informalLaborNotes || '',
      workPerformed: log.workPerformed || '',
      incidentsOrDelays: log.incidentsOrDelays || '',
    });
    setShowEditDialog(true);
  };

  // Open view sheet
  const openViewSheet = (log: SiteLog) => {
    setSelectedLog(log);
    setShowViewSheet(true);
  };

  // Open delete dialog
  const openDeleteDialog = (log: SiteLog) => {
    setSelectedLog(log);
    setShowDeleteDialog(true);
  };

  // Open new dialog
  const openNewDialog = () => {
    setFormData(defaultFormData);
    setSelectedLog(null);
    setShowNewDialog(true);
  };

  const filteredLogs = siteLogs.filter(log =>
    (log.projectName?.toLowerCase().includes(search.toLowerCase()) ||
    log.workPerformed?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Site Logs</h1>
          <p className="text-zinc-400 text-sm mt-1">Daily reports, inspections, and field documentation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchSiteLogs}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" /> New Site Log
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total Logs</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.totalLogs}</p>
              </div>
              <ClipboardList className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total Labor</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{stats.totalLabor}</p>
              </div>
              <Users className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Avg. Informal</p>
                <p className="text-2xl font-bold text-purple-400 mt-1">{stats.avgInformalLabor}</p>
              </div>
              <Hammer className="h-5 w-5 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Site Photos</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.totalPhotos}</p>
              </div>
              <Camera className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">With Incidents</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.logsWithIncidents}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search logs..."
              className="pl-9 bg-zinc-900 border-zinc-800"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800">
              <Building2 className="h-4 w-4 mr-2 text-zinc-500" />
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Site Logs Found</h3>
            <p className="text-zinc-400 mb-4">
              {search || selectedProjectId !== 'all' 
                ? 'Try adjusting your filters' 
                : 'Create your first site log to get started'}
            </p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" /> New Site Log
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((log) => {
            const WeatherIcon = weatherIcons[log.weatherCondition || 'sunny'] || Sun;
            return (
              <Card key={log.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-zinc-500" />
                          <span className="text-white font-semibold">
                            {new Date(log.reportDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {log.weatherCondition && (
                          <Badge className="bg-zinc-800 text-zinc-300 gap-1">
                            <WeatherIcon className="h-3 w-3" />
                            {weatherLabels[log.weatherCondition]} {log.temperatureCelsius && `${log.temperatureCelsius}°C`}
                          </Badge>
                        )}
                        <Badge className="bg-blue-900/50 text-blue-400 gap-1">
                          <Users className="h-3 w-3" />
                          {log.informalLaborCount} informal workers
                        </Badge>
                        {log.photoCount > 0 && (
                          <Badge className="bg-emerald-900/50 text-emerald-400 gap-1">
                            <Camera className="h-3 w-3" />
                            {log.photoCount} photos
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                        <MapPin className="h-3 w-3" />
                        {log.projectName || 'Unknown Project'}
                      </div>
                      {log.workPerformed && (
                        <p className="text-zinc-300 text-sm leading-relaxed mb-3 line-clamp-2">
                          {log.workPerformed}
                        </p>
                      )}
                      {log.incidentsOrDelays && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-950/20 border border-yellow-900/30 mb-3">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-yellow-200/80 line-clamp-2">{log.incidentsOrDelays}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="h-3 w-3" />
                      {log.submittedByName ? `Logged by ${log.submittedByName}` : 'Logged'} 
                      {' '}at {new Date(log.createdAt).toLocaleTimeString()}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-zinc-700 text-zinc-300"
                        onClick={() => openViewSheet(log)}
                      >
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-zinc-700 text-zinc-300"
                        onClick={() => openEditDialog(log)}
                      >
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-zinc-700 text-red-400 hover:text-red-300 hover:border-red-700"
                        onClick={() => openDeleteDialog(log)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={totalCount} limit={20} onPageChange={setPage} />

      {/* New/Edit Dialog */}
      <Dialog open={showNewDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowNewDialog(false);
          setShowEditDialog(false);
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {showEditDialog ? 'Edit Site Log' : 'Create Daily Site Log'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Record today&apos;s activities, labor, and any incidents.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Project *</Label>
                  <Select 
                    value={formData.projectId} 
                    onValueChange={(value) => setFormData({...formData, projectId: value})}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Date *</Label>
                  <Input 
                    type="date" 
                    value={formData.reportDate}
                    onChange={(e) => setFormData({...formData, reportDate: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Weather</Label>
                  <Select 
                    value={formData.weatherCondition}
                    onValueChange={(value) => setFormData({...formData, weatherCondition: value})}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sunny">☀️ Sunny</SelectItem>
                      <SelectItem value="partly_cloudy">⛅ Partly Cloudy</SelectItem>
                      <SelectItem value="cloudy">☁️ Cloudy</SelectItem>
                      <SelectItem value="rainy">🌧️ Rainy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Temperature (°C)</Label>
                  <Input 
                    type="number" 
                    placeholder="30" 
                    value={formData.temperatureCelsius}
                    onChange={(e) => setFormData({...formData, temperatureCelsius: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Informal Labor</Label>
                  <Input 
                    type="number" 
                    placeholder="0" 
                    value={formData.informalLaborCount}
                    onChange={(e) => setFormData({...formData, informalLaborCount: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Work Performed</Label>
                <Textarea 
                  placeholder="Describe work activities completed today..."
                  value={formData.workPerformed}
                  onChange={(e) => setFormData({...formData, workPerformed: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Informal Labor Notes</Label>
                <Input 
                  placeholder="Notes about informal/casual labor"
                  value={formData.informalLaborNotes}
                  onChange={(e) => setFormData({...formData, informalLaborNotes: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Incidents / Delays</Label>
                <Textarea 
                  placeholder="Any incidents, delays, or issues to report (optional)"
                  value={formData.incidentsOrDelays}
                  onChange={(e) => setFormData({...formData, incidentsOrDelays: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button 
                type="button"
                variant="outline" 
                className="border-zinc-700" 
                onClick={() => { setShowNewDialog(false); setShowEditDialog(false); }}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={submitting}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {showEditDialog ? 'Update Log' : 'Create Log'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Sheet */}
      <Sheet open={showViewSheet} onOpenChange={setShowViewSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-white">Site Log Details</SheetTitle>
            <SheetDescription className="text-zinc-400">
              {selectedLog && new Date(selectedLog.reportDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </SheetDescription>
          </SheetHeader>
          {selectedLog && (
            <div className="mt-6 space-y-6">
              <div>
                <Label className="text-zinc-500 text-xs uppercase">Project</Label>
                <p className="text-white mt-1">{selectedLog.projectName}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Weather</Label>
                  <p className="text-white mt-1">
                    {weatherLabels[selectedLog.weatherCondition || 'sunny']} 
                    {selectedLog.temperatureCelsius && ` - ${selectedLog.temperatureCelsius}°C`}
                  </p>
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Informal Labor</Label>
                  <p className="text-white mt-1">{selectedLog.informalLaborCount} workers</p>
                </div>
              </div>

              {selectedLog.informalLaborNotes && (
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Labor Notes</Label>
                  <p className="text-zinc-300 mt-1">{selectedLog.informalLaborNotes}</p>
                </div>
              )}

              {selectedLog.workPerformed && (
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Work Performed</Label>
                  <p className="text-zinc-300 mt-1">{selectedLog.workPerformed}</p>
                </div>
              )}

              {selectedLog.incidentsOrDelays && (
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Incidents / Delays</Label>
                  <div className="mt-1 p-3 rounded-lg bg-yellow-950/20 border border-yellow-900/30">
                    <p className="text-yellow-200/80">{selectedLog.incidentsOrDelays}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Source</Label>
                  <p className="text-white mt-1 capitalize">{selectedLog.submissionSource}</p>
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs uppercase">Photos</Label>
                  <p className="text-white mt-1">{selectedLog.photoCount}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 border-zinc-700"
                  onClick={() => { setShowViewSheet(false); openEditDialog(selectedLog); }}
                >
                  <Edit className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button 
                  variant="outline" 
                  className="border-zinc-700 text-red-400 hover:text-red-300"
                  onClick={() => { setShowViewSheet(false); openDeleteDialog(selectedLog); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Site Log</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this site log? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button 
              variant="outline" 
              className="border-zinc-700" 
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
