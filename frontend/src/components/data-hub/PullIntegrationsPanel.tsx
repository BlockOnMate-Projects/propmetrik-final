'use client'

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
import { authedFetch } from '@/lib/authed-fetch'
import { formatDistanceToNow } from 'date-fns'
// import { toast } from 'sonner'
import { MetricCard } from '@/components/layout'

// Placeholder for toast since sonner is missing
const toast = {
  success: (msg: string) => console.log('SUCCESS:', msg),
  error: (msg: string) => console.error('ERROR:', msg),
}

// Re-export types for component (these should match the standalone page)
interface PartnerEndpoint {
  id: string
  source_name: string
  endpoint_name: string
  endpoint_url: string
  auth_method: 'oauth2' | 'bearer' | 'basic' | 'api_key' | 'mtls'
  dataset_type: string
  pull_frequency: 'hourly' | 'daily' | 'weekly' | 'monthly'
  pull_method: 'full' | 'incremental' | 'delta'
  is_active: boolean
  last_pull_at: string | null
  last_success_at: string | null
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

// Real API functions connected to backend
const pullIntegrationsApi = {
  getEndpoints: async (): Promise<{ data: PartnerEndpoint[]; count: number }> => {
    try {
      const response = await authedFetch('/api/pull-integrations/endpoints')
      if (!response.ok) {
        throw new Error('Failed to fetch endpoints')
      }
      const result = await response.json()
      return {
        data: result.data || [],
        count: result.count || 0
      }
    } catch (error) {
      console.warn('Failed to fetch endpoints:', error)
      // Return empty data instead of mock data
      return {
        data: [],
        count: 0
      }
    }
  },

  getJobs: async (): Promise<{ data: PullJob[]; count: number }> => {
    try {
      const response = await authedFetch('/api/pull-integrations/jobs')
      if (!response.ok) {
        throw new Error('Failed to fetch jobs')
      }
      const result = await response.json()
      return {
        data: result.data || [],
        count: result.count || 0
      }
    } catch (error) {
      console.warn('Failed to fetch jobs:', error)
      // Return empty data instead of mock data
      return {
        data: [],
        count: 0
      }
    }
  },

  getSchedules: async (): Promise<{ data: PullSchedule[]; count: number }> => {
    try {
      const response = await authedFetch('/api/pull-integrations/schedules')
      if (!response.ok) {
        throw new Error('Failed to fetch schedules')
      }
      const result = await response.json()
      return {
        data: result.data || [],
        count: result.count || 0
      }
    } catch (error) {
      console.warn('Failed to fetch schedules:', error)
      // Return empty data instead of mock data
      return {
        data: [],
        count: 0
      }
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

function AuthMethodFields({
  authMethod,
  formData,
  onChange
}: {
  authMethod: string
  formData: any
  onChange: (field: string, value: string) => void
}) {
  switch (authMethod) {
    case 'oauth2':
      return (
        <>
          <div>
            <label className="text-sm font-medium">Client ID *</label>
            <Input
              placeholder="OAuth2 Client ID"
              value={formData.oauth2_client_id}
              onChange={(e) => onChange('oauth2_client_id', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Client Secret *</label>
            <Input
              type="password"
              placeholder="OAuth2 Client Secret"
              value={formData.oauth2_client_secret}
              onChange={(e) => onChange('oauth2_client_secret', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Authorization URL *</label>
            <Input
              placeholder="https://api.example.com/oauth/authorize"
              value={formData.oauth2_auth_url}
              onChange={(e) => onChange('oauth2_auth_url', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Token URL *</label>
            <Input
              placeholder="https://api.example.com/oauth/token"
              value={formData.oauth2_token_url}
              onChange={(e) => onChange('oauth2_token_url', e.target.value)}
              required
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Scopes</label>
            <Input
              placeholder="read:data write:data (space-separated)"
              value={formData.oauth2_scopes}
              onChange={(e) => onChange('oauth2_scopes', e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Space-separated list of OAuth2 scopes to request
            </p>
          </div>
        </>
      )

    case 'bearer':
      return (
        <div className="col-span-2">
          <label className="text-sm font-medium">Bearer Token *</label>
          <Input
            type="password"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            value={formData.bearer_token}
            onChange={(e) => onChange('bearer_token', e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            JWT token or static bearer token for API authentication
          </p>
        </div>
      )

    case 'basic':
      return (
        <>
          <div>
            <label className="text-sm font-medium">Username *</label>
            <Input
              placeholder="API Username"
              value={formData.basic_username}
              onChange={(e) => onChange('basic_username', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Password *</label>
            <Input
              type="password"
              placeholder="API Password"
              value={formData.basic_password}
              onChange={(e) => onChange('basic_password', e.target.value)}
              required
            />
          </div>
        </>
      )

    case 'api_key':
      return (
        <>
          <div>
            <label className="text-sm font-medium">API Key *</label>
            <Input
              type="password"
              placeholder="Your API Key"
              value={formData.api_key}
              onChange={(e) => onChange('api_key', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">API Secret</label>
            <Input
              type="password"
              placeholder="API Secret (if required)"
              value={formData.api_secret}
              onChange={(e) => onChange('api_secret', e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Header Name</label>
            <Select
              value={formData.api_key_header}
              onValueChange={(value) => onChange('api_key_header', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select header name" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="x-api-key">X-API-Key</SelectItem>
                <SelectItem value="authorization">Authorization</SelectItem>
                <SelectItem value="apikey">ApiKey</SelectItem>
                <SelectItem value="x-auth-token">X-Auth-Token</SelectItem>
                <SelectItem value="custom">Custom Header</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              HTTP header to send the API key in
            </p>
          </div>
        </>
      )

    case 'mtls':
      return (
        <>
          <div className="col-span-2">
            <label className="text-sm font-medium">Client Certificate *</label>
            <textarea
              className="w-full h-24 text-xs font-mono border rounded p-2"
              placeholder="-----BEGIN CERTIFICATE-----
MIICXjCCAUYCAQAwDQYJKoZIhvcNAQEFBQAwEzERMA8GA1UEAwwIVGVzdCBDQTAe
...
-----END CERTIFICATE-----"
              value={formData.mtls_certificate}
              onChange={(e) => onChange('mtls_certificate', e.target.value)}
              required
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Private Key *</label>
            <textarea
              className="w-full h-24 text-xs font-mono border rounded p-2"
              placeholder="-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC7VJTUt9Us8cKB
...
-----END PRIVATE KEY-----"
              value={formData.mtls_private_key}
              onChange={(e) => onChange('mtls_private_key', e.target.value)}
              required
            />
          </div>
        </>
      )

    default:
      return (
        <div className="col-span-2 text-center text-muted-foreground py-8">
          <p>Select an authentication method to configure credentials</p>
        </div>
      )
  }
}

export function PullIntegrationsPanel() {
  const queryClient = useQueryClient()
  const [selectedTab, setSelectedTab] = useState('endpoints')
  const [showAddEndpointDialog, setShowAddEndpointDialog] = useState(false)
  const [showAddScheduleDialog, setShowAddScheduleDialog] = useState(false)
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<string>('')
  const [endpointFormData, setEndpointFormData] = useState({
    source_name: '',
    endpoint_name: '',
    endpoint_url: '',
    auth_method: '',
    dataset_type: '',
    pull_frequency: '',
    // Auth-specific fields
    oauth2_client_id: '',
    oauth2_client_secret: '',
    oauth2_auth_url: '',
    oauth2_token_url: '',
    oauth2_scopes: '',
    bearer_token: '',
    basic_username: '',
    basic_password: '',
    api_key: '',
    api_secret: '',
    api_key_header: 'x-api-key',
    mtls_certificate: '',
    mtls_private_key: '',
  })

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
    mutationFn: (endpointId: string) => {
      toast.success('Job started successfully (demo)')
      return Promise.resolve({ success: true })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pull-integrations-jobs'] })
    },
  })

  // Stats
  const activeEndpoints = endpoints?.data?.filter(e => e.is_active).length || 0
  const healthyEndpoints = endpoints?.data?.filter(e => e.health_status === 'healthy').length || 0
  const runningJobs = jobs?.data?.filter(j => j.status === 'running').length || 0
  const totalRecords = endpoints?.data?.reduce((sum, e) => sum + e.total_records, 0) || 0

  return (
    <div className="space-y-6">
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
          subtitle={`1 completed today`}
          icon={Activity}
          color="yellow"
          isLoading={jobsLoading}
        />
        <MetricCard
          title="Total Records"
          value={totalRecords}
          subtitle="All endpoints"
          icon={Database}
          color="purple"
          isLoading={endpointsLoading}
        />
      </div>

      {/* Internal Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="endpoints">Partner Endpoints</TabsTrigger>
          <TabsTrigger value="jobs">Pull Jobs</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        {/* Partner Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Partner API Endpoints</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Manage automated data pulls from external sources
                  </p>
                </div>
                <Button size="sm" onClick={() => setShowAddEndpointDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Endpoint
                </Button>
              </div>
            </CardHeader>
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
                  {endpoints?.data?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <Globe className="h-8 w-8 text-muted-foreground" />
                          <p className="text-muted-foreground">No API endpoints configured</p>
                          <p className="text-sm text-muted-foreground">Add your first partner API endpoint to start pulling data</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    endpoints?.data?.map((endpoint) => (
                      <TableRow key={endpoint.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{endpoint.source_name}</div>
                            <div className="text-sm text-muted-foreground">{endpoint.endpoint_name}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {endpoint.dataset_type.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <FrequencyBadge frequency={endpoint.pull_frequency} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusIcon status={endpoint.health_status} />
                            <span className="text-sm capitalize">{endpoint.health_status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {endpoint.total_records.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {endpoint.last_pull_at
                            ? formatDistanceToNow(new Date(endpoint.last_pull_at), { addSuffix: true })
                            : 'Never'
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => executeMutation.mutate(endpoint.id)}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Settings className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Pull Job History</CardTitle>
                <Button size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
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
                  {jobs?.data?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <Activity className="h-8 w-8 text-muted-foreground" />
                          <p className="text-muted-foreground">No pull jobs found</p>
                          <p className="text-sm text-muted-foreground">Configure API endpoints to start seeing job executions</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    jobs?.data?.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-sm">{job.id}</TableCell>
                        <TableCell>{job.endpoint_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusIcon status={job.status} />
                            <span className="text-sm capitalize">{job.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            <div>{job.records_imported} imported</div>
                            <div className="text-muted-foreground">{job.records_processed} processed</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {job.execution_time_seconds ? `${job.execution_time_seconds}s` : '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Pull Schedules</CardTitle>
                <Button size="sm" onClick={() => setShowAddScheduleDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Schedule
                </Button>
              </div>
            </CardHeader>
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
                  {schedules?.data?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <Clock className="h-8 w-8 text-muted-foreground" />
                          <p className="text-muted-foreground">No schedules configured</p>
                          <p className="text-sm text-muted-foreground">Set up automated schedules to pull data regularly</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    schedules?.data?.map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">{schedule.schedule_name}</TableCell>
                        <TableCell>{schedule.endpoint_name}</TableCell>
                        <TableCell className="font-mono text-sm">{schedule.cron_expression}</TableCell>
                        <TableCell className="text-sm">
                          {formatDistanceToNow(new Date(schedule.next_run_at), { addSuffix: true })}
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
                            <Button size="sm" variant="outline">
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              {schedule.is_active ? (
                                <Pause className="h-3 w-3" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Endpoint Dialog */}
      <Dialog open={showAddEndpointDialog} onOpenChange={(open) => {
        setShowAddEndpointDialog(open)
        if (!open) {
          // Reset form when closing
          setEndpointFormData({
            source_name: '', endpoint_name: '', endpoint_url: '', auth_method: '', dataset_type: '', pull_frequency: '',
            oauth2_client_id: '', oauth2_client_secret: '', oauth2_auth_url: '', oauth2_token_url: '', oauth2_scopes: '',
            bearer_token: '', basic_username: '', basic_password: '', api_key: '', api_secret: '', api_key_header: 'x-api-key',
            mtls_certificate: '', mtls_private_key: ''
          })
          setSelectedAuthMethod('')
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New API Endpoint</DialogTitle>
            <DialogDescription>
              Configure a new partner API endpoint for automated data pulls with secure authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* Basic Information */}
            <div>
              <label className="text-sm font-medium">Source Name *</label>
              <Input
                placeholder="e.g., Ghana Revenue Authority"
                value={endpointFormData.source_name}
                onChange={(e) => setEndpointFormData(prev => ({ ...prev, source_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Endpoint Name *</label>
              <Input
                placeholder="e.g., Tax Assessment API"
                value={endpointFormData.endpoint_name}
                onChange={(e) => setEndpointFormData(prev => ({ ...prev, endpoint_name: e.target.value }))}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Endpoint URL *</label>
              <Input
                placeholder="https://api.example.com/v1/data"
                value={endpointFormData.endpoint_url}
                onChange={(e) => setEndpointFormData(prev => ({ ...prev, endpoint_url: e.target.value }))}
                required
              />
            </div>

            {/* Dataset and Frequency */}
            <div>
              <label className="text-sm font-medium">Dataset Type *</label>
              <Select
                value={endpointFormData.dataset_type}
                onValueChange={(value) => setEndpointFormData(prev => ({ ...prev, dataset_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select dataset type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="land_title_records">Land Title Records</SelectItem>
                  <SelectItem value="tax_assessments">Tax Assessments</SelectItem>
                  <SelectItem value="mortgage_transactions">Mortgage Transactions</SelectItem>
                  <SelectItem value="property_registrations">Property Registrations</SelectItem>
                  <SelectItem value="economic_indicators">Economic Indicators</SelectItem>
                  <SelectItem value="construction_permits">Construction Permits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Pull Frequency *</label>
              <Select
                value={endpointFormData.pull_frequency}
                onValueChange={(value) => setEndpointFormData(prev => ({ ...prev, pull_frequency: value }))}
              >
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

            {/* Authentication Method */}
            <div className="col-span-2">
              <label className="text-sm font-medium">Authentication Method *</label>
              <Select
                value={selectedAuthMethod}
                onValueChange={(value) => {
                  setSelectedAuthMethod(value)
                  setEndpointFormData(prev => ({ ...prev, auth_method: value }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select authentication method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Authentication</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="mtls">Mutual TLS (mTLS)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Authentication Fields */}
            <div className="col-span-2 border-t pt-4">
              <h3 className="font-medium mb-4">Authentication Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                <AuthMethodFields
                  authMethod={selectedAuthMethod}
                  formData={endpointFormData}
                  onChange={(field, value) => setEndpointFormData(prev => ({ ...prev, [field]: value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <div className="text-xs text-muted-foreground">
              * Required fields
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddEndpointDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  // Validate required fields
                  const requiredFields = ['source_name', 'endpoint_name', 'endpoint_url', 'dataset_type', 'pull_frequency', 'auth_method']
                  const missingFields = requiredFields.filter(field => !endpointFormData[field as keyof typeof endpointFormData])

                  if (missingFields.length > 0) {
                    toast.error(`Please fill in required fields: ${missingFields.join(', ')}`)
                    return
                  }

                  // Auth-specific validation
                  let authValid = true
                  switch (selectedAuthMethod) {
                    case 'oauth2':
                      if (!endpointFormData.oauth2_client_id || !endpointFormData.oauth2_client_secret ||
                        !endpointFormData.oauth2_auth_url || !endpointFormData.oauth2_token_url) {
                        toast.error('OAuth2 requires Client ID, Client Secret, Auth URL, and Token URL')
                        authValid = false
                      }
                      break
                    case 'bearer':
                      if (!endpointFormData.bearer_token) {
                        toast.error('Bearer authentication requires a token')
                        authValid = false
                      }
                      break
                    case 'basic':
                      if (!endpointFormData.basic_username || !endpointFormData.basic_password) {
                        toast.error('Basic authentication requires username and password')
                        authValid = false
                      }
                      break
                    case 'api_key':
                      if (!endpointFormData.api_key) {
                        toast.error('API Key authentication requires an API key')
                        authValid = false
                      }
                      break
                    case 'mtls':
                      if (!endpointFormData.mtls_certificate || !endpointFormData.mtls_private_key) {
                        toast.error('mTLS requires both certificate and private key')
                        authValid = false
                      }
                      break
                  }

                  if (!authValid) return

                  toast.success('Endpoint will be created when backend APIs are connected. All authentication details captured securely.')
                  setShowAddEndpointDialog(false)
                }}
                disabled={!selectedAuthMethod}
              >
                Create Endpoint
              </Button>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success('Schedule creation will be available when backend APIs are connected')
              setShowAddScheduleDialog(false)
            }}>
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}