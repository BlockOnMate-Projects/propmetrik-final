'use client';

/**
 * ValuerProfessionalProfile — the individual valuer's signing credentials
 * (name, title, qualifications, license, PI insurance, contact). These flow onto
 * signed valuation reports, so they live in Valuation → Settings (not the generic
 * user-menu profile). Self-contained: loads + saves the valuer record itself.
 */
import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { Loader2, Save } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2 bg-muted border border-border font-mono text-sm text-foreground focus:border-amber-500 focus:outline-none';
const labelCls = 'block font-mono text-[10px] text-muted-foreground mb-1';

const EMPTY = {
  name: '', title: '', qualifications: '',
  license_number: '', license_issuer: '', license_valid_until: '',
  pi_provider: '', pi_policy_number: '', pi_coverage: '', pi_valid_until: '',
  contact_address: '', contact_email: '', contact_phone: '', company_name: '',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border">
      <div className="px-4 py-2 border-b border-border font-mono text-[11px] text-amber-500 tracking-wide">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function ValuerProfessionalProfile() {
  const [form, setForm] = useState({ ...EMPTY });
  const [valuerId, setValuerId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const prof = await authedFetch('/api/user/profile').then((r) => r.json()).catch(() => null);
        const p = prof?.profile;
        if (!alive || !p?.id) { setLoading(false); return; }
        setUserId(p.id);
        const v = await authedFetch(`/api/valuers/user/${p.id}`).then((r) => r.json()).catch(() => null);
        if (!alive) return;
        if (v && v.id) {
          setValuerId(v.id);
          setForm({
            name: v.name || '', title: v.title || '', qualifications: v.qualifications || '',
            license_number: v.license_number || '', license_issuer: v.license_issuer || '',
            license_valid_until: v.license_valid_until ? v.license_valid_until.split('T')[0] : '',
            pi_provider: v.pi_provider || '', pi_policy_number: v.pi_policy_number || '',
            pi_coverage: v.pi_coverage || '', pi_valid_until: v.pi_valid_until ? v.pi_valid_until.split('T')[0] : '',
            contact_address: v.contact_address || '', contact_email: v.contact_email || '',
            contact_phone: v.contact_phone || '', company_name: v.company_name || '',
          });
        } else {
          // Pre-fill from the user profile so the form isn't blank.
          setForm((f) => ({
            ...f,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            contact_email: p.email || '',
            contact_phone: p.phone || '',
            company_name: p.organization?.name || '',
          }));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setMsg(null);
    if (!form.name.trim()) { setMsg({ text: 'Name is required', type: 'error' }); return; }
    setSaving(true);
    try {
      const res = valuerId
        ? await authedFetch(`/api/valuers/${valuerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await authedFetch('/api/valuers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, user_id: userId }) });
      const data = await res.json();
      if (res.ok) {
        if (data.id) setValuerId(data.id);
        setMsg({ text: 'Professional details saved', type: 'success' });
      } else {
        const details = data.details ? `: ${data.details.join(', ')}` : '';
        setMsg({ text: (data.message || 'Failed to save') + details, type: 'error' });
      }
    } catch {
      setMsg({ text: 'Network error', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="font-mono text-sm text-foreground">MY PROFESSIONAL PROFILE</h3>
        <p className="text-xs text-muted-foreground">Your signing credentials — these appear on signed valuation reports.</p>
      </div>

      {msg && (
        <div className={`px-3 py-2 border font-mono text-xs ${msg.type === 'success' ? 'border-green-700 text-green-500' : 'border-red-700 text-red-500'}`}>{msg.text}</div>
      )}
      {!valuerId && (
        <div className="px-3 py-2 bg-amber-100 dark:bg-amber-900/20 border border-amber-800 font-mono text-xs text-amber-600 dark:text-amber-400">
          No professional profile yet. Complete the form to create your valuer profile.
        </div>
      )}

      <Panel title="PROFESSIONAL CREDENTIALS">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>FULL NAME *</label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Eric Danso" /></div>
          <div><label className={labelCls}>PROFESSIONAL TITLE</label><input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Estate Valuer" /></div>
        </div>
        <div className="mt-4"><label className={labelCls}>QUALIFICATIONS</label><input className={inputCls} value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} placeholder="e.g. BSc Land Economy, MGhIS" /></div>
        <div className="mt-4"><label className={labelCls}>COMPANY / FIRM NAME</label><input className={inputCls} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} /></div>
      </Panel>

      <Panel title="LICENSE & REGISTRATION">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>LICENSE NUMBER *</label><input className={inputCls} value={form.license_number} onChange={(e) => set('license_number', e.target.value)} placeholder="e.g. GhIS/LV/2024/001" /></div>
          <div><label className={labelCls}>LICENSE ISSUER</label><input className={inputCls} value={form.license_issuer} onChange={(e) => set('license_issuer', e.target.value)} placeholder="e.g. GhIS, RICS" /></div>
        </div>
        <div className="mt-4"><label className={labelCls}>LICENSE VALID UNTIL *</label><input type="date" className={inputCls} value={form.license_valid_until} onChange={(e) => set('license_valid_until', e.target.value)} /></div>
      </Panel>

      <Panel title="PROFESSIONAL INDEMNITY INSURANCE">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>PI PROVIDER</label><input className={inputCls} value={form.pi_provider} onChange={(e) => set('pi_provider', e.target.value)} placeholder="e.g. SIC Insurance" /></div>
          <div><label className={labelCls}>POLICY NUMBER</label><input className={inputCls} value={form.pi_policy_number} onChange={(e) => set('pi_policy_number', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div><label className={labelCls}>COVERAGE AMOUNT</label><input className={inputCls} value={form.pi_coverage} onChange={(e) => set('pi_coverage', e.target.value)} placeholder="e.g. GHS 500,000" /></div>
          <div><label className={labelCls}>PI VALID UNTIL</label><input type="date" className={inputCls} value={form.pi_valid_until} onChange={(e) => set('pi_valid_until', e.target.value)} /></div>
        </div>
      </Panel>

      <Panel title="CONTACT DETAILS">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>CONTACT EMAIL *</label><input type="email" className={inputCls} value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} /></div>
          <div><label className={labelCls}>CONTACT PHONE</label><input type="tel" className={inputCls} value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} /></div>
        </div>
        <div className="mt-4"><label className={labelCls}>OFFICE ADDRESS</label><input className={inputCls} value={form.contact_address} onChange={(e) => set('contact_address', e.target.value)} /></div>
      </Panel>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {valuerId ? 'UPDATE PROFESSIONAL DETAILS' : 'CREATE PROFESSIONAL PROFILE'}
        </button>
        <span className="font-mono text-[10px] text-muted-foreground">* Required for report signing</span>
      </div>
    </div>
  );
}

export default ValuerProfessionalProfile;
