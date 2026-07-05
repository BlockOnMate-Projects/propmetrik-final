'use client';

/**
 * CompanyBrandingSettings — per-service company branding editor.
 *
 * Reused in each service's Settings (valuation, property_management, crm,
 * project_management). Edits THAT service's brand (name/logo/palette/address/
 * credentials) which flows into that service's documents, invoices, and emails.
 */
import { useEffect, useRef, useState } from 'react';
import { Upload, Save, Loader2, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  BrandingService,
  ServiceBranding,
  getBranding,
  saveBranding,
  uploadBrandingLogo,
} from '@/lib/branding-api';

const SERVICE_LABEL: Record<BrandingService, string> = {
  valuation: 'valuation reports & invoices',
  property_management: 'leases, tenant invoices & notices',
  crm: 'deal documents & client emails',
  project_management: 'project invoices, reports & contracts',
};

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500';
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide';

export function CompanyBrandingSettings({ service }: { service: BrandingService }) {
  const { toast } = useToast();
  const [form, setForm] = useState<ServiceBranding>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await getBranding(service);
        if (alive) setForm(b || {});
      } catch {
        if (alive) toast({ title: 'Could not load branding', variant: 'destructive' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  const set = (k: keyof ServiceBranding, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    setSaving(true);
    try {
      const b = await saveBranding(service, form);
      setForm(b);
      toast({ title: 'Branding saved', description: 'Your company branding has been updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      toast({ title: 'Use a PNG or JPEG logo', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const { logo_url } = await uploadBrandingLogo(service, file);
      setForm((f) => ({ ...f, logo_url }));
      toast({ title: 'Logo uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading branding…
      </div>
    );
  }

  const primary = form.primary_color || '#18181B';
  const accent = form.accent_color || '#F59E0B';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-base font-semibold text-foreground">Company Branding</h3>
        <p className="text-sm text-muted-foreground">
          Your logo, name and colours flow through to your {SERVICE_LABEL[service]}.
        </p>
      </div>

      {/* Live letterhead preview */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4" style={{ background: primary }}>
          {form.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo_url} alt="logo" className="h-10 w-auto max-w-[140px] object-contain bg-white/5 rounded" />
          ) : (
            <div className="h-10 w-10 rounded flex items-center justify-center" style={{ background: accent }}>
              <Building2 className="w-5 h-5" style={{ color: '#fff' }} />
            </div>
          )}
          <div>
            <div className="font-semibold text-white leading-tight">{form.name || 'Your Company'}</div>
            {form.tagline && <div className="text-[11px] text-white/70">{form.tagline}</div>}
          </div>
          <div className="ml-auto h-1.5 w-16 rounded-full" style={{ background: accent }} />
        </div>
      </div>

      {/* Logo upload */}
      <div>
        <label className={labelCls}>Logo (PNG or JPEG)</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-muted disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {form.logo_url ? 'Replace logo' : 'Upload logo'}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} />
          <span className="text-xs text-muted-foreground">Appears on documents, invoices & emails.</span>
        </div>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Company / Firm Name</label>
          <input className={inputCls} value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Acme Realty Ltd." />
        </div>
        <div>
          <label className={labelCls}>Tagline</label>
          <input className={inputCls} value={form.tagline || ''} onChange={(e) => set('tagline', e.target.value)} placeholder="Trusted property partners" />
        </div>
      </div>

      {/* Palette */}
      <div>
        <label className={labelCls}>Brand Colours</label>
        <div className="grid grid-cols-3 gap-4">
          {([['primary_color', 'Primary', primary], ['accent_color', 'Accent', accent], ['secondary_color', 'Secondary', form.secondary_color || '#334155']] as const).map(
            ([key, lbl, val]) => (
              <div key={key} className="flex items-center gap-2">
                <input type="color" value={val} onChange={(e) => set(key, e.target.value)} className="h-9 w-10 rounded border border-border bg-transparent cursor-pointer" />
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">{lbl}</div>
                  <input className={inputCls + ' !py-1 !px-2 font-mono text-xs'} value={val} onChange={(e) => set(key, e.target.value)} />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Professional Body</label>
          <input className={inputCls} value={form.professional_body || ''} onChange={(e) => set('professional_body', e.target.value)} placeholder="GhIS / RICS" />
        </div>
        <div>
          <label className={labelCls}>License / Reg. No.</label>
          <input className={inputCls} value={form.license_number || ''} onChange={(e) => set('license_number', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Tax ID (TIN)</label>
          <input className={inputCls} value={form.tax_id || ''} onChange={(e) => set('tax_id', e.target.value)} />
        </div>
      </div>

      {/* Address */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Address Line 1</label>
          <input className={inputCls} value={form.address_line1 || ''} onChange={(e) => set('address_line1', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Address Line 2</label>
          <input className={inputCls} value={form.address_line2 || ''} onChange={(e) => set('address_line2', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>City</label>
          <input className={inputCls} value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Region</label>
          <input className={inputCls} value={form.region || ''} onChange={(e) => set('region', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <input className={inputCls} value={form.country || ''} onChange={(e) => set('country', e.target.value)} placeholder="Ghana" />
        </div>
        <div>
          <label className={labelCls}>Postal Code</label>
          <input className={inputCls} value={form.postal_code || ''} onChange={(e) => set('postal_code', e.target.value)} />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Phone</label>
          <input className={inputCls} value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input className={inputCls} value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Website</label>
          <input className={inputCls} value={form.website || ''} onChange={(e) => set('website', e.target.value)} />
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-medium text-sm hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Branding
        </button>
      </div>
    </div>
  );
}

export default CompanyBrandingSettings;
