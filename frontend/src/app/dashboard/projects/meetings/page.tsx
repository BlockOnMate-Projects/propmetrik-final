'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Download, Loader2, MessageSquare, Users, CheckCircle, Clock, Eye, Trash2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Meeting {
  id: string; meeting_number: string; title: string; meeting_type: string;
  meeting_date: string; start_time: string | null; end_time: string | null;
  location: string | null; status: string; agenda: string | null;
  notes: string | null; created_at: string;
  attendee_count: number; action_item_count: number; completed_actions: number;
}

interface Attendee { id: string; name: string; email: string | null; role: string | null; company: string | null; attended: boolean; }
interface ActionItem { id: string; description: string; assigned_to: string | null; due_date: string | null; status: string; priority: string; notes: string | null; }
interface MeetingDetail extends Meeting { attendees: Attendee[]; action_items: ActionItem[]; }
interface Project { id: string; name: string; }

const typeColors: Record<string, string> = {
  progress: 'bg-blue-900/50 text-blue-400 border-blue-800',
  safety: 'bg-red-900/50 text-red-400 border-red-800',
  design: 'bg-purple-900/50 text-purple-400 border-purple-800',
  kickoff: 'bg-green-900/50 text-green-400 border-green-800',
  closeout: 'bg-amber-900/50 text-amber-400 border-amber-800',
  coordination: 'bg-cyan-900/50 text-cyan-400 border-cyan-800',
  client: 'bg-pink-900/50 text-pink-400 border-pink-800',
  other: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};
const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-900/50 text-blue-400 border-blue-800',
  in_progress: 'bg-amber-900/50 text-amber-400 border-amber-800',
  completed: 'bg-green-900/50 text-green-400 border-green-800',
  cancelled: 'bg-red-900/50 text-red-400 border-red-800',
};
const actionStatusColors: Record<string, string> = {
  pending: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  in_progress: 'bg-amber-900/50 text-amber-400 border-amber-800',
  completed: 'bg-green-900/50 text-green-400 border-green-800',
  overdue: 'bg-red-900/50 text-red-400 border-red-800',
};

