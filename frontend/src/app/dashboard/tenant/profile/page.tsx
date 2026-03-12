'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import { getTenantProfile, updateTenantProfile, TenantProfile } from '@/lib/tenant/api';
import { useToast } from '@/contexts/TenantToastContext';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Edit2,
  Save,
  X,
  Loader2,
  Building2,
  Shield,
  Hash,
  CreditCard,
  Settings,
} from 'lucide-react';

function ProfileContent() {
  const { profile, activeTenancy } = usePortal();
  const { addToast } = useToast();
  const [tenantProfile, setTenantProfile] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ phoneSecondary: '', currentAddress: '' });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await getTenantProfile();
      setTenantProfile(data);
      setForm({
        phoneSecondary: data.phoneSecondary || '',
        currentAddress: data.currentAddress || '',
      });
    } catch {
      addToast('error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTenantProfile(form);
      addToast('success', 'Profile updated successfully');
      setEditing(false);
      loadProfile();
    } catch {
      addToast('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    if (tenantProfile) {
      setForm({
        phoneSecondary: tenantProfile.phoneSecondary || '',
        currentAddress: tenantProfile.currentAddress || '',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold">
              {(profile?.fullName?.[0] || '').toUpperCase()}
            </div>
            <div className="text-white">
              <h2 className="text-xl font-bold">{profile?.fullName}</h2>
              <p className="text-cyan-100 text-sm">{profile?.email}</p>
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium text-white">
                <Shield className="w-3 h-3" /> Tenant
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Personal Information</h3>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700 font-medium">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleCancel} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700 font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
              </button>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <User className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Full Name</p>
                <p className="text-sm font-medium text-gray-900">{profile?.fullName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Mail className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm font-medium text-gray-900">{profile?.email}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Phone className="w-4 h-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">Secondary Phone</p>
                {editing ? (
                  <input type="tel" value={form.phoneSecondary} onChange={e => setForm({ ...form, phoneSecondary: e.target.value })}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 mt-0.5 focus:ring-2 focus:ring-cyan-500" />
                ) : (
                  <p className="text-sm font-medium text-gray-900">{tenantProfile?.phoneSecondary || '—'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Member Since</p>
                <p className="text-sm font-medium text-gray-900">
                  {tenantProfile?.createdAt ? new Date(tenantProfile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Contact Info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Additional Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <MapPin className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-400">Current Address</p>
              {editing ? (
                <input type="text" value={form.currentAddress} onChange={e => setForm({ ...form, currentAddress: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 mt-0.5 focus:ring-2 focus:ring-cyan-500" />
              ) : (
                <p className="text-sm font-medium text-gray-900">{tenantProfile?.currentAddress || '—'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <User className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Occupation</p>
              <p className="text-sm font-medium text-gray-900">{tenantProfile?.occupation || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tenancy Details */}
      {activeTenancy && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Current Tenancy</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Building2 className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Property</p>
                  <p className="text-sm font-medium text-gray-900">{activeTenancy.propertyTitle || 'Property'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <MapPin className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Unit</p>
                  <p className="text-sm font-medium text-gray-900">{activeTenancy.propertyAddress || '—'}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Hash className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Lease Status</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">{activeTenancy.status || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Monthly Rent</p>
                  <p className="text-sm font-medium text-gray-900">
                    {activeTenancy.rentAmount ? `${activeTenancy.rentCurrency || 'GHS'} ${activeTenancy.rentAmount.toLocaleString()}` : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/tenant/settings"
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors">
          <Settings className="w-4 h-4" /> Account Settings
        </Link>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <PortalShell title="Profile">
      <ProfileContent />
    </PortalShell>
  );
}
