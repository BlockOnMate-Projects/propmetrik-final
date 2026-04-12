'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Globe,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  Database,
  Zap,
  Plus,
  Edit,
  Trash2,
  Activity,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

// Types
interface PartnerEndpoint {
  id: string
  source_name: string
  endpoint_name: string
  endpoint_url: string
  auth_method: 'oauth2' | 'api_key' | 'mtls'
  dataset_type: string
  pull_frequency: 'hourly' | 'daily' | 'weekly' | 'monthly'
  pull_method: 'full_sync' | 'incremental' | 'delta'
  is_active: boolean
  last_pull_at?: string
  last_success_at?: string
  health_status: 'healthy' | 'degraded' | 'down' | 'unknown'
  total_records: number
  failed_attempts: number
  created_at: string
}

interface PullJob {
  id: string
  endpoint_id: string
  endpoint_name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  started_at: string
  completed_at?: string
  records_processed: number
  records_imported: number
  error_message?: string
  execution_time_seconds?: number
}

interface PullSchedule {
  id: string
  endpoint_id: string
  endpoint_name: string
  schedule_name: string
  cron_expression: string
  timezone: string
  is_active: boolean
  next_run_at: string
  priority: number
}

const pullIntegrationsApi = {
  getEndpoints: async (): Promise<{ data: PartnerEndpoint[]; count: number }> => {
    const response = await fetch('/api/pull-integrations/endpoints')
    if (!response.ok) throw new Error('Failed to fetch endpoints')
    const result = await response.json()
    return { data: result.data || [], count: result.count || 0 }
  },

  getJobs: async (): Promise<{ data: PullJob[]; count: number }> => {
    const response = await fetch('/api/pull-integrations/jobs')
    if (!response.ok) throw new Error('Failed to fetch jobs')
    const result = await response.json()
    return { data: result.data || [], count: result.count || 0 }
  },

  getSchedules: async (): Promise<{ data: PullSchedule[]; count: number }> => {
    const response = await fetch('/api/pull-integrations/schedules')
    if (!response.ok) throw new Error('Failed to fetch schedules')
    const result = await response.json()
    return { data: result.data || [], count: result.count || 0 }
  },

  executeJob: async (endpointId: string) => {
    try {
      const response = await fetch(`/api/pull-integrations/endpoints/${endpointId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      if (!response.ok) {
        throw new Error('Failed to execute job')
      }
      const result = await response.json()
      return { success: true, jobId: result.jobId }
    } catch (error) {
      console.error('Failed to execute job:', error)
      toast.error('Failed to start job')
      return { success: false }
    }
  },

  toggleEndpoint: async (endpointId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/pull-integrations/endpoints/${endpointId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: isActive })
      })
      if (!response.ok) {
        throw new Error('Failed to update endpoint')
      }
      return { success: true }
    } catch (error) {
      console.error('Failed to toggle endpoint:', error)
      toast.error('Failed to update endpoint status')
      return { success: false }
    }
  },

  createEndpoint: async (endpoint: Partial<PartnerEndpoint>) => {
    try {
      const response = await fetch('/api/pull-integrations/endpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(endpoint)
      })
      if (!response.ok) {
        throw new Error('Failed to create endpoint')
      }
      const result = await response.json()
      return { success: true, data: result }
    } catch (error) {
      console.error('Failed to create endpoint:', error)
      toast.error('Failed to create endpoint')
      return { success: false }
    }
  },

  updateEndpoint: async (endpointId: string, endpoint: Partial<PartnerEndpoint>) => {
    try {
      const response = await fetch(`/api/pull-integrations/endpoints/${endpointId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(endpoint)
      })
      if (!response.ok) {
        throw new Error('Failed to update endpoint')
      }
      const result = await response.json()
      return { success: true, data: result }
    } catch (error) {
      console.error('Failed to update endpoint:', error)
      toast.error('Failed to update endpoint')
      return { success: false }
    }
  },

  deleteEndpoint: async (endpointId: string) => {
    try {
      const response = await fetch(`/api/pull-integrations/endpoints/${endpointId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('Failed to delete endpoint')
      }
      return { success: true }
    } catch (error) {
      console.error('Failed to delete endpoint:', error)
      toast.error('Failed to delete endpoint')
      return { success: false }
    }
  },

  createSchedule: async (schedule: Partial<PullSchedule>) => {
    try {
      const response = await fetch('/api/pull-integrations/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(schedule)
      })
      if (!response.ok) {
        throw new Error('Failed to create schedule')
      }
      const result = await response.json()
      return { success: true, data: result }
    } catch (error) {
      console.error('Failed to create schedule:', error)
      toast.error('Failed to create schedule')
      return { success: false }
    }
  },

  updateSchedule: async (scheduleId: string, schedule: Partial<PullSchedule>) => {
    try {
      const response = await fetch(`/api/pull-integrations/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(schedule)
      })
      if (!response.ok) {
        throw new Error('Failed to update schedule')
      }
      const result = await response.json()
      return { success: true, data: result }
    } catch (error) {
      console.error('Failed to update schedule:', error)
      toast.error('Failed to update schedule')
      return { success: false }
    }
  },

  deleteSchedule: async (scheduleId: string) => {
    try {
      const response = await fetch(`/api/pull-integrations/schedules/${scheduleId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('Failed to delete schedule')
      }
      return { success: true }
    } catch (error) {
      console.error('Failed to delete schedule:', error)
      toast.error('Failed to delete schedule')
      return { success: false }
    }
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'healthy':
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'degraded':
    case 'running':
      return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />
    case 'down':
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <AlertTriangle className="h-4 w-4 text-gray-400" />
  }
}

function FrequencyBadge({ frequency }: { frequency: string }) {
  const colors = {
    hourly: 'bg-blue-100 text-blue-700',
    daily: 'bg-green-100 text-green-700',
    weekly: 'bg-yellow-100 text-yellow-700',
    monthly: 'bg-purple-100 text-purple-700'
  }
  
  return (
    <Badge className={cn('text-xs', colors[frequency as keyof typeof colors] || 'bg-gray-100 text-gray-700')}>
      {frequency}
    </Badge>
  )
}

export default function PullIntegrationsPage() {
  const queryClient = useQueryClient()
  const [selectedTab, setSelectedTab] = useState('endpoints')
  const [showAddEndpointDialog, setShowAddEndpointDialog] = useState(false)
  const [showAddScheduleDialog, setShowAddScheduleDialog] = useState(false)
  const [editingEndpoint, setEditingEndpoint] = useState<PartnerEndpoint | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<PullSchedule | null>(null)

  // Fetch data
  const { data: endpoints, isLoading: endpointsLoading } = useQuery({
    queryKey: ['pull-integrations-endpoints'],
    queryFn: pullIntegrationsApi.getEndpoints,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['pull-integrations-jobs'],
    queryFn: pullIntegrationsApi.getJobs,
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['pull-integrations-schedules'],
    queryFn: pullIntegrationsApi.getSchedules,
  })

  // Mutations
  const executeMutation = useMutation({
    mutationFn: pullIntegrationsApi.executeJob,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Job started successfully')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-jobs'] })
      }
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ endpointId, isActive }: { endpointId: string; isActive: boolean }) =>
      pullIntegrationsApi.toggleEndpoint(endpointId, isActive),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Endpoint status updated')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-endpoints'] })
      }
    },
  })

  const createEndpointMutation = useMutation({
    mutationFn: pullIntegrationsApi.createEndpoint,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Endpoint created successfully')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-endpoints'] })
        setShowAddEndpointDialog(false)
      }
    },
  })

  const updateEndpointMutation = useMutation({
    mutationFn: ({ endpointId, endpoint }: { endpointId: string; endpoint: Partial<PartnerEndpoint> }) =>
      pullIntegrationsApi.updateEndpoint(endpointId, endpoint),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Endpoint updated successfully')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-endpoints'] })
        setEditingEndpoint(null)
      }
    },
  })

  const deleteEndpointMutation = useMutation({
    mutationFn: pullIntegrationsApi.deleteEndpoint,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Endpoint deleted successfully')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-endpoints'] })
      }
    },
  })

  const createScheduleMutation = useMutation({
    mutationFn: pullIntegrationsApi.createSchedule,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Schedule created successfully')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-schedules'] })
        setShowAddScheduleDialog(false)
      }
    },
  })

  const updateScheduleMutation = useMutation({
    mutationFn: ({ scheduleId, schedule }: { scheduleId: string; schedule: Partial<PullSchedule> }) =>
      pullIntegrationsApi.updateSchedule(scheduleId, schedule),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Schedule updated successfully')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-schedules'] })
        setEditingSchedule(null)
      }
    },
  })

  const deleteScheduleMutation = useMutation({
    mutationFn: pullIntegrationsApi.deleteSchedule,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Schedule deleted successfully')
        queryClient.invalidateQueries({ queryKey: ['pull-integrations-schedules'] })
      }
    },
  })

  // Stats
  const activeEndpoints = endpoints?.data?.filter(e => e.is_active).length || 0
  const healthyEndpoints = endpoints?.data?.filter(e => e.health_status === 'healthy').length || 0
  const runningJobs = jobs?.data?.filter(j => j.status === 'running').length || 0
  const completedJobs = jobs?.data?.filter(j => j.status === 'completed').length || 0

  return (
    <div className="flex flex-col h-full">
      <Header
        title="API Pull Integrations"
        description="Manage scheduled data pulls from partner APIs"
      />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Active Endpoints"
              value={activeEndpoints}
              subtitle={`${endpoints?.count || 0} total`}
              icon={Globe}
              color="blue"
              isLoading={endpointsLoading}
            />
            <MetricCard
              title="Healthy Endpoints"
              value={healthyEndpoints}
              subtitle={`${((healthyEndpoints / (endpoints?.count || 1)) * 100).toFixed(0)}% uptime`}
              icon={CheckCircle}
              color="green"
              isLoading={endpointsLoading}
            />
            <MetricCard
              title="Running Jobs"
              value={runningJobs}
              subtitle={`${completedJobs} completed today`}
              icon={Activity}
              color="yellow"
              isLoading={jobsLoading}
            />
            <MetricCard
              title="Total Records"
              value={endpoints?.data?.reduce((sum, e) => sum + e.total_records, 0) || 0}
              subtitle="All endpoints"
              icon={Database}
              color="purple"
              isLoading={endpointsLoading}
            />
          </div>

          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="endpoints">
                Partner Endpoints
                <Badge variant="secondary" className="ml-2">
                  {endpoints?.count || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="jobs">
                Pull Jobs
                <Badge variant="secondary" className="ml-2">
                  {jobs?.count || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="schedules">
                Schedules
                <Badge variant="secondary" className="ml-2">
                  {schedules?.count || 0}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* Endpoints Tab */}
            <TabsContent value="endpoints" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Partner API Endpoints</h3>
                <Button size="sm" onClick={() => setShowAddEndpointDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Endpoint
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source & Endpoint</TableHead>
                        <TableHead>Dataset Type</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Health</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Last Pull</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {endpoints?.data?.map((endpoint) => (
                        <TableRow key={endpoint.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{endpoint.source_name}</div>
                              <div className="text-sm text-muted-foreground">{endpoint.endpoint_name}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {endpoint.auth_method.toUpperCase()}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{endpoint.dataset_type.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell>
                            <FrequencyBadge frequency={endpoint.pull_frequency} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <StatusIcon status={endpoint.health_status} />
                              <span className="text-sm capitalize">{endpoint.health_status}</span>
                              {endpoint.failed_attempts > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {endpoint.failed_attempts} failed
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono">{endpoint.total_records.toLocaleString()}</span>
                          </TableCell>
                          <TableCell>
                            {endpoint.last_pull_at ? (
                              <span className="text-sm">
                                {formatDistanceToNow(new Date(endpoint.last_pull_at), { addSuffix: true })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => executeMutation.mutate(endpoint.id)}
                                disabled={executeMutation.isPending}
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleMutation.mutate({ 
                                  endpointId: endpoint.id, 
                                  isActive: !endpoint.is_active 
                                })}
                              >
                                {endpoint.is_active ? (
                                  <Pause className="h-3 w-3" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingEndpoint(endpoint)}>
                                <Settings className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Jobs Tab */}
            <TabsContent value="jobs" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Pull Job History</h3>
                <Button size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs?.data?.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{job.id}</code>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{job.endpoint_name}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <StatusIcon status={job.status} />
                              <span className="text-sm capitalize">{job.status}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{job.records_imported.toLocaleString()} imported</div>
                              <div className="text-muted-foreground">
                                {job.records_processed.toLocaleString()} processed
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {job.execution_time_seconds ? (
                              <span className="text-sm">{job.execution_time_seconds}s</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Schedules Tab */}
            <TabsContent value="schedules" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Pull Schedules</h3>
                <Button size="sm" onClick={() => setShowAddScheduleDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Schedule
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Schedule Name</TableHead>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Cron Expression</TableHead>
                        <TableHead>Next Run</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedules?.data?.map((schedule) => (
                        <TableRow key={schedule.id}>
                          <TableCell>
                            <span className="font-medium">{schedule.schedule_name}</span>
                          </TableCell>
                          <TableCell>
                            <span>{schedule.endpoint_name}</span>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {schedule.cron_expression}
                            </code>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {formatDistanceToNow(new Date(schedule.next_run_at), { addSuffix: true })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{schedule.priority}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                              {schedule.is_active ? 'Active' : 'Paused'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => setEditingSchedule(schedule)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updateScheduleMutation.mutate({
                                  scheduleId: schedule.id,
                                  schedule: { is_active: !schedule.is_active }
                                })}
                              >
                                {schedule.is_active ? (
                                  <Pause className="h-3 w-3" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Add Endpoint Dialog */}
      <Dialog open={showAddEndpointDialog} onOpenChange={setShowAddEndpointDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Endpoint</DialogTitle>
            <DialogDescription>
              Configure a new partner API endpoint for data integration.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Source Name</label>
              <Input placeholder="e.g., Ghana Revenue Authority" />
            </div>
            <div>
              <label className="text-sm font-medium">Endpoint Name</label>
              <Input placeholder="e.g., Tax Assessment API" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Endpoint URL</label>
              <Input placeholder="https://api.example.com/v1/data" />
            </div>
            <div>
              <label className="text-sm font-medium">Auth Method</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select auth method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Dataset Type</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select dataset type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="land_title_records">Land Title Records</SelectItem>
                  <SelectItem value="tax_assessments">Tax Assessments</SelectItem>
                  <SelectItem value="mortgage_transactions">Mortgage Transactions</SelectItem>
                  <SelectItem value="property_registrations">Property Registrations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Pull Frequency</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Pull Method</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Refresh</SelectItem>
                  <SelectItem value="incremental">Incremental</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEndpointDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // For now, just close the dialog - real implementation would collect form data
              toast.success('Endpoint creation feature will be implemented when backend is connected')
              setShowAddEndpointDialog(false)
            }}>
              Create Endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Schedule Dialog */}
      <Dialog open={showAddScheduleDialog} onOpenChange={setShowAddScheduleDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add New Schedule</DialogTitle>
            <DialogDescription>
              Create a new automated schedule for data pulls.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">Schedule Name</label>
              <Input placeholder="e.g., Daily Property Updates" />
            </div>
            <div>
              <label className="text-sm font-medium">Endpoint</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select endpoint" />
                </SelectTrigger>
                <SelectContent>
                  {endpoints?.data?.map(endpoint => (
                    <SelectItem key={endpoint.id} value={endpoint.id}>
                      {endpoint.endpoint_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Cron Expression</label>
              <Input placeholder="0 8 * * *" />
              <p className="text-xs text-muted-foreground mt-1">
                Format: minute hour day month day-of-week (e.g., &quot;0 8 * * *&quot; = daily at 8:00 AM)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Timezone</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Accra">Africa/Accra (GMT+0)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">America/New_York</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">High (1)</SelectItem>
                  <SelectItem value="2">Medium (2)</SelectItem>
                  <SelectItem value="3">Low (3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // For now, just close the dialog - real implementation would collect form data
              toast.success('Schedule creation feature will be implemented when backend is connected')
              setShowAddScheduleDialog(false)
            }}>
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Endpoint Dialog */}
      <Dialog open={!!editingEndpoint} onOpenChange={() => setEditingEndpoint(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Endpoint</DialogTitle>
            <DialogDescription>
              Modify endpoint configuration and settings.
            </DialogDescription>
          </DialogHeader>
          {editingEndpoint && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Source Name</label>
                <Input defaultValue={editingEndpoint.source_name} />
              </div>
              <div>
                <label className="text-sm font-medium">Endpoint Name</label>
                <Input defaultValue={editingEndpoint.endpoint_name} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Endpoint URL</label>
                <Input defaultValue={editingEndpoint.endpoint_url} />
              </div>
              <div>
                <label className="text-sm font-medium">Pull Frequency</label>
                <Select defaultValue={editingEndpoint.pull_frequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select defaultValue={editingEndpoint.is_active ? 'active' : 'inactive'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEndpoint(null)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success('Endpoint update feature will be implemented when backend is connected')
              setEditingEndpoint(null)
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Dialog */}
      <Dialog open={!!editingSchedule} onOpenChange={() => setEditingSchedule(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>
              Modify schedule configuration and timing.
            </DialogDescription>
          </DialogHeader>
          {editingSchedule && (
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium">Schedule Name</label>
                <Input defaultValue={editingSchedule.schedule_name} />
              </div>
              <div>
                <label className="text-sm font-medium">Cron Expression</label>
                <Input defaultValue={editingSchedule.cron_expression} />
                <p className="text-xs text-muted-foreground mt-1">
                  Current: {editingSchedule.cron_expression}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select defaultValue={editingSchedule.priority.toString()}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">High (1)</SelectItem>
                    <SelectItem value="2">Medium (2)</SelectItem>
                    <SelectItem value="3">Low (3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select defaultValue={editingSchedule.is_active ? 'active' : 'inactive'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSchedule(null)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success('Schedule update feature will be implemented when backend is connected')
              setEditingSchedule(null)
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}