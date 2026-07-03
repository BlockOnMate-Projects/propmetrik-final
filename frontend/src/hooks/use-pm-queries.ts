/**
 * React Query hooks for Project Management
 * 
 * Provides data fetching with caching, optimistic updates,
 * and automatic background refetching for all PM entities.
 */
import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { authedFetch } from '@/lib/authed-fetch';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

// ---------- Generic helpers ----------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await authedFetch(`${API}${url}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function mutateJson<T>(url: string, method: string, body?: any): Promise<T> {
  const res = await authedFetch(`${API}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ---------- Projects ----------

export function useProjects(params: { limit?: number; page?: number } = {}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => fetchJson<any>(`/projects?limit=${params.limit || 50}&page=${params.page || 1}`),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchJson<any>(`/projects/${id}`),
    enabled: !!id,
  });
}

// ---------- Issues ----------

export function useIssues(projectId: string | undefined, filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: ['issues', projectId, filters],
    queryFn: () => fetchJson<any[]>(`/projects/${projectId}/issues${qs ? `?${qs}` : ''}`),
    enabled: !!projectId,
  });
}

export function useCreateIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/issues`, 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues', projectId] });
    },
  });
}

export function useUpdateIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      mutateJson<any>(`/projects/${projectId}/issues/${id}`, 'PUT', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues', projectId] });
    },
  });
}

export function useDeleteIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJson<any>(`/projects/${projectId}/issues/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues', projectId] });
    },
  });
}

// ---------- Risks ----------

export function useRisks(projectId: string | undefined, filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: ['risks', projectId, filters],
    queryFn: () => fetchJson<any[]>(`/projects/${projectId}/risks${qs ? `?${qs}` : ''}`),
    enabled: !!projectId,
  });
}

export function useCreateRisk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/risks`, 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risks', projectId] });
    },
  });
}

export function useUpdateRisk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      mutateJson<any>(`/projects/${projectId}/risks/${id}`, 'PUT', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risks', projectId] });
    },
  });
}

// ---------- Drawings ----------

export function useDrawings(projectId: string | undefined, search = '') {
  return useQuery({
    queryKey: ['drawings', projectId, search],
    queryFn: () => fetchJson<any[]>(`/projects/${projectId}/drawings?search=${search}`),
    enabled: !!projectId,
  });
}

export function useDrawing(projectId: string | undefined, drawingId: string | undefined) {
  return useQuery({
    queryKey: ['drawing', projectId, drawingId],
    queryFn: () => fetchJson<any>(`/projects/${projectId}/drawings/${drawingId}`),
    enabled: !!projectId && !!drawingId,
  });
}

export function useCreateDrawing(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/drawings`, 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drawings', projectId] });
    },
  });
}

export function useAddRevision(projectId: string, drawingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/drawings/${drawingId}/revisions`, 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drawing', projectId, drawingId] });
      qc.invalidateQueries({ queryKey: ['drawings', projectId] });
    },
  });
}

// ---------- Meetings ----------

export function useMeetings(projectId: string | undefined, search = '') {
  return useQuery({
    queryKey: ['meetings', projectId, search],
    queryFn: () => fetchJson<any[]>(`/projects/${projectId}/meetings?search=${search}`),
    enabled: !!projectId,
  });
}

export function useMeeting(projectId: string | undefined, meetingId: string | undefined) {
  return useQuery({
    queryKey: ['meeting', projectId, meetingId],
    queryFn: () => fetchJson<any>(`/projects/${projectId}/meetings/${meetingId}`),
    enabled: !!projectId && !!meetingId,
  });
}

