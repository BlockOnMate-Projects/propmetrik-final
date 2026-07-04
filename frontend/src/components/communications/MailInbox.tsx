'use client';

/**
 * Reusable Mail inbox — synced Gmail/Outlook, shared across CRM / Property Management / Projects
 * via the Communications hub. Pass `service` for labelling and, optionally, `entityType`+`entityId`
 * to scope the list + attach sent/synced mail to a specific record (deal, tenant, property, vendor…).
 * Backed by `emailsApi` → `/crm/emails/*` → emailIntegrationService (one shared engine, polymorphic
 * entity linking, per-user scoping). Supports read + compose + reply/reply-all/forward (Mail.Send /
 * gmail.modify scopes).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Mail, RefreshCw, Search, Send, Inbox as InboxIcon, ArrowUpRight,
  Link2, Plug, Loader2, Reply, ReplyAll, Forward, Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { emailsApi, type CrmEmail, type EmailConnectionStatus } from '@/lib/crm-api';
import { LinkEntityDialog } from './LinkEntityDialog';
import { ComposeWindow, type ComposeInit } from './ComposeWindow';

type Provider = 'gmail' | 'outlook';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface MailInboxProps {
  service?: 'deals' | 'property-management' | 'projects';
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
}

// ── address / date helpers ──────────────────────────────────────────────────
function parseAddr(raw?: string): { name: string; email: string } {
  const s = (raw || '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: '', email: s };
}
function displayName(raw?: string): string {
  const { name, email } = parseAddr(raw);
  if (name) return name;
  const local = email.split('@')[0] || email;
  // Long machine addresses (e.g. MicrosoftExchange329e…) read better as the domain.
  if (local.length > 24) return email.split('@')[1] || email;
  return email;
}
function initialOf(raw?: string): string {
  const n = displayName(raw).replace(/[^a-z0-9]/gi, '');
  return (n[0] || '?').toUpperCase();
}
const AVATAR_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-600', 'bg-indigo-500', 'bg-teal-500'];
function avatarColor(seed?: string): string {
  let h = 0; for (const c of (seed || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function relTime(dateStr: string): string {
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d`;
  return new Date(dateStr).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}
function fmtFull(dateStr: string): string {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(dateStr).toLocaleString('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const INTEGRATIONS_PATH: Record<string, string> = {
  deals: '/dashboard/deals/integrations',
  'property-management': '/dashboard/property-management/integrations',
  projects: '/dashboard/projects/integrations-marketplace',
};

/**
 * Renders an email body the way a real client does: HTML in a same-origin (script-disabled) iframe
 * that AUTO-SIZES to its content (no inner scrollbar — it flows in the page), links open in a new
 * tab, images are constrained. Plain text gets proper typography. Safe: no `allow-scripts`, so any
 * scripts in the email never run.
 */
