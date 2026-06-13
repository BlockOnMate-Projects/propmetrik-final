'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { esignConfigApi, PmEsignConfig } from '@/lib/projects-api'
import { Loader2, PenLine } from 'lucide-react'

const DOC_META: Record<PmEsignConfig['doc_type'], { title: string; desc: string; hasAmount: boolean; autoLabel?: string }> = {
  change_order: { title: 'Change Orders', desc: 'Multi-party signatures on change orders', hasAmount: true, autoLabel: 'Auto-execute when fully signed' },
  draw_request: { title: 'Draw Requests', desc: 'Owner / GC / lender signatures on funding draws', hasAmount: true, autoLabel: 'Auto-fund when fully signed' },
  contractor_contract: { title: 'Contractor Agreements', desc: 'Owner & contractor signatures on agreements', hasAmount: false },
}

export function EsignSettingsManager() {
  const { toast } = useToast()
  const [configs, setConfigs] = useState<PmEsignConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await esignConfigApi.getAll()
      setConfigs(res.data || [])
    } catch {
      toast({ title: 'Failed to load e-sign settings', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const patch = (type: string, changes: Partial<PmEsignConfig>) =>
    setConfigs(prev => prev.map(c => (c.doc_type === type ? { ...c, ...changes } : c)))

  const save = async (cfg: PmEsignConfig) => {
    setSavingType(cfg.doc_type)
    try {
      await esignConfigApi.save({
        doc_type: cfg.doc_type,
        enabled: cfg.enabled,
        min_amount_threshold: cfg.min_amount_threshold,
        signer_roles: cfg.signer_roles,
        auto_action: cfg.auto_action,
      })
      toast({ title: `${DOC_META[cfg.doc_type].title} e-sign settings saved` })
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setSavingType(null)
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm font-mono py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading e-sign settings…</div>
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-mono text-muted-foreground">
        Enable e-signature per document type. When enabled, documents are sent for signature automatically on approval.
        The manual “Request E-Signature” button always works regardless of these settings.
      </p>
      {configs.map(cfg => {
        const meta = DOC_META[cfg.doc_type]
        return (
          <Card key={cfg.doc_type} className="bg-card/80 border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-amber-500" />
                  <div>
                    <CardTitle className="text-sm font-mono text-foreground">{meta.title}</CardTitle>
                    <CardDescription className="text-[10px] font-mono text-muted-foreground">{meta.desc}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-mono text-muted-foreground">Auto-send on approval</Label>
                  <Switch checked={cfg.enabled} onCheckedChange={(v) => patch(cfg.doc_type, { enabled: v })} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">Signer roles (in signing order, comma-separated)</Label>
                <Input
                  value={cfg.signer_roles.join(', ')}
                  onChange={(e) => patch(cfg.doc_type, { signer_roles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  className="bg-background border-border font-mono text-xs mt-1"
                  placeholder="project_manager, owner_representative, contractor"
                />
              </div>
              {meta.hasAmount && (
                <div>
                  <Label className="text-[10px] font-mono text-muted-foreground">Minimum amount threshold (only require e-sign above this)</Label>
                  <Input
                    type="number"
                    value={cfg.min_amount_threshold}
                    onChange={(e) => patch(cfg.doc_type, { min_amount_threshold: Number(e.target.value) || 0 })}
                    className="bg-background border-border font-mono text-xs mt-1"
                  />
                </div>
              )}
              {meta.autoLabel && (
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-mono text-muted-foreground">{meta.autoLabel}</Label>
                  <Switch checked={cfg.auto_action} onCheckedChange={(v) => patch(cfg.doc_type, { auto_action: v })} />
                </div>
              )}
              <div className="flex justify-end pt-1">
                <Button onClick={() => save(cfg)} disabled={savingType === cfg.doc_type} className="bg-amber-500 hover:bg-amber-600 text-foreground font-mono text-xs">
                  {savingType === cfg.doc_type ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
