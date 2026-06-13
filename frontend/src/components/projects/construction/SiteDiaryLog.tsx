import React, { useState } from 'react'
import { 
  CloudSun, 
  Users, 
  ClipboardType, 
  AlertTriangle,
  Loader2,
  Check
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { constructionApi } from '@/lib/projects-api'
import { toast } from 'sonner'

interface SiteDiaryLogProps {
  projectId: string
}

export function SiteDiaryLog({ projectId }: SiteDiaryLogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    reportDate: new Date().toISOString().split('T')[0],
    weatherCondition: 'sunny',
    informalLaborCount: '',
    informalLaborNotes: '',
    workPerformed: '',
    incidentsOrDelays: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await constructionApi.logSiteDiary(projectId, {
        ...formData,
        informalLaborCount: parseInt(formData.informalLaborCount) || 0,
      })
      toast.success('Site diary logged successfully', {
        description: 'Project Manager has been notified via WhatsApp'
      })
      // Reset sensitive fields
      setFormData(prev => ({
        ...prev,
        workPerformed: '',
        incidentsOrDelays: '',
        informalLaborCount: '',
        informalLaborNotes: ''
      }))
    } catch (error) {
      console.error(error)
      toast.error('Failed to log site diary')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardType className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-foreground">Daily Site Diary</CardTitle>
        </div>
        <CardDescription className="text-muted-foreground">
          Essential daily reporting. Triggers WhatsApp summary to PM.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Date & Weather Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">Date</Label>
              <Input
                type="date"
                value={formData.reportDate}
                onChange={e => setFormData({...formData, reportDate: e.target.value})}
                className="bg-muted border-border font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">Weather</Label>
              <Select
                value={formData.weatherCondition}
                onValueChange={v => setFormData({...formData, weatherCondition: v})}
              >
                <SelectTrigger className="bg-muted border-border font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sunny">Sunny</SelectItem>
                  <SelectItem value="cloudy">Cloudy</SelectItem>
                  <SelectItem value="rainy">Rainy</SelectItem>
                  <SelectItem value="harmattan">Harmattan</SelectItem>
                  <SelectItem value="thunderstorm">Stormy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Informal Labor Section */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
               <Users className="h-4 w-4 text-emerald-500" />
               <span className="text-sm font-medium text-foreground">Informal Labor Tracking</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-2">
                 <Label className="text-muted-foreground font-mono text-xs">Count *</Label>
                 <Input
                   type="number"
                   placeholder="0"
                   value={formData.informalLaborCount}
                   onChange={e => setFormData({...formData, informalLaborCount: e.target.value})}
                   className="bg-muted border-border font-mono text-sm"
                   required
                 />
              </div>
              <div className="col-span-2 space-y-2">
                 <Label className="text-muted-foreground font-mono text-xs">Labor Notes</Label>
                 <Input
                   placeholder="e.g. 5 Laborers, 2 Masons"
                   value={formData.informalLaborNotes}
                   onChange={e => setFormData({...formData, informalLaborNotes: e.target.value})}
                   className="bg-muted border-border font-mono text-sm"
                 />
              </div>
            </div>
          </div>

          {/* Progress & Issues */}
          <div className="space-y-2">
            <Label className="text-muted-foreground font-mono text-xs">Work Performed</Label>
            <Textarea
              placeholder="What was achieved today?"
              className="bg-muted border-border font-mono text-sm h-20"
              value={formData.workPerformed}
              onChange={e => setFormData({...formData, workPerformed: e.target.value})}
            />
          </div>

          <div className="space-y-2 pb-2">
            <Label className="text-muted-foreground font-mono text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Incidents or Delays
            </Label>
            <Textarea
              placeholder="Any accidents, material shortages, or disputes?"
              className="bg-muted border-border font-mono text-sm h-16"
              value={formData.incidentsOrDelays}
              onChange={e => setFormData({...formData, incidentsOrDelays: e.target.value})}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-amber-600 hover:bg-amber-700 text-foreground font-semibold font-mono"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Submit Daily Log
          </Button>

        </form>
      </CardContent>
    </Card>
  )
}