export default function MeetingsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetail | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [showAddAttendee, setShowAddAttendee] = useState(false);
  const [form, setForm] = useState<any>({});
  const [attendees, setAttendees] = useState<{ name: string; email: string; role: string; company: string }[]>([]);
  const [actionItems, setActionItems] = useState<{ description: string; assigned_to: string; due_date: string; priority: string }[]>([]);
  const [newAttendee, setNewAttendee] = useState<any>({});
  const [newAction, setNewAction] = useState<any>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`${API}/projects?limit=100`);
        const json = await res.json();
        const list = json.data?.projects || json.data || json.projects || [];
        setProjects(list);
        if (list.length > 0 && !selectedProject) setSelectedProject(list[0].id);
      } catch (e) { console.error('Failed to load projects', e); }
    })();
  }, []);

  const fetchMeetings = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const res = await authedFetch(`${API}/projects/${selectedProject}/meetings?search=${search}`);
      const json = await res.json();
      setMeetings(json.data || []);
    } catch (e) { console.error('Failed to load meetings', e); }
    setLoading(false);
  }, [selectedProject, search]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const viewMeeting = async (id: string) => {
    const res = await authedFetch(`${API}/projects/${selectedProject}/meetings/${id}`);
    const json = await res.json();
    setSelectedMeeting(json.data);
    setShowDetail(true);
  };

  const createMeeting = async () => {
    try {
      const payload = { ...form, attendees, action_items: actionItems };
      const res = await authedFetch(`${API}/projects/${selectedProject}/meetings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast({ title: 'Meeting created' }); setShowCreate(false); setForm({}); setAttendees([]); setActionItems([]); fetchMeetings();
      }
    } catch (e) { toast({ title: 'Failed to create meeting', variant: 'destructive' }); }
  };

  const updateActionStatus = async (actionId: string, status: string) => {
    if (!selectedMeeting) return;
    await authedFetch(`${API}/projects/${selectedProject}/meetings/${selectedMeeting.id}/actions/${actionId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    toast({ title: `Action item ${status}` });
    viewMeeting(selectedMeeting.id);
  };

  const addAttendeeToMeeting = async () => {
    if (!selectedMeeting) return;
    await authedFetch(`${API}/projects/${selectedProject}/meetings/${selectedMeeting.id}/attendees`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAttendee),
    });
    toast({ title: 'Attendee added' }); setShowAddAttendee(false); setNewAttendee({});
    viewMeeting(selectedMeeting.id);
  };

  const addActionToMeeting = async () => {
    if (!selectedMeeting) return;
    await authedFetch(`${API}/projects/${selectedProject}/meetings/${selectedMeeting.id}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAction),
    });
    toast({ title: 'Action item added' }); setShowAddAction(false); setNewAction({});
    viewMeeting(selectedMeeting.id);
  };

  const exportMeetings = () => {
    window.open(`${API}/projects/${selectedProject}/export/meetings?format=csv`, '_blank');
  };

  const stats = {
    total: meetings.length,
    completed: meetings.filter(m => m.status === 'completed').length,
    upcoming: meetings.filter(m => m.status === 'scheduled' && new Date(m.meeting_date) >= new Date()).length,
    totalActions: meetings.reduce((s, m) => s + (m.action_item_count || 0), 0),
    completedActions: meetings.reduce((s, m) => s + (m.completed_actions || 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Meeting Minutes</h1>
          <p className="text-zinc-500 text-sm mt-1">Track meetings, attendees, and action items</p>
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800 text-sm"><SelectValue placeholder="Select project" /></SelectTrigger>
          <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Total Meetings</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Completed</p>
          <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
        </CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Upcoming</p>
          <p className="text-2xl font-bold text-blue-500">{stats.upcoming}</p>
        </CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Action Items</p>
          <p className="text-2xl font-bold text-amber-500">{stats.totalActions}</p>
        </CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Actions Done</p>
          <p className="text-2xl font-bold text-green-500">{stats.completedActions}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search meetings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-[250px] bg-zinc-900 border-zinc-800" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-zinc-700" onClick={exportMeetings}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => { setForm({ meeting_type: 'progress' }); setAttendees([]); setActionItems([]); setShowCreate(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />New Meeting</Button>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
        <Card className="bg-zinc-900/80 border-zinc-800">
          <Table>
            <TableHeader><TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500 font-mono text-[10px]">NUMBER</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">TITLE</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">TYPE</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">DATE</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">STATUS</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">ATTENDEES</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">ACTIONS</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {meetings.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-8">No meetings found. Schedule one to get started.</TableCell></TableRow>
              ) : meetings.map(m => (
                <TableRow key={m.id} className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer" onClick={() => viewMeeting(m.id)}>
                  <TableCell className="font-mono text-xs text-amber-500">{m.meeting_number}</TableCell>
                  <TableCell className="text-sm text-white max-w-[200px] truncate">{m.title}</TableCell>
                  <TableCell><Badge variant="outline" className={typeColors[m.meeting_type] || typeColors.other}>{m.meeting_type}</Badge></TableCell>
                  <TableCell className="text-xs text-zinc-400">{new Date(m.meeting_date).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant="outline" className={statusColors[m.status] || 'border-zinc-700'}>{m.status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-xs text-zinc-400"><Users className="h-3 w-3 inline mr-1" />{m.attendee_count || 0}</TableCell>
                  <TableCell className="text-xs text-zinc-400"><CheckCircle className="h-3 w-3 inline mr-1" />{m.completed_actions || 0}/{m.action_item_count || 0}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); viewMeeting(m.id); }}><Eye className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Meeting Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Schedule Meeting</DialogTitle></DialogHeader>
          <Tabs defaultValue="details">
            <TabsList className="bg-zinc-800"><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="attendees">Attendees ({attendees.length})</TabsTrigger><TabsTrigger value="actions">Action Items ({actionItems.length})</TabsTrigger></TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div><Label className="text-zinc-400 text-xs">Title *</Label><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-zinc-400 text-xs">Date *</Label><Input type="date" value={form.meeting_date || ''} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
                <div><Label className="text-zinc-400 text-xs">Type</Label>
                  <Select value={form.meeting_type || 'progress'} onValueChange={(v) => setForm({ ...form, meeting_type: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                    <SelectContent>{['progress','safety','design','kickoff','closeout','coordination','client','other'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-zinc-400 text-xs">Start Time</Label><Input type="time" value={form.start_time || ''} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
                <div><Label className="text-zinc-400 text-xs">End Time</Label><Input type="time" value={form.end_time || ''} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
              </div>
              <div><Label className="text-zinc-400 text-xs">Location</Label><Input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
              <div><Label className="text-zinc-400 text-xs">Agenda</Label><Textarea value={form.agenda || ''} onChange={(e) => setForm({ ...form, agenda: e.target.value })} className="bg-zinc-800 border-zinc-700" rows={3} /></div>
              <div><Label className="text-zinc-400 text-xs">Notes</Label><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-zinc-800 border-zinc-700" rows={3} /></div>
            </TabsContent>

            <TabsContent value="attendees" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Input placeholder="Name *" value={newAttendee.name || ''} onChange={(e) => setNewAttendee({ ...newAttendee, name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-xs" />
                <Input placeholder="Email" value={newAttendee.email || ''} onChange={(e) => setNewAttendee({ ...newAttendee, email: e.target.value })} className="bg-zinc-800 border-zinc-700 text-xs" />
                <Input placeholder="Role" value={newAttendee.role || ''} onChange={(e) => setNewAttendee({ ...newAttendee, role: e.target.value })} className="bg-zinc-800 border-zinc-700 text-xs" />
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700" disabled={!newAttendee.name} onClick={() => { setAttendees([...attendees, newAttendee]); setNewAttendee({}); }}>Add</Button>
              </div>
              {attendees.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/50 border border-zinc-700 rounded">
                  <div className="text-sm"><span className="text-white">{a.name}</span>{a.role && <span className="text-zinc-500 text-xs ml-2">{a.role}</span>}</div>
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400" onClick={() => setAttendees(attendees.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {attendees.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">No attendees added yet</p>}
            </TabsContent>

            <TabsContent value="actions" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Input placeholder="Description *" value={newAction.description || ''} onChange={(e) => setNewAction({ ...newAction, description: e.target.value })} className="bg-zinc-800 border-zinc-700 text-xs" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input placeholder="Assigned to" value={newAction.assigned_to || ''} onChange={(e) => setNewAction({ ...newAction, assigned_to: e.target.value })} className="bg-zinc-800 border-zinc-700 text-xs" />
                  <Input type="date" placeholder="Due date" value={newAction.due_date || ''} onChange={(e) => setNewAction({ ...newAction, due_date: e.target.value })} className="bg-zinc-800 border-zinc-700 text-xs" />
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700" disabled={!newAction.description} onClick={() => { setActionItems([...actionItems, { ...newAction, priority: 'medium' }]); setNewAction({}); }}>Add</Button>
                </div>
              </div>
              {actionItems.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/50 border border-zinc-700 rounded">
                  <div className="text-sm text-white">{a.description}{a.assigned_to && <span className="text-zinc-500 text-xs ml-2">→ {a.assigned_to}</span>}</div>
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400" onClick={() => setActionItems(actionItems.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {actionItems.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">No action items added yet</p>}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={createMeeting} className="bg-amber-600 hover:bg-amber-700" disabled={!form.title || !form.meeting_date}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meeting Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedMeeting && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-amber-500">{selectedMeeting.meeting_number}</span>
                <span>{selectedMeeting.title}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className={typeColors[selectedMeeting.meeting_type] || typeColors.other}>{selectedMeeting.meeting_type}</Badge>
                <Badge variant="outline" className={statusColors[selectedMeeting.status] || 'border-zinc-700'}>{selectedMeeting.status.replace('_', ' ')}</Badge>
                <Badge variant="outline" className="border-zinc-700">{new Date(selectedMeeting.meeting_date).toLocaleDateString()}</Badge>
                {selectedMeeting.start_time && <Badge variant="outline" className="border-zinc-700"><Clock className="h-3 w-3 mr-1" />{selectedMeeting.start_time}{selectedMeeting.end_time ? ` - ${selectedMeeting.end_time}` : ''}</Badge>}
                {selectedMeeting.location && <Badge variant="outline" className="border-zinc-700">{selectedMeeting.location}</Badge>}
              </div>

              {selectedMeeting.agenda && <div><Label className="text-zinc-500 text-xs uppercase">Agenda</Label><p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">{selectedMeeting.agenda}</p></div>}
              {selectedMeeting.notes && <div><Label className="text-zinc-500 text-xs uppercase">Notes</Label><p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">{selectedMeeting.notes}</p></div>}

              {/* Attendees */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white"><Users className="h-4 w-4 inline mr-1" />Attendees ({selectedMeeting.attendees?.length || 0})</h3>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" onClick={() => { setNewAttendee({}); setShowAddAttendee(true); }}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(selectedMeeting.attendees || []).map((a: Attendee) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 bg-zinc-800/50 border border-zinc-700 rounded text-sm">
                      <div className={`w-2 h-2 rounded-full ${a.attended ? 'bg-green-500' : 'bg-zinc-500'}`} />
                      <div><span className="text-white">{a.name}</span>{a.role && <span className="text-zinc-500 text-xs ml-1">({a.role})</span>}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white"><CheckCircle className="h-4 w-4 inline mr-1" />Action Items ({selectedMeeting.action_items?.length || 0})</h3>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" onClick={() => { setNewAction({}); setShowAddAction(true); }}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                <div className="space-y-2">
                  {(selectedMeeting.action_items || []).map((ai: ActionItem) => (
                    <div key={ai.id} className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 rounded">
                      <div className="flex-1">
                        <p className="text-sm text-white">{ai.description}</p>
                        <div className="flex gap-2 mt-1">
                          {ai.assigned_to && <span className="text-xs text-zinc-500">→ {ai.assigned_to}</span>}
                          {ai.due_date && <span className="text-xs text-zinc-500">Due: {new Date(ai.due_date).toLocaleDateString()}</span>}
                          <Badge variant="outline" className={actionStatusColors[ai.status] || 'border-zinc-700'} >{ai.status}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {ai.status === 'pending' && <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-400" onClick={() => updateActionStatus(ai.id, 'in_progress')}>Start</Button>}
                        {ai.status === 'in_progress' && <Button size="sm" variant="ghost" className="h-7 text-xs text-green-400" onClick={() => updateActionStatus(ai.id, 'completed')}><CheckCircle className="h-3 w-3 mr-1" />Complete</Button>}
                      </div>
                    </div>
                  ))}
                  {(selectedMeeting.action_items || []).length === 0 && <p className="text-zinc-500 text-sm text-center py-2">No action items</p>}
                </div>
              </div>
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Add Attendee (to existing meeting) */}
      <Dialog open={showAddAttendee} onOpenChange={setShowAddAttendee}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader><DialogTitle>Add Attendee</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-zinc-400 text-xs">Name *</Label><Input value={newAttendee.name || ''} onChange={(e) => setNewAttendee({ ...newAttendee, name: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">Email</Label><Input value={newAttendee.email || ''} onChange={(e) => setNewAttendee({ ...newAttendee, email: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">Role</Label><Input value={newAttendee.role || ''} onChange={(e) => setNewAttendee({ ...newAttendee, role: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">Company</Label><Input value={newAttendee.company || ''} onChange={(e) => setNewAttendee({ ...newAttendee, company: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAttendee(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={addAttendeeToMeeting} className="bg-amber-600 hover:bg-amber-700" disabled={!newAttendee.name}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Action Item (to existing meeting) */}
      <Dialog open={showAddAction} onOpenChange={setShowAddAction}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader><DialogTitle>Add Action Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-zinc-400 text-xs">Description *</Label><Textarea value={newAction.description || ''} onChange={(e) => setNewAction({ ...newAction, description: e.target.value })} className="bg-zinc-800 border-zinc-700" rows={2} /></div>
            <div><Label className="text-zinc-400 text-xs">Assigned To</Label><Input value={newAction.assigned_to || ''} onChange={(e) => setNewAction({ ...newAction, assigned_to: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">Due Date</Label><Input type="date" value={newAction.due_date || ''} onChange={(e) => setNewAction({ ...newAction, due_date: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">Priority</Label>
              <Select value={newAction.priority || 'medium'} onValueChange={(v) => setNewAction({ ...newAction, priority: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                <SelectContent>{['low','medium','high','urgent'].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAction(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={addActionToMeeting} className="bg-amber-600 hover:bg-amber-700" disabled={!newAction.description}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
