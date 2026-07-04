'use client';

import { ConnectEmailBanner } from '@/components/communications/ConnectEmailBanner';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Mail,
  MailOpen,
  MousePointerClick,
  Plus,
  Play,
  Pause,
  Trash2,
  Users,
  UserPlus,
  Target,
  Clock,
  ChevronRight,
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useDripCampaigns,
  useDripCampaign,
  useDripEnrollments,
  useDripSends,
  useCreateDripCampaign,
  useUpdateDripCampaign,
  useDeleteDripCampaign,
  useAddDripStep,
  useDeleteDripStep,
  useAddDripStepVariant,
  useDeleteDripStepVariant,
} from '@/hooks/crm/use-drip-campaigns';
import { segmentsApi, type DripCampaign, type DripCampaignStep, type CampaignSegment, type SegmentFilter } from '@/lib/crm-api';
import { toast } from 'sonner';

export default function DripCampaignsPage() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);

  // Form state
  const [newCampaign, setNewCampaign] = useState({ name: '', description: '', trigger_type: 'manual' });
  const [newStep, setNewStep] = useState({ subject: '', body: '', delay_days: 1 });

  const { data: campaigns, isLoading } = useDripCampaigns();
  const { data: selectedCampaign } = useDripCampaign(selectedCampaignId || '');
  const { data: enrollments } = useDripEnrollments(selectedCampaignId || '');
  const { data: sends } = useDripSends(selectedCampaignId || '');

  const createMutation = useCreateDripCampaign();
  const updateMutation = useUpdateDripCampaign();
  const deleteMutation = useDeleteDripCampaign();
  const addStepMutation = useAddDripStep();
  const deleteStepMutation = useDeleteDripStep();
  const addVariantMutation = useAddDripStepVariant();
  const deleteVariantMutation = useDeleteDripStepVariant();

  // ── A/B variants ─────────────────────────────────────
  const [variantStepId, setVariantStepId] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({ label: 'B', subject: '', body: '', weight: 1 });

  const handleAddVariant = async () => {
    if (!selectedCampaignId || !variantStepId || !variantForm.subject.trim() || !variantForm.body.trim()) return;
    try {
      await addVariantMutation.mutateAsync({ campaignId: selectedCampaignId, stepId: variantStepId, data: variantForm });
      setVariantForm({ label: 'B', subject: '', body: '', weight: 1 });
      setVariantStepId(null);
    } catch (e: any) { toast.error(e?.message || 'Failed to add variant'); }
  };

  // Per-step, per-variant engagement (variant_id null = control "A").
  const variantStats = useMemo(() => {
    const m: Record<string, Record<string, { sent: number; opened: number; clicked: number }>> = {};
    for (const s of sends || []) {
      const key = s.variant_id || 'control';
      (m[s.step_id] ??= {})[key] ??= { sent: 0, opened: 0, clicked: 0 };
      const g = m[s.step_id][key];
      if (s.status === 'sent') g.sent++;
      if ((s.open_count || 0) > 0) g.opened++;
      if ((s.click_count || 0) > 0) g.clicked++;
    }
    return m;
  }, [sends]);

  // ── Segments (audience) ──────────────────────────────
  const [segments, setSegments] = useState<CampaignSegment[]>([]);
  const [showSegDialog, setShowSegDialog] = useState(false);
  const [segForm, setSegForm] = useState({ name: '', lead_status: '', region: '', tags: '', city: '' });
  const [segPreview, setSegPreview] = useState<number | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const loadSegments = useCallback(() => {
    segmentsApi.getAll().then(setSegments).catch(() => setSegments([]));
  }, []);
  useEffect(() => { if (selectedCampaignId) loadSegments(); }, [selectedCampaignId, loadSegments]);

  const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const buildFilter = (): SegmentFilter => ({
    lead_status: segForm.lead_status ? csv(segForm.lead_status) : undefined,
    region: segForm.region ? csv(segForm.region) : undefined,
    tags: segForm.tags ? csv(segForm.tags) : undefined,
    city: segForm.city.trim() || undefined,
  });

  const previewSegment = async () => {
    try { setSegPreview((await segmentsApi.preview(buildFilter())).count); }
    catch (e: any) { toast.error(e?.message || 'Preview failed'); }
  };
  const createSegment = async () => {
    if (!segForm.name.trim()) { toast.error('Segment name is required'); return; }
    try {
      await segmentsApi.create({ name: segForm.name.trim(), filter: buildFilter() });
      toast.success('Segment created');
      setShowSegDialog(false);
      setSegForm({ name: '', lead_status: '', region: '', tags: '', city: '' });
      setSegPreview(null);
      loadSegments();
    } catch (e: any) { toast.error(e?.message || 'Failed to create segment'); }
  };
  const enrollSegment = async (segmentId: string) => {
    if (!selectedCampaignId) return;
    setEnrollingId(segmentId);
    try {
      const r = await segmentsApi.enroll(segmentId, selectedCampaignId);
      toast.success(`Enrolled ${r.enrolled} new contact${r.enrolled === 1 ? '' : 's'} (${r.matched} matched)`);
    } catch (e: any) { toast.error(e?.message || 'Enrollment failed'); }
    finally { setEnrollingId(null); }
  };

  // ── Engagement (open/click) from the send ledger ─────
  const engagement = useMemo(() => {
    const list = sends || [];
    const sent = list.filter((s) => s.status === 'sent').length;
    const opened = list.filter((s) => (s.open_count || 0) > 0).length;
    const clicked = list.filter((s) => (s.click_count || 0) > 0).length;
    return {
      sent, opened, clicked,
      openRate: sent ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent ? Math.round((clicked / sent) * 100) : 0,
    };
  }, [sends]);

  const handleCreate = async () => {
    if (!newCampaign.name.trim()) return;
    await createMutation.mutateAsync(newCampaign);
    setNewCampaign({ name: '', description: '', trigger_type: 'manual' });
    setShowCreateDialog(false);
  };

  const handleToggleActive = async (campaign: DripCampaign) => {
    await updateMutation.mutateAsync({
      id: campaign.id,
      data: { is_active: !campaign.is_active },
    });
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setShowDeleteDialog(null);
    if (selectedCampaignId === id) setSelectedCampaignId(null);
  };

  const handleAddStep = async () => {
    if (!selectedCampaignId || !newStep.subject.trim() || !newStep.body.trim()) return;
    const stepCount = selectedCampaign?.steps?.length || 0;
    await addStepMutation.mutateAsync({
      campaignId: selectedCampaignId,
      data: { ...newStep, step_order: stepCount + 1 },
    });
    setNewStep({ subject: '', body: '', delay_days: 1 });
    setShowStepDialog(false);
  };

  // Campaign detail view
  if (selectedCampaignId && selectedCampaign) {
    return (
      <div className="p-6 space-y-6">
        <ConnectEmailBanner noun="Drip campaigns" />
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedCampaignId(null)}
            className="text-muted-foreground hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-100 font-mono">{selectedCampaign.name}</h1>
            {selectedCampaign.description && (
              <p className="text-sm text-muted-foreground mt-1">{selectedCampaign.description}</p>
            )}
          </div>
          <Badge variant={selectedCampaign.is_active ? 'default' : 'secondary'}>
            {selectedCampaign.is_active ? 'Active' : 'Paused'}
          </Badge>
          <Button
            size="sm"
            variant={selectedCampaign.is_active ? 'outline' : 'default'}
            onClick={() => handleToggleActive(selectedCampaign)}
            disabled={updateMutation.isPending}
          >
            {selectedCampaign.is_active ? (
              <><Pause className="h-3 w-3 mr-1" /> Pause</>
            ) : (
              <><Play className="h-3 w-3 mr-1" /> Activate</>
            )}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Mail className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground uppercase">Steps</p>
                <p className="text-lg font-bold text-zinc-100">{selectedCampaign.steps?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground uppercase">Enrolled</p>
                <p className="text-lg font-bold text-zinc-100">{selectedCampaign.enrollment_count}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground uppercase">Trigger</p>
                <p className="text-lg font-bold text-zinc-100 capitalize">{selectedCampaign.trigger_type}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Engagement (open/click) — from the tracking-enabled send ledger */}
        {engagement.sent > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <Send className="h-5 w-5 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground uppercase">Sent</p><p className="text-lg font-bold text-zinc-100">{engagement.sent}</p></div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <MailOpen className="h-5 w-5 text-blue-500" />
                <div><p className="text-xs text-muted-foreground uppercase">Opened</p><p className="text-lg font-bold text-zinc-100">{engagement.opened} <span className="text-sm text-muted-foreground">({engagement.openRate}%)</span></p></div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <MousePointerClick className="h-5 w-5 text-emerald-500" />
                <div><p className="text-xs text-muted-foreground uppercase">Clicked</p><p className="text-lg font-bold text-zinc-100">{engagement.clicked} <span className="text-sm text-muted-foreground">({engagement.clickRate}%)</span></p></div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Email Sequence Timeline */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-mono text-muted-foreground">Email Sequence</CardTitle>
            <Button size="sm" onClick={() => setShowStepDialog(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Step
            </Button>
          </CardHeader>
          <CardContent>
            {selectedCampaign.steps && selectedCampaign.steps.length > 0 ? (
              <div className="space-y-3">
                {selectedCampaign.steps.map((step, idx) => (
                  <div key={step.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border/50">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 text-xs font-bold">
                        {idx + 1}
                      </div>
                      {idx < (selectedCampaign.steps?.length || 0) - 1 && (
                        <div className="w-0.5 h-6 bg-zinc-700 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-zinc-200 truncate">{step.subject}</span>
                        <Badge variant="outline" className="text-[10px]">Day {step.delay_days}</Badge>
                        {step.variants && step.variants.length > 0 && (
                          <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">
                            <FlaskConical className="h-3 w-3 mr-0.5" /> A/B ×{step.variants.length + 1}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{step.body}</p>

                      {step.variants && step.variants.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Badge variant="outline" className="text-[9px] px-1 py-0">A · control</Badge>
                            <span className="truncate flex-1">{step.subject}</span>
                            {variantStats[step.id]?.['control'] && (
                              <span>{variantStats[step.id]['control'].sent} sent · {variantStats[step.id]['control'].opened} open · {variantStats[step.id]['control'].clicked} click</span>
                            )}
                          </div>
                          {step.variants.map((v) => {
                            const vs = variantStats[step.id]?.[v.id];
                            return (
                              <div key={v.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-violet-400 border-violet-500/30">{v.label} · w{v.weight}</Badge>
                                <span className="truncate flex-1">{v.subject}</span>
                                {vs && <span>{vs.sent} sent · {vs.opened} open · {vs.clicked} click</span>}
                                <button className="text-muted-foreground hover:text-red-400" title="Remove variant"
                                  onClick={() => deleteVariantMutation.mutate({ campaignId: selectedCampaignId, stepId: step.id, variantId: v.id })}>
                                  <XCircle className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-violet-400 h-7 w-7 p-0" title="Add A/B variant"
                        onClick={() => { setVariantForm({ label: 'B', subject: '', body: '', weight: 1 }); setVariantStepId(step.id); }}>
                        <FlaskConical className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-400 h-7 w-7 p-0"
                        onClick={() => deleteStepMutation.mutate({ campaignId: selectedCampaignId, stepId: step.id })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No email steps yet. Add your first step to build the sequence.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Enrollments */}
        {enrollments && enrollments.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-muted-foreground">Enrolled Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {enrollments.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <div>
                      <span className="text-sm text-zinc-200">{e.first_name} {e.last_name}</span>
                      {e.email && <span className="text-xs text-muted-foreground ml-2">{e.email}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        Step {e.current_step}{selectedCampaign.steps?.length ? ` of ${selectedCampaign.steps.length}` : ''}
                      </Badge>
                      <Badge variant={e.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                        {e.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audience Segments — bulk-enroll a saved contact segment into this campaign */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" /> Audience Segments
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setSegPreview(null); setShowSegDialog(true); }}>
              <Plus className="h-3 w-3 mr-1" /> New Segment
            </Button>
          </CardHeader>
          <CardContent>
            {segments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No segments yet. Create one to bulk-enroll matching contacts.</p>
            ) : (
              <div className="space-y-2">
                {segments.map((seg) => {
                  const f = seg.filter || {};
                  const summary = [
                    f.lead_status?.length ? `status: ${f.lead_status.join('/')}` : null,
                    f.region?.length ? `region: ${f.region.join('/')}` : null,
                    f.tags?.length ? `tags: ${f.tags.join('/')}` : null,
                    f.city ? `city: ${f.city}` : null,
                  ].filter(Boolean).join(' · ') || 'all contacts';
                  return (
                    <div key={seg.id} className="flex items-center justify-between p-2 bg-muted/30 rounded gap-2">
                      <div className="min-w-0">
                        <span className="text-sm text-zinc-200">{seg.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 truncate">{summary}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="text-amber-500 hover:text-amber-400 shrink-0"
                        disabled={enrollingId === seg.id} onClick={() => enrollSegment(seg.id)}>
                        {enrollingId === seg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5 mr-1" /> Enroll</>}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery Log — from the execution engine (crm_drip_step_sends). Empty until migration 271 + first send. */}
        {sends && sends.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-muted-foreground">Delivery Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sends.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.status === 'sent' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : s.status === 'failed' ? (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <Loader2 className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-200 truncate">
                          {s.subject}
                          <span className="text-xs text-muted-foreground ml-2">
                            → {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || 'contact'}
                          </span>
                        </div>
                        {s.status === 'failed' && s.error && (
                          <div className="text-[10px] text-red-500 truncate max-w-[320px]" title={s.error}>{s.error}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {s.open_count > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-blue-500" title={`Opened ${s.open_count}×${s.opened_at ? ' — ' + new Date(s.opened_at).toLocaleString() : ''}`}>
                          <MailOpen className="h-3 w-3" /> {s.open_count}
                        </span>
                      )}
                      {s.click_count > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-emerald-500" title={`Clicked ${s.click_count}×`}>
                          <MousePointerClick className="h-3 w-3" /> {s.click_count}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {s.sent_at ? new Date(s.sent_at).toLocaleString() : new Date(s.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add A/B Variant Dialog */}
        <Dialog open={!!variantStepId} onOpenChange={(o) => { if (!o) setVariantStepId(null); }}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-zinc-100 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-violet-400" /> Add A/B Variant</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                An alternate subject/body for this step. Recipients are split by weight; the step's own copy is the control (A).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground">Label</Label>
                  <Input value={variantForm.label} onChange={(e) => setVariantForm((v) => ({ ...v, label: e.target.value }))}
                    placeholder="B" className="bg-muted border-border" />
                </div>
                <div>
                  <Label className="text-muted-foreground">Weight</Label>
                  <Input type="number" min={0} value={variantForm.weight}
                    onChange={(e) => setVariantForm((v) => ({ ...v, weight: parseInt(e.target.value) || 0 }))} className="bg-muted border-border" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Subject Line</Label>
                <Input value={variantForm.subject} onChange={(e) => setVariantForm((v) => ({ ...v, subject: e.target.value }))}
                  placeholder="Alternate subject" className="bg-muted border-border" />
              </div>
              <div>
                <Label className="text-muted-foreground">Email Body</Label>
                <Textarea value={variantForm.body} onChange={(e) => setVariantForm((v) => ({ ...v, body: e.target.value }))}
                  placeholder="Alternate body…" rows={5} className="bg-muted border-border" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVariantStepId(null)}>Cancel</Button>
              <Button onClick={handleAddVariant} disabled={addVariantMutation.isPending || !variantForm.subject || !variantForm.body}>
                {addVariantMutation.isPending ? 'Adding…' : 'Add Variant'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Segment Dialog */}
        <Dialog open={showSegDialog} onOpenChange={setShowSegDialog}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">New Audience Segment</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                A reusable filter over your contacts. Comma-separate multiple values.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-muted-foreground">Segment Name</Label>
                <Input value={segForm.name} onChange={(e) => setSegForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Accra hot leads" className="bg-muted border-border" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground">Lead status</Label>
                  <Input value={segForm.lead_status} onChange={(e) => { setSegForm((s) => ({ ...s, lead_status: e.target.value })); setSegPreview(null); }}
                    placeholder="new, qualified" className="bg-muted border-border" />
                </div>
                <div>
                  <Label className="text-muted-foreground">Region</Label>
                  <Input value={segForm.region} onChange={(e) => { setSegForm((s) => ({ ...s, region: e.target.value })); setSegPreview(null); }}
                    placeholder="greater_accra" className="bg-muted border-border" />
                </div>
                <div>
                  <Label className="text-muted-foreground">Tags</Label>
                  <Input value={segForm.tags} onChange={(e) => { setSegForm((s) => ({ ...s, tags: e.target.value })); setSegPreview(null); }}
                    placeholder="vip, investor" className="bg-muted border-border" />
                </div>
                <div>
                  <Label className="text-muted-foreground">City</Label>
                  <Input value={segForm.city} onChange={(e) => { setSegForm((s) => ({ ...s, city: e.target.value })); setSegPreview(null); }}
                    placeholder="Accra" className="bg-muted border-border" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={previewSegment}>Preview count</Button>
                {segPreview !== null && <span className="text-sm text-muted-foreground">{segPreview} contact{segPreview === 1 ? '' : 's'} match</span>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSegDialog(false)}>Cancel</Button>
              <Button onClick={createSegment} disabled={!segForm.name.trim()}>Create Segment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Step Dialog */}
        <Dialog open={showStepDialog} onOpenChange={setShowStepDialog}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Add Email Step</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Add a new email to the drip sequence
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Delay (days after previous)</Label>
                <Input
                  type="number"
                  min={0}
                  value={newStep.delay_days}
                  onChange={(e) => setNewStep(s => ({ ...s, delay_days: parseInt(e.target.value) || 1 }))}
                  className="bg-muted border-border"
                />
              </div>
              <div>
                <Label className="text-muted-foreground">Subject Line</Label>
                <Input
                  value={newStep.subject}
                  onChange={(e) => setNewStep(s => ({ ...s, subject: e.target.value }))}
                  placeholder="e.g., Welcome to our property listings"
                  className="bg-muted border-border"
                />
              </div>
              <div>
                <Label className="text-muted-foreground">Email Body</Label>
                <Textarea
                  value={newStep.body}
                  onChange={(e) => setNewStep(s => ({ ...s, body: e.target.value }))}
                  placeholder="Write your email content..."
                  rows={6}
                  className="bg-muted border-border"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowStepDialog(false)}>Cancel</Button>
              <Button onClick={handleAddStep} disabled={addStepMutation.isPending || !newStep.subject || !newStep.body}>
                {addStepMutation.isPending ? 'Adding...' : 'Add Step'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Campaign list view
  return (
    <div className="p-6 space-y-6">
      <ConnectEmailBanner noun="Drip campaigns" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 font-mono flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-500" />
            Drip Campaigns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated email sequences to nurture leads and contacts
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Campaign
        </Button>
      </div>

      {/* Campaign List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium text-muted-foreground mb-1">No campaigns yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first drip campaign to start nurturing leads automatically.</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className="bg-card border-border hover:border-zinc-600 transition-colors cursor-pointer"
              onClick={() => setSelectedCampaignId(campaign.id)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  campaign.is_active ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'
                }`}>
                  <Mail className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200 truncate">{campaign.name}</span>
                    <Badge variant={campaign.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {campaign.is_active ? 'Active' : 'Draft'}
                    </Badge>
                  </div>
                  {campaign.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{campaign.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {campaign.step_count ?? 0} steps
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {campaign.active_enrollments ?? campaign.enrollment_count} enrolled
                  </div>
                  <div className="flex items-center gap-1 capitalize">
                    <Clock className="h-3 w-3" />
                    {campaign.trigger_type}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-amber-400"
                    onClick={(e) => { e.stopPropagation(); handleToggleActive(campaign); }}
                    disabled={updateMutation.isPending}
                  >
                    {campaign.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-red-400"
                    onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(campaign.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Campaign Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Create Drip Campaign</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Set up an automated email sequence for lead nurturing
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Campaign Name</Label>
              <Input
                value={newCampaign.name}
                onChange={(e) => setNewCampaign(s => ({ ...s, name: e.target.value }))}
                placeholder="e.g., New Lead Welcome Sequence"
                className="bg-muted border-border"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <Textarea
                value={newCampaign.description}
                onChange={(e) => setNewCampaign(s => ({ ...s, description: e.target.value }))}
                placeholder="What is this campaign about?"
                rows={3}
                className="bg-muted border-border"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Trigger Type</Label>
              <Select
                value={newCampaign.trigger_type}
                onValueChange={(v) => setNewCampaign(s => ({ ...s, trigger_type: v }))}
              >
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Enrollment</SelectItem>
                  <SelectItem value="new_lead">New Lead Created</SelectItem>
                  <SelectItem value="stage_change">Deal Stage Change</SelectItem>
                  <SelectItem value="property_inquiry">Property Inquiry</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !newCampaign.name}>
              {createMutation.isPending ? 'Creating...' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Delete Campaign</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete this campaign? This action cannot be undone.
              All enrolled contacts will be removed from the sequence.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteDialog && handleDelete(showDeleteDialog)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