export function useCreateMeeting(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/meetings`, 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings', projectId] });
    },
  });
}

export function useUpdateActionItem(projectId: string, meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, ...data }: { actionId: string; [key: string]: any }) =>
      mutateJson<any>(`/projects/${projectId}/meetings/${meetingId}/actions/${actionId}`, 'PUT', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', projectId, meetingId] });
      qc.invalidateQueries({ queryKey: ['meetings', projectId] });
    },
  });
}

// ---------- Dashboard & Analytics ----------

export function useDashboardMetrics(period = '30d') {
  return useQuery({
    queryKey: ['dashboard-metrics', period],
    queryFn: () => fetchJson<any>(`/projects/dashboard/metrics?period=${period}`),
    staleTime: 60_000, // metrics can be cached longer
  });
}

export function useBudgetOverview(period = '30d') {
  return useQuery({
    queryKey: ['budget-overview', period],
    queryFn: () => fetchJson<any>(`/projects/dashboard/budget-overview?period=${period}`),
    staleTime: 60_000,
  });
}

export function useTimelineStatus(period = '30d') {
  return useQuery({
    queryKey: ['timeline-status', period],
    queryFn: () => fetchJson<any>(`/projects/dashboard/timeline-status?period=${period}`),
    staleTime: 60_000,
  });
}

// ---------- Notification Preferences ----------

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => fetchJson<any>(`/notification-preferences`),
    staleTime: 300_000,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateJson<any>(`/notification-preferences`, 'PUT', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}

// ---------- Profile ----------

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => fetchJson<any>(`/profile`),
    staleTime: 300_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateJson<any>(`/profile`, 'PUT', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// ======================= TIER 4 HOOKS =======================

// ---------- Safety ----------

export function useSafetyIncidents(projectId: string | undefined, filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({ queryKey: ['safety-incidents', projectId, filters], queryFn: () => fetchJson<any>(`/projects/${projectId}/safety/incidents?${qs}`), enabled: !!projectId });
}
export function useCreateIncident(projectId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/safety/incidents`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['safety-incidents'] }) });
}
export function useSafetyObservations(projectId: string | undefined) {
  return useQuery({ queryKey: ['safety-observations', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/safety/observations`), enabled: !!projectId });
}
export function useCreateObservation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/safety/observations`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['safety-observations'] }) });
}
export function useSafetyInspections(projectId: string | undefined) {
  return useQuery({ queryKey: ['safety-inspections', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/safety/inspections`), enabled: !!projectId });
}
export function useCreateInspection(projectId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/safety/inspections`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['safety-inspections'] }) });
}
export function useSafetyStats(projectId: string | undefined) {
  return useQuery({ queryKey: ['safety-stats', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/safety/stats`), enabled: !!projectId });
}

// ---------- Timesheets ----------

export function useTimeEntries(projectId: string | undefined, filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({ queryKey: ['time-entries', projectId, filters], queryFn: () => fetchJson<any>(`/projects/${projectId}/time-entries?${qs}`), enabled: !!projectId });
}
export function useClockIn(projectId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/time-entries/clock-in`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }) });
}
export function useClockOut(entryId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/time-entries/${entryId}/clock-out`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }) });
}
export function useTimesheets(projectId: string | undefined) {
  return useQuery({ queryKey: ['timesheets', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/timesheets`), enabled: !!projectId });
}
export function useCrewSchedules(projectId: string | undefined) {
  return useQuery({ queryKey: ['crew-schedules', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/crew-schedules`), enabled: !!projectId });
}
export function useTimeStats(projectId: string | undefined) {
  return useQuery({ queryKey: ['time-stats', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/time-stats`), enabled: !!projectId });
}

// ---------- Equipment ----------

