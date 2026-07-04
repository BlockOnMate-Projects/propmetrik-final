'use client';

/**
 * Attach a synced email to a service record. Service-aware: Deals → contact/deal, Property
 * Management → tenant, Projects → contact (generic). Calls emailsApi.linkToEntity, which writes the
 * polymorphic entity_type/entity_id (and mirrors deal_id/contact_id for CRM).
 */

import { useState, useEffect } from 'react';
import { Search, Loader2, Link2, User, Briefcase, Home } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { emailsApi, contactsApi, dealsApi } from '@/lib/crm-api';
import { propertyManagementApi } from '@/lib/property-management-api';
import type { CommsService } from './CommunicationsHub';

interface EntityOption { id: string; label: string; sub?: string }
interface EntityType { type: string; label: string; icon: typeof User; search: (q: string) => Promise<EntityOption[]> }

const rows = (res: any): any[] => res?.data || res?.items || (Array.isArray(res) ? res : []);

const CONTACT_TYPE: EntityType = {
  type: 'contact', label: 'Contact', icon: User,
  search: async (q) => rows(await contactsApi.getAll({ search: q || undefined, limit: 12 })).map((c: any) => ({
    id: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact', sub: c.email,
  })),
};
const DEAL_TYPE: EntityType = {
  type: 'deal', label: 'Deal', icon: Briefcase,
  search: async (q) => rows(await dealsApi.getAll({ search: q || undefined, limit: 12 })).map((d: any) => ({
    id: d.id, label: d.title || 'Deal', sub: d.stage_name || d.pipeline_name,
  })),
};
const TENANT_TYPE: EntityType = {
  type: 'tenant', label: 'Tenant', icon: Home,
  search: async (q) => rows(await propertyManagementApi.getTenants({ search: q || undefined, limit: 12 })).map((t: any) => ({
    id: t.id, label: t.fullName || t.full_name || t.name || t.email || 'Tenant', sub: t.email,
  })),
};

const TYPES_BY_SERVICE: Record<CommsService, EntityType[]> = {
  deals: [CONTACT_TYPE, DEAL_TYPE],
  'property-management': [TENANT_TYPE],
  projects: [CONTACT_TYPE],
};

export function LinkEntityDialog({ open, onClose, service, emailId, onLinked }: {
  open: boolean; onClose: () => void; service: CommsService; emailId: string | null;
  onLinked: (entityType: string, entityId: string) => void;
}) {
  const types = TYPES_BY_SERVICE[service] || [CONTACT_TYPE];
  const [activeType, setActiveType] = useState<EntityType>(types[0]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => { if (open) { setActiveType(types[0]); setQuery(''); setResults([]); } /* eslint-disable-next-line */ }, [open, service]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await activeType.search(query); if (!cancelled) setResults(r); }
      catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, query, activeType]);

  const pick = async (opt: EntityOption) => {
    if (!emailId) return;
    setLinkingId(opt.id);
    try {
      await emailsApi.linkToEntity(emailId, activeType.type, opt.id);
      toast.success(`Linked to ${activeType.label.toLowerCase()} "${opt.label}"`);
      onLinked(activeType.type, opt.id);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to link');
    } finally { setLinkingId(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Link email to a record</DialogTitle>
        </DialogHeader>
        {types.length > 1 && (
          <div className="flex gap-1">
            {types.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.type} onClick={() => setActiveType(t)}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border',
                    activeType.type === t.type ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${activeType.label.toLowerCase()}s…`} className="pl-9" />
        </div>
        <div className="max-h-72 overflow-y-auto -mx-1">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : results.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No {activeType.label.toLowerCase()}s found</p>
          ) : results.map((opt) => (
            <button key={opt.id} disabled={!!linkingId} onClick={() => pick(opt)}
              className="w-full px-3 py-2.5 flex items-center gap-3 text-left rounded-md hover:bg-muted transition-colors disabled:opacity-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{opt.label}</p>
                {opt.sub && <p className="text-[11px] text-muted-foreground truncate">{opt.sub}</p>}
              </div>
              {linkingId === opt.id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LinkEntityDialog;
