'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import { createMaintenanceRequest } from '@/lib/tenant/api';
import { useToast } from '@/contexts/TenantToastContext';
import {
  ArrowLeft,
  Upload,
  X,
  Loader2,
  Camera,
  AlertTriangle,
  Wrench,
  Zap,
  Droplets,
  Wind,
  Bug,
  Lock,
  Home,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing', icon: Droplets, color: 'text-blue-600 bg-blue-50' },
  { value: 'electrical', label: 'Electrical', icon: Zap, color: 'text-amber-600 bg-amber-50' },
  { value: 'hvac', label: 'HVAC', icon: Wind, color: 'text-cyan-600 bg-cyan-50' },
  { value: 'appliance', label: 'Appliance', icon: Home, color: 'text-purple-600 bg-purple-50' },
  { value: 'pest', label: 'Pest Control', icon: Bug, color: 'text-red-600 bg-red-50' },
  { value: 'security', label: 'Security', icon: Lock, color: 'text-muted-foreground bg-muted' },
  { value: 'general', label: 'General', icon: Wrench, color: 'text-muted-foreground bg-muted' },
  { value: 'other', label: 'Other', icon: AlertTriangle, color: 'text-orange-600 bg-orange-50' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', desc: 'Minor issue, no urgency', color: 'border-gray-300 bg-muted' },
  { value: 'medium', label: 'Medium', desc: 'Needs attention soon', color: 'border-amber-300 bg-amber-50' },
  { value: 'high', label: 'High', desc: 'Important, needs quick fix', color: 'border-orange-300 bg-orange-50' },
  { value: 'urgent', label: 'Urgent', desc: 'Emergency, immediate action', color: 'border-red-300 bg-red-50' },
];

const T = '/dashboard/tenant';

function NewMaintenanceContent() {
  const router = useRouter();
  const { activeTenancy } = usePortal();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'medium',
    preferredDate: '',
    preferredTime: '',
    permissionToEnter: false,
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const handlePhotoAdd = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - photos.length);
    setPhotos(prev => [...prev, ...newFiles]);
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoRemove = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.category || !activeTenancy) return;
    setSubmitting(true);
    try {
      await createMaintenanceRequest(activeTenancy.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority as 'low' | 'medium' | 'high' | 'emergency',
        preferredTimeSlot: form.preferredTime || undefined,
        images: photos.length > 0 ? photos : undefined,
      });
      addToast('success', 'Maintenance request submitted');
      router.push(`${T}/maintenance?success=true`);
    } catch {
      addToast('error', 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-2xl">
      <Link href={`${T}/maintenance`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-700 font-medium mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Maintenance
      </Link>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Category */}
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">What type of issue?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <button key={cat.value} type="button" onClick={() => setForm({ ...form, category: cat.value })}
                  className={`p-3 rounded-xl border-2 transition-all text-center ${form.category === cat.value ? 'border-cyan-500 bg-cyan-50' : 'border-gray-100 hover:border-border'}`}>
                  <div className={`w-8 h-8 rounded-lg ${cat.color} flex items-center justify-center mx-auto mb-1.5`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-gray-700">{cat.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Details */}
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Describe the issue</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title *</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Leaking kitchen faucet" required
              className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Provide details about the issue, when it started, and any steps you've already taken..."
              rows={4} className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 resize-none" />
          </div>
        </div>

        {/* Priority */}
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Priority</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRIORITIES.map(p => (
              <button key={p.value} type="button" onClick={() => setForm({ ...form, priority: p.value })}
                className={`p-3 rounded-xl border-2 transition-all text-left ${form.priority === p.value ? 'border-cyan-500 bg-cyan-50' : `${p.color} border-transparent`}`}>
                <p className="text-sm font-medium text-gray-900">{p.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Photos (optional)</h3>
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => handlePhotoRemove(i)}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-foreground rounded-full">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-cyan-400 hover:text-cyan-500 transition-colors">
                <Camera className="w-5 h-5" />
                <span className="text-[9px] mt-0.5">Add</span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handlePhotoAdd(e.target.files)} />
          <p className="text-xs text-muted-foreground mt-2">Up to 5 photos. JPG or PNG.</p>
        </div>

        {/* Scheduling */}
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Scheduling (optional)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred Date</label>
              <input type="date" value={form.preferredDate} onChange={e => setForm({ ...form, preferredDate: e.target.value })}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred Time</label>
              <select value={form.preferredTime} onChange={e => setForm({ ...form, preferredTime: e.target.value })}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm bg-card focus:ring-2 focus:ring-cyan-500 appearance-none">
                <option value="">Any time</option>
                <option value="morning">Morning (8am - 12pm)</option>
                <option value="afternoon">Afternoon (12pm - 5pm)</option>
                <option value="evening">Evening (5pm - 8pm)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.permissionToEnter} onChange={e => setForm({ ...form, permissionToEnter: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
            <span className="text-sm text-gray-700">Permission to enter unit when I&apos;m not home</span>
          </label>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Link href={`${T}/maintenance`} className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900">Cancel</Link>
          <button type="submit" disabled={!form.title.trim() || !form.category || submitting}
            className="px-6 py-2.5 bg-cyan-600 text-foreground rounded-xl text-sm font-medium hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
            {submitting ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</span> : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewMaintenancePage() {
  return (
    <PortalShell title="New Maintenance Request">
      <NewMaintenanceContent />
    </PortalShell>
  );
}