export function useEquipment() {
  return useQuery({ queryKey: ['equipment'], queryFn: () => fetchJson<any>(`/equipment`) });
}
export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/equipment`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment'] }) });
}
export function useProjectEquipment(projectId: string | undefined) {
  return useQuery({ queryKey: ['project-equipment', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/equipment`), enabled: !!projectId });
}
export function useAssignEquipment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/equipment`, 'POST', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-equipment'] }); qc.invalidateQueries({ queryKey: ['equipment'] }); } });
}
export function useEquipmentStats() {
  return useQuery({ queryKey: ['equipment-stats'], queryFn: () => fetchJson<any>(`/equipment-stats`) });
}

// ---------- Bidding ----------

export function useBidPackages(projectId: string | undefined) {
  return useQuery({ queryKey: ['bid-packages', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/bid-packages`), enabled: !!projectId });
}
export function useCreateBidPackage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/bid-packages`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['bid-packages'] }) });
}
export function useBids(packageId: string | undefined) {
  return useQuery({ queryKey: ['bids', packageId], queryFn: () => fetchJson<any>(`/bid-packages/${packageId}/bids`), enabled: !!packageId });
}
export function useBidComparison(packageId: string | undefined) {
  return useQuery({ queryKey: ['bid-compare', packageId], queryFn: () => fetchJson<any>(`/bid-packages/${packageId}/compare`), enabled: !!packageId });
}
export function useVendors() {
  return useQuery({ queryKey: ['vendors'], queryFn: () => fetchJson<any>(`/vendors`) });
}
export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/vendors`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }) });
}

// ---------- Closeout ----------

export function useCloseout(projectId: string | undefined) {
  return useQuery({ queryKey: ['closeout', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/closeout`), enabled: !!projectId });
}
export function useCloseoutItems(projectId: string | undefined) {
  return useQuery({ queryKey: ['closeout-items', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/closeout/items`), enabled: !!projectId });
}
export function useUpdateCloseoutItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => mutateJson<any>(`/closeout/items/${id}`, 'PUT', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['closeout-items'] }); qc.invalidateQueries({ queryKey: ['closeout'] }); } });
}
export function useWarranties(projectId: string | undefined) {
  return useQuery({ queryKey: ['warranties', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/warranties`), enabled: !!projectId });
}
export function useCreateWarranty(projectId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/projects/${projectId}/warranties`, 'POST', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['warranties'] }); qc.invalidateQueries({ queryKey: ['warranty-dashboard'] }); } });
}
export function useWarrantyDashboard(projectId: string | undefined) {
  return useQuery({ queryKey: ['warranty-dashboard', projectId], queryFn: () => fetchJson<any>(`/projects/${projectId}/warranty-dashboard`), enabled: !!projectId });
}

// ---------- Audit Log ----------

export function useAuditLog(filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({ queryKey: ['audit-log', filters], queryFn: () => fetchJson<any>(`/audit-log?${qs}`) });
}
export function useAuditLogStats() {
  return useQuery({ queryKey: ['audit-log-stats'], queryFn: () => fetchJson<any>(`/audit-log/stats`) });
}

// ---------- Custom Fields ----------

export function useCustomFields(entityType?: string) {
  const qs = entityType ? `?entity_type=${entityType}` : '';
  return useQuery({ queryKey: ['custom-fields', entityType], queryFn: () => fetchJson<any>(`/custom-fields${qs}`) });
}
export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/custom-fields`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }) });
}
export function useCustomFieldValues(entityType: string, entityId: string) {
  return useQuery({ queryKey: ['custom-field-values', entityType, entityId], queryFn: () => fetchJson<any>(`/custom-fields/values/${entityType}/${entityId}`), enabled: !!entityType && !!entityId });
}
export function useSetCustomFieldValues(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/custom-fields/values/${entityType}/${entityId}`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-field-values'] }) });
}

// ---------- App Integrations ----------

export function useAppIntegrations() {
  return useQuery({ queryKey: ['app-integrations'], queryFn: () => fetchJson<any>(`/app-integrations`) });
}
export function useCreateAppIntegration() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/app-integrations`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['app-integrations'] }) });
}
export function useTestIntegration() {
  return useMutation({ mutationFn: (id: string) => mutateJson<any>(`/app-integrations/${id}/test`, 'POST', {}) });
}
export function useSyncIntegration() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => mutateJson<any>(`/app-integrations/${id}/sync`, 'POST', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['app-integrations'] }) });
}
export function useApiKeys() {
  return useQuery({ queryKey: ['api-keys'], queryFn: () => fetchJson<any>(`/api-keys`) });
}
export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => mutateJson<any>(`/api-keys`, 'POST', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }) });
}
export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => mutateJson<any>(`/api-keys/${id}`, 'DELETE', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }) });
}
