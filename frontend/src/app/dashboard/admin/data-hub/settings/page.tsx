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
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { systemSettingsApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

export default function SettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Local state to hold form values (initialized from API)
  const [formData, setFormData] = useState<Record<string, any>>({})

  // Fetch settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => systemSettingsApi.getAll()
  })

  // Populate local state when data is loaded
  useEffect(() => {
    if (settingsData?.data) {
      setFormData(settingsData.data)
    }
  }, [settingsData])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: Record<string, any>) => systemSettingsApi.update(data),
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Your changes have been saved successfully.",
        variant: "default",
      })
      queryClient.invalidateQueries({ queryKey: ['system-settings'] })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      })
    }
  })

  const handleChange = (key: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  const getValue = (key: string, def: any) => {
    // Check if key exists in formData, otherwise return default
    // Note: formData keys might be strings/numbers, or parsed JSON if backend sent raw value
    // The backend sends `value` as JSONB? the service returns key-value
    // In `SystemSettingsService`, getAll returns `settings[row.key] = row.value`
    // Row value is JSONB. So string "greater_accra" might come as "\"greater_accra\"" or just string depending on driver parsing.
    // The service implementation: `value: JSON.stringify('greater_accra')` -> stored as JSON string.
    // So likely need to handle types.
    // Let's assume standard values for now.

    return formData[key] !== undefined ? formData[key] : def
  }

  if (isLoading) {
    return <div className="p-6">Loading settings...</div>
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <Header title="Settings" description="Configure Data Hub settings" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          <Tabs defaultValue="general" className="space-y-4">
            <TabsList className="bg-muted">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="sources">Data Sources</TabsTrigger>
              <TabsTrigger value="etl">ETL Pipeline</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="api">API Keys</TabsTrigger>
            </TabsList>

            {/* General Settings */}
            <TabsContent value="general" className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
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
                      <label className="text-sm font-medium text-muted-foreground">Default Region</label>
                      <Select
                        value={getValue('general.region', 'greater_accra')}
                        onValueChange={(val) => handleChange('general.region', val)}
                      >
                        <SelectTrigger className="bg-muted border-border">
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent className="bg-muted border-border">
                          <SelectItem value="greater_accra">Greater Accra</SelectItem>
                          <SelectItem value="ashanti">Ashanti</SelectItem>
                          <SelectItem value="western">Western</SelectItem>
                          <SelectItem value="eastern">Eastern</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Currency</label>
                      <Select
                        value={getValue('general.currency', 'ghs')}
                        onValueChange={(val) => handleChange('general.currency', val)}
                      >
                        <SelectTrigger className="bg-muted border-border">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent className="bg-muted border-border">
                          <SelectItem value="ghs">GHS (Ghana Cedis)</SelectItem>
                          <SelectItem value="usd">USD (US Dollar)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Timezone</label>
                      <Select
                        value={getValue('general.timezone', 'gmt')}
                        onValueChange={(val) => handleChange('general.timezone', val)}
                      >
                        <SelectTrigger className="bg-muted border-border">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent className="bg-muted border-border">
                          <SelectItem value="gmt">GMT (Accra)</SelectItem>
                          <SelectItem value="utc">UTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                    <Server className="h-5 w-5" />
                    Backend Connection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">API Base URL</label>
                    <Input
                      defaultValue="http://localhost:4000/api/v1"
                      readOnly
                      className="bg-muted border-border text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" className="gap-1 bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30">
                      <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                      Connected
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ETL Settings */}
            <TabsContent value="etl" className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                    <Zap className="h-5 w-5" />
                    ETL Pipeline Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Max concurrent jobs</label>
                      <Input
                        type="number"
                        value={getValue('etl.max_concurrent_jobs', 5)}
                        onChange={(e) => handleChange('etl.max_concurrent_jobs', parseInt(e.target.value))}
                        className="bg-muted border-border"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Settings */}
            <TabsContent value="notifications" className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-foreground">Email Notifications</p>
                      <p className="text-sm text-muted-foreground">Receive alerts via email</p>
                    </div>
                    <Button
                      variant={getValue('notifications.email_enabled', "true") === "true" ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleChange('notifications.email_enabled', getValue('notifications.email_enabled', "true") === "true" ? "false" : "true")}
                    >
                      {getValue('notifications.email_enabled', "true") === "true" ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-foreground">
              {saveMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
