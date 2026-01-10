'use client'

import { Header } from '@/components/layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  Settings,
  Database,
  Bell,
  Shield,
  Zap,
  Globe,
  Save,
  RefreshCw,
  Key,
  Server,
  Clock,
} from 'lucide-react'
import { useState } from 'react'

export default function SettingsPage() {
  const [saving, setSaving] = useState(false)

  const handleSave = () => {
    setSaving(true)
    setTimeout(() => setSaving(false), 1000)
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" description="Configure Data Hub settings" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          <Tabs defaultValue="general" className="space-y-4">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="sources">Data Sources</TabsTrigger>
              <TabsTrigger value="etl">ETL Pipeline</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="api">API Keys</TabsTrigger>
            </TabsList>

            {/* General Settings */}
            <TabsContent value="general" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    General Settings
                  </CardTitle>
                  <CardDescription>
                    Basic configuration for the Data Hub
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Default Region</label>
                      <Select defaultValue="greater_accra">
                        <SelectTrigger>
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="greater_accra">Greater Accra</SelectItem>
                          <SelectItem value="ashanti">Ashanti</SelectItem>
                          <SelectItem value="western">Western</SelectItem>
                          <SelectItem value="eastern">Eastern</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Currency</label>
                      <Select defaultValue="ghs">
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ghs">GHS (Ghana Cedis)</SelectItem>
                          <SelectItem value="usd">USD (US Dollar)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Timezone</label>
                      <Select defaultValue="gmt">
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gmt">GMT (Accra)</SelectItem>
                          <SelectItem value="utc">UTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Data Refresh Interval</label>
                      <Select defaultValue="5">
                        <SelectTrigger>
                          <SelectValue placeholder="Select interval" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 seconds</SelectItem>
                          <SelectItem value="10">10 seconds</SelectItem>
                          <SelectItem value="30">30 seconds</SelectItem>
                          <SelectItem value="60">1 minute</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Backend Connection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Base URL</label>
                    <Input defaultValue="http://localhost:4000/api/v1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" className="gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                      Connected
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Last ping: 23ms
                    </span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Data Sources Settings */}
            <TabsContent value="sources" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Data Source Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">Auto-sync enabled sources</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically sync active sources on schedule
                        </p>
                      </div>
                      <Button variant="outline">Enabled</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">Retry failed syncs</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically retry failed sync jobs
                        </p>
                      </div>
                      <Select defaultValue="3">
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 retry</SelectItem>
                          <SelectItem value="3">3 retries</SelectItem>
                          <SelectItem value="5">5 retries</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">Sync batch size</p>
                        <p className="text-sm text-muted-foreground">
                          Number of records per batch
                        </p>
                      </div>
                      <Input className="w-32" defaultValue="1000" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ETL Settings */}
            <TabsContent value="etl" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    ETL Pipeline Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max concurrent jobs</label>
                      <Input type="number" defaultValue="5" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Job timeout (minutes)</label>
                      <Input type="number" defaultValue="60" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Deduplication threshold</label>
                      <Select defaultValue="0.9">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0.8">80% similarity</SelectItem>
                          <SelectItem value="0.9">90% similarity</SelectItem>
                          <SelectItem value="0.95">95% similarity</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Quality score minimum</label>
                      <Input type="number" defaultValue="0.7" step="0.1" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Schedule Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { name: 'Full ETL', schedule: '0 2 * * *', next: '2:00 AM' },
                      { name: 'Incremental Sync', schedule: '*/30 * * * *', next: 'Every 30 min' },
                      { name: 'Data Validation', schedule: '0 */6 * * *', next: 'Every 6 hours' },
                      { name: 'Deduplication', schedule: '0 4 * * 0', next: 'Sunday 4 AM' },
                    ].map((job) => (
                      <div key={job.name} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium">{job.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{job.schedule}</p>
                        </div>
                        <Badge variant="outline">{job.next}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notification Settings */}
            <TabsContent value="notifications" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { name: 'Job failures', description: 'Get notified when ETL jobs fail', enabled: true },
                    { name: 'Sync completion', description: 'Notify when data sync completes', enabled: true },
                    { name: 'Low quality alerts', description: 'Alert when data quality drops below threshold', enabled: true },
                    { name: 'New contributions', description: 'Notify of new user contributions', enabled: false },
                    { name: 'System warnings', description: 'System health and performance alerts', enabled: true },
                  ].map((pref) => (
                    <div key={pref.name} className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">{pref.name}</p>
                        <p className="text-sm text-muted-foreground">{pref.description}</p>
                      </div>
                      <Button variant={pref.enabled ? 'default' : 'outline'} size="sm">
                        {pref.enabled ? 'Enabled' : 'Disabled'}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* API Keys */}
            <TabsContent value="api" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    API Keys
                  </CardTitle>
                  <CardDescription>
                    Manage API keys for external services
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { name: 'Lands Commission API', status: 'configured', lastUsed: '2 hours ago' },
                    { name: 'Bank of Ghana API', status: 'configured', lastUsed: '1 day ago' },
                    { name: 'Google Geocoding', status: 'configured', lastUsed: '5 min ago' },
                    { name: 'SendGrid Email', status: 'configured', lastUsed: '30 min ago' },
                    { name: 'Twilio SMS', status: 'not_configured', lastUsed: 'Never' },
                  ].map((key) => (
                    <div key={key.name} className="flex items-center justify-between p-4 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Shield className={key.status === 'configured' ? 'text-green-400' : 'text-muted-foreground'} />
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-xs text-muted-foreground">Last used: {key.lastUsed}</p>
                        </div>
                      </div>
                      <Badge variant={key.status === 'configured' ? 'success' : 'secondary'}>
                        {key.status === 'configured' ? 'Configured' : 'Not configured'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
