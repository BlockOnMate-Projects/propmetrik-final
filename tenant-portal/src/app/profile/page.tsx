'use client';

import { useEffect, useState } from 'react';
import PortalShell, { usePortal } from '@/components/portal/PortalShell';
import { useToast } from '@/contexts/ToastContext';
import { updateTenantProfile } from '@/lib/api';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  Shield,
  Edit3,
  Save,
  X,
  Briefcase,
  Home,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

function ProfileContent() {
  const { profile, activeTenancy, refreshProfile } = usePortal();
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [email, setEmail] = useState('');
  const [phoneSecondary, setPhoneSecondary] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');

  useEffect(() => {
    if (profile) {
      setEmail(profile.email || '');
      setPhoneSecondary(profile.phoneSecondary || '');
      setCurrentAddress(profile.currentAddress || '');
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTenantProfile({ email, phoneSecondary, currentAddress });
      await refreshProfile();
      setEditing(false);
      addToast('success', 'Profile Updated', 'Your profile has been saved successfully.');
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    if (profile) {
      setEmail(profile.email || '');
      setPhoneSecondary(profile.phoneSecondary || '');
      setCurrentAddress(profile.currentAddress || '');
    }
  };

  const firstName = profile?.fullName?.split(' ')[0] || 'Tenant';
  const initials = profile?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'T';

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Profile Header Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-cyan-500 to-cyan-600 relative">
          <div className="absolute -bottom-10 left-6">
            <div className="w-20 h-20 bg-white rounded-2xl shadow-lg flex items-center justify-center border-4 border-white">
              <span className="text-2xl font-bold text-cyan-600">{initials}</span>
            </div>
          </div>
        </div>
        <div className="pt-14 pb-6 px-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{profile?.fullName}</h2>
              <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5" /> {profile?.email}
              </p>
            </div>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-xl transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-300 rounded-xl transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {/* Verification Status */}
          <div className="flex items-center gap-2 mt-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" /> Verified Tenant
            </div>
            {activeTenancy && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs font-medium">
                <Home className="w-3 h-3" /> Active Lease
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <User className="w-4 h-4 text-cyan-600" /> Personal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
            <p className="text-sm text-gray-900 font-medium">{profile?.fullName || '—'}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
            {editing ? (
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            ) : (
              <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-gray-400" /> {profile?.email || '—'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Primary Phone</label>
            <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400" /> {profile?.phone || '—'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Secondary Phone</label>
            {editing ? (
              <input
                type="tel"
                value={phoneSecondary}
                onChange={e => setPhoneSecondary(e.target.value)}
                placeholder="+233 XX XXX XXXX"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            ) : (
              <p className="text-sm text-gray-900 font-medium">{profile?.phoneSecondary || '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Occupation</label>
            <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-gray-400" /> {profile?.occupation || '—'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Digital Address</label>
            <p className="text-sm text-gray-900 font-medium">{profile?.digitalAddress || '—'}</p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Current Address</label>
            {editing ? (
              <textarea
                value={currentAddress}
                onChange={e => setCurrentAddress(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            ) : (
              <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" /> {profile?.currentAddress || '—'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Active Tenancy */}
      {activeTenancy && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-600" /> Active Tenancy
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Property</label>
              <p className="text-sm text-gray-900 font-medium">{activeTenancy.propertyTitle}</p>
              <p className="text-xs text-gray-500 mt-0.5">{activeTenancy.propertyAddress}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Monthly Rent</label>
              <p className="text-sm text-gray-900 font-medium">
                {activeTenancy.rentCurrency} {activeTenancy.rentAmount.toLocaleString()}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Lease Start</label>
              <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                {new Date(activeTenancy.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Lease End</label>
              <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                {new Date(activeTenancy.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                activeTenancy.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                activeTenancy.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {activeTenancy.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {activeTenancy.status.charAt(0).toUpperCase() + activeTenancy.status.slice(1)}
              </span>
            </div>
          </div>

          {/* Lease Progress */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Lease Progress</span>
              <span>
                {(() => {
                  const total = new Date(activeTenancy.endDate).getTime() - new Date(activeTenancy.startDate).getTime();
                  const elapsed = Date.now() - new Date(activeTenancy.startDate).getTime();
                  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
                })()}% elapsed
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-cyan-400 to-cyan-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, Math.round(
                    ((Date.now() - new Date(activeTenancy.startDate).getTime()) /
                      (new Date(activeTenancy.endDate).getTime() - new Date(activeTenancy.startDate).getTime())) * 100
                  )))}%`
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Security */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-600" /> Security
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-900">Password</p>
              <p className="text-xs text-gray-500">Last changed: Unknown</p>
            </div>
            <a
              href="/settings"
              className="text-sm font-medium text-cyan-600 hover:text-cyan-700"
            >
              Change
            </a>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
              <p className="text-xs text-gray-500">Add extra security to your account</p>
            </div>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">Coming Soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <PortalShell title="My Profile">
      <ProfileContent />
    </PortalShell>
  );
}
