'use client';

import { useState } from 'react';
import {
  Mail,
  Plus,
  Play,
  Pause,
  Trash2,
  Users,
  Clock,
  ChevronRight,
  ArrowLeft,
  Send,
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
  useCreateDripCampaign,
  useUpdateDripCampaign,
  useDeleteDripCampaign,
  useAddDripStep,
  useDeleteDripStep,
} from '@/hooks/crm/use-drip-campaigns';
import type { DripCampaign, DripCampaignStep } from '@/lib/crm-api';

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

  const createMutation = useCreateDripCampaign();
  const updateMutation = useUpdateDripCampaign();
  const deleteMutation = useDeleteDripCampaign();
  const addStepMutation = useAddDripStep();
  const deleteStepMutation = useDeleteDripStep();

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
                        <Badge variant="outline" className="text-[10px]">
                          Day {step.delay_days}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{step.body}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-red-400"
                      onClick={() => deleteStepMutation.mutate({ campaignId: selectedCampaignId, stepId: step.id })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
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
                      <Badge variant="outline" className="text-[10px]">Step {e.current_step}</Badge>
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