function EmailBody({ html, text }: { html?: string; text?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(360);

  const BASE_STYLE = `<style>html,body{margin:0;padding:20px;background:#fff;color:#111;`
    + `font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;`
    + `word-wrap:break-word;overflow-wrap:break-word}`
    + `img{max-width:100%!important;height:auto}table{max-width:100%}a{color:#2563eb}`
    + `blockquote{margin:0 0 0 .5em;padding-left:1em;border-left:3px solid #e5e7eb;color:#555}</style>`;

  const srcDoc = html
    ? (/<head[\s>]/i.test(html)
        ? html.replace(/<head([^>]*)>/i, `<head$1><base target="_blank" rel="noopener">${BASE_STYLE}`)
        : `<!doctype html><html><head><meta charset="utf-8"><base target="_blank" rel="noopener">${BASE_STYLE}</head><body>${html}</body></html>`)
    : `<!doctype html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body style="white-space:pre-wrap;font-size:15px;line-height:1.6">${escapeHtml(text || '(empty message)')}</body></html>`;

  const measure = () => {
    try {
      const doc = ref.current?.contentWindow?.document;
      if (doc?.body) setHeight(Math.min(Math.max(doc.body.scrollHeight + 8, 200), 40000));
    } catch { /* keep default */ }
  };

  return (
    <iframe
      ref={ref}
      title="email-body"
      // same-origin (to measure height) + popups for links; NO allow-scripts → email JS can't run.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      onLoad={() => { measure(); setTimeout(measure, 400); }}
      className="w-full border-0 bg-white block"
      style={{ height }}
    />
  );
}

export function MailInbox({ service = 'deals', entityType, entityId, entityLabel }: MailInboxProps) {
  const [status, setStatus] = useState<{ gmail: EmailConnectionStatus; outlook: EmailConnectionStatus } | null>(null);
  const [provider, setProvider] = useState<Provider>('gmail');
  const [emails, setEmails] = useState<CrmEmail[]>([]);
  const [selected, setSelected] = useState<CrmEmail | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [compose, setCompose] = useState<ComposeInit | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const connected = (['gmail', 'outlook'] as Provider[]).filter((p) => status?.[p]?.connected);
  const anyConnected = connected.length > 0;

  const loadStatus = useCallback(async () => {
    try {
      const s = await emailsApi.getStatus();
      setStatus(s);
      if (s.gmail?.connected && !s.gmail?.needsReauth) setProvider('gmail');
      else if (s.outlook?.connected) setProvider('outlook');
    } catch {
      setStatus({ gmail: { connected: false }, outlook: { connected: false } });
    }
  }, []);

  const loadEmails = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      // Filter the inbox to the ACTIVE account so the Gmail/Outlook toggle switches mailboxes.
      const { emails } = await emailsApi.list({ provider, entity_type: entityType, entity_id: entityId, search: q || undefined, limit: 100 });
      setEmails(emails);
      setSelected((s) => (s && emails.some((e) => e.id === s.id) ? s : null)); // clear selection if it left the view
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, provider]);

  // loadStatus runs ONCE (it also picks the default provider); loadEmails re-runs whenever the
  // provider/entity changes — kept separate so switching mailbox doesn't reset the toggle.
  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadEmails(); }, [loadEmails]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { synced } = await emailsApi.sync(provider, 50);
      toast.success(`Synced ${synced} email${synced === 1 ? '' : 's'} from ${provider === 'gmail' ? 'Gmail' : 'Outlook'}`);
      await loadEmails(search);
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); loadEmails(search); };

  // Open an email and optimistically clear its unread state in the list.
  const openEmail = (em: CrmEmail) => {
    setSelected(em);
    if (em.is_read === false) setEmails((list) => list.map((e) => (e.id === em.id ? { ...e, is_read: true } : e)));
  };

  // ── reply / forward pre-fill (HTML body for the rich editor) ──────────────
  const quoteHtml = (em: CrmEmail) => {
    const when = fmtFull(em.received_at);
    const who = escapeHtml(em.from_address || '');
    const original = em.body_html || `<div>${escapeHtml(em.body_text || '').replace(/\n/g, '<br>')}</div>`;
    return `<br><br><div style="color:#888">On ${when}, ${who} wrote:</div><blockquote>${original}</blockquote>`;
  };
  const reSubject = (s?: string) => (/^re:/i.test(s || '') ? s! : `Re: ${s || ''}`);
  const fwdSubject = (s?: string) => (/^fwd?:/i.test(s || '') ? s! : `Fwd: ${s || ''}`);
  const openReply = (em: CrmEmail, all = false) => {
    const from = parseAddr(em.from_address).email;
    const others = all
      ? Array.from(new Set([...(em.to_addresses || []), ...(em.cc_addresses || [])].map((a) => parseAddr(a).email).filter((a) => a && a.toLowerCase() !== from.toLowerCase())))
      : [];
    setSelected(em);
    // Only thread when replying via the SAME provider the email came from — a Gmail threadId would
    // break an Outlook send (and vice-versa). Cross-provider replies just go out as a fresh message.
    const sameProvider = em.provider === provider;
    setCompose({
      to: from, cc: others.join(', ') || undefined, subject: reSubject(em.subject), bodyHtml: quoteHtml(em),
      inReplyTo: sameProvider ? em.message_id : undefined,
      threadId: sameProvider ? em.thread_id : undefined,
      replyToProviderId: sameProvider ? em.provider_message_id : undefined,
    });
  };
  const openForward = (em: CrmEmail) => setCompose({ subject: fwdSubject(em.subject), bodyHtml: quoteHtml(em) });

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          {status && anyConnected ? (
            (['gmail', 'outlook'] as Provider[]).map((p) => {
              const s = status[p];
              if (!s?.connected) return null;
              const label = p === 'gmail' ? 'Gmail' : 'Outlook';
              return s.needsReauth ? (
                <Link key={p} href={INTEGRATIONS_PATH[service] || '/dashboard/deals/integrations'}>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40 cursor-pointer" title="Mailbox permission missing — click to reconnect">
                    {label} · reconnect needed
                  </Badge>
                </Link>
              ) : (
                <Badge key={p} variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                  {label}{s.email ? ` · ${s.email}` : ''}
                </Badge>
              );
            })
          ) : status ? (
            <span className="text-muted-foreground">No email account connected</span>
          ) : null}
          {entityLabel && <Badge variant="outline" className="text-primary border-primary/30">Scoped to {entityLabel}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {connected.length > 1 && (
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              {(['gmail', 'outlook'] as Provider[]).filter((p) => status?.[p]?.connected).map((p) => (
                <button key={p} onClick={() => setProvider(p)}
                  className={cn('px-3 py-1.5 font-medium capitalize', provider === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {p}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={!anyConnected || syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Sync
          </Button>
          <Button size="sm" onClick={() => setCompose({ subject: '', bodyHtml: '' })} disabled={!anyConnected}>
            <Send className="h-4 w-4 mr-2" /> Compose
          </Button>
        </div>
      </div>

      {status && !anyConnected && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Plug className="h-5 w-5 text-amber-500" />
            <div className="flex-1">
              <p className="font-medium text-amber-600 dark:text-amber-400">No email account connected</p>
              <p className="text-sm text-muted-foreground">Connect Gmail or Outlook to sync mail into this workspace.</p>
            </div>
            <Link href={INTEGRATIONS_PATH[service] || '/dashboard/deals/integrations'}>
              <Button size="sm" variant="outline">Go to Integrations</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* List + reading pane */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* List */}
        <Card className="w-[360px] shrink-0 flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b border-border">
            <form onSubmit={onSearch} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search mail…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 bg-muted/40 border-transparent focus-visible:bg-background" />
            </form>
            {!loading && emails.length > 0 && (
              <div className="flex items-center justify-between mt-2 px-0.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Inbox</span>
                <span className="text-[11px] text-muted-foreground">{emails.length} message{emails.length === 1 ? '' : 's'}</span>
              </div>
            )}
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center px-6">
                <InboxIcon className="h-12 w-12 mb-2 opacity-40" />
                <p className="font-medium">No emails yet</p>
                <p className="text-sm">{anyConnected ? 'Click "Sync" to pull your latest messages.' : 'Connect an account to get started.'}</p>
              </div>
            ) : emails.map((em) => {
              const who = em.direction === 'outbound' ? (em.to_addresses?.[0] || 'Me') : em.from_address;
              const active = selected?.id === em.id;
              const unread = em.direction === 'inbound' && em.is_read === false;
              const snippet = em.body_text?.replace(/\s+/g, ' ').trim().slice(0, 100) || '';
              return (
                <button key={em.id} onClick={() => openEmail(em)}
                  className={cn('group relative w-full text-left flex gap-3 pl-4 pr-3 py-3 border-b border-border/50 transition-colors',
                    active ? 'bg-primary/[0.08]' : 'hover:bg-muted/50')}>
                  {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r" />}
                  <div className="relative shrink-0">
                    {unread && <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />}
                    <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold', avatarColor(who))}>
                      {initialOf(who)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm truncate flex-1', unread ? 'font-bold text-foreground' : 'font-medium text-foreground/90')}>
                        {em.direction === 'outbound' && <ArrowUpRight className="inline h-3 w-3 text-blue-500 mr-0.5 -mt-0.5" />}
                        {displayName(who)}
                      </span>
                      {em.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                      <span className={cn('text-[10px] shrink-0 tabular-nums', unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>{relTime(em.received_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate">
                      <span className={cn('text-[13px]', unread ? 'font-semibold text-foreground' : 'text-foreground/80')}>{em.subject || '(no subject)'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{snippet || ' '}</p>
                    {(em.entity_type || em.deal_id || em.contact_id) && (
                      <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
                        <Link2 className="h-2.5 w-2.5" /> {em.entity_type || (em.deal_id ? 'deal' : 'contact')}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </ScrollArea>
        </Card>

        {/* Reading pane */}
        <Card className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selected ? (
            <>
              {/* Header */}
              <div className="border-b border-border bg-card">
                {/* Subject + status */}
                <div className="flex items-start gap-3 px-6 pt-5">
                  <h2 className="flex-1 text-2xl font-semibold leading-tight tracking-tight">{selected.subject || '(no subject)'}</h2>
                  <div className="flex items-center gap-2 shrink-0 mt-1">
                    {(selected.entity_type || selected.deal_id || selected.contact_id) && (
                      <Badge variant="outline" className="text-primary border-primary/30">
                        <Link2 className="h-3 w-3 mr-1" /> {selected.entity_type || (selected.deal_id ? 'deal' : 'contact')}
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn('gap-1', selected.direction === 'outbound' ? 'text-blue-500 border-blue-500/30' : 'text-emerald-500 border-emerald-500/30')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', selected.direction === 'outbound' ? 'bg-blue-500' : 'bg-emerald-500')} />
                      {selected.direction === 'outbound' ? 'Sent' : 'Received'}
                    </Badge>
                  </div>
                </div>
                {/* Sender + meta */}
                <div className="flex items-center gap-3.5 px-6 py-4">
                  <div className={cn('h-11 w-11 shrink-0 rounded-full ring-2 ring-background shadow-sm flex items-center justify-center text-white text-base font-semibold', avatarColor(selected.from_address))}>
                    {initialOf(selected.from_address)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{displayName(selected.from_address)}</p>
                    <p className="text-xs text-muted-foreground truncate">{parseAddr(selected.from_address).email}</p>
                  </div>
                  <div className="text-right shrink-0 hidden md:block">
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{fmtFull(selected.received_at)}</p>
                    <p className="text-[11px] text-muted-foreground/70 truncate max-w-[280px]">
                      to {(selected.to_addresses || []).map((a) => parseAddr(a).email).join(', ') || '—'}
                    </p>
                  </div>
                </div>
                {/* Action toolbar */}
                <div className="flex items-center gap-2 px-6 pb-3">
                  <Button size="sm" onClick={() => openReply(selected)} disabled={!anyConnected}>
                    <Reply className="h-4 w-4 mr-1.5" /> Reply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openReply(selected, true)} disabled={!anyConnected}>
                    <ReplyAll className="h-4 w-4 mr-1.5" /> Reply all
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openForward(selected)} disabled={!anyConnected}>
                    <Forward className="h-4 w-4 mr-1.5" /> Forward
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setLinkOpen(true)}>
                    <Link2 className="h-4 w-4 mr-1.5" /> {selected.entity_type ? 'Re-link' : 'Link to record'}
                  </Button>
                </div>
              </div>
              {/* Body — the email rendered as a "letter" on a neutral desk, auto-sized to its content */}
              <ScrollArea className="flex-1 bg-muted/50 dark:bg-black/30">
                <div className="px-6 py-6">
                  <div className="mx-auto max-w-[760px] rounded-xl border border-black/5 bg-white shadow-lg overflow-hidden">
                    <EmailBody key={selected.id} html={selected.body_html} text={selected.body_text} />
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Mail className="h-16 w-16 opacity-20 mb-4" />
              <p className="text-lg font-medium">Select an email</p>
              <p className="text-sm">Choose a message to read it here.</p>
            </div>
          )}
        </Card>
      </div>

      <ComposeWindow init={compose} onClose={() => setCompose(null)} provider={provider}
        entityType={entityType} entityId={entityId}
        onSent={() => { setCompose(null); loadEmails(search); }} />

      <LinkEntityDialog open={linkOpen} onClose={() => setLinkOpen(false)} service={service} emailId={selected?.id ?? null}
        onLinked={(et, eid) => {
          setSelected((s) => (s ? { ...s, entity_type: et, entity_id: eid } : s));
          setEmails((list) => list.map((e) => (e.id === selected?.id ? { ...e, entity_type: et, entity_id: eid } : e)));
        }} />
    </div>
  );
}

export default MailInbox;
