'use client';

import { useState, useEffect } from 'react';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import { useToast } from '@/contexts/TenantToastContext';
import {
  changePassword,
  get2FAStatus,
  enable2FA,
  verify2FA,
  disable2FA,
  getActiveSessions,
  revokeSession,
  TenantSession,
} from '@/lib/tenant/api';
import {
  Bell,
  Shield,
  Globe,
  Smartphone,
  Mail,
  Eye,
  EyeOff,
  Trash2,
  Monitor,
  Loader2,
  LogOut,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';

function SettingsContent() {
  const { profile } = usePortal();
  const { addToast } = useToast();

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [paymentReminders, setPaymentReminders] = useState(true);
  const [maintenanceUpdates, setMaintenanceUpdates] = useState(true);
  const [announcements, setAnnouncements] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<'email' | 'sms'>('email');
  const [twoFALoading, setTwoFALoading] = useState(true);
  const [showOTPInput, setShowOTPInput] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);

  const [sessions, setSessions] = useState<TenantSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  const [language, setLanguage] = useState('en');

  useEffect(() => {
    loadTwoFAStatus();
    loadSessions();
  }, []);

  const loadTwoFAStatus = async () => {
    try {
      const status = await get2FAStatus();
      setTwoFAEnabled(status.enabled);
      setTwoFAMethod(status.method as 'email' | 'sms');
    } catch {} finally { setTwoFALoading(false); }
  };

  const loadSessions = async () => {
    try {
      const data = await getActiveSessions();
      setSessions(data);
    } catch {} finally { setSessionsLoading(false); }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) { addToast('error', 'Passwords Don\'t Match', 'Please make sure your passwords match.'); return; }
    if (newPassword.length < 8) { addToast('error', 'Password Too Short', 'Password must be at least 8 characters.'); return; }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      addToast('success', 'Password Changed', 'Your password has been updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      addToast('error', 'Password Change Failed', err.message || 'Could not change password.');
    } finally { setChangingPassword(false); }
  };

  const handleEnable2FA = async () => {
    try {
      await enable2FA(twoFAMethod);
      setShowOTPInput(true);
      addToast('info', 'Code Sent', `A verification code has been sent via ${twoFAMethod}.`);
    } catch (err: any) { addToast('error', 'Failed', err.message); }
  };

  const handleVerify2FA = async () => {
    setVerifying2FA(true);
    try {
      await verify2FA(otpCode, twoFAMethod);
      setTwoFAEnabled(true); setShowOTPInput(false); setOtpCode('');
      addToast('success', '2FA Enabled', 'Two-factor authentication is now active on your account.');
    } catch (err: any) { addToast('error', 'Verification Failed', err.message); }
    finally { setVerifying2FA(false); }
  };

  const handleDisable2FA = async () => {
    setDisabling2FA(true);
    try {
      await disable2FA(disablePassword);
      setTwoFAEnabled(false); setShowDisable2FA(false); setDisablePassword('');
      addToast('success', '2FA Disabled', 'Two-factor authentication has been turned off.');
    } catch (err: any) { addToast('error', 'Failed', err.message); }
    finally { setDisabling2FA(false); }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      addToast('success', 'Session Revoked', 'The session has been terminated.');
    } catch (err: any) { addToast('error', 'Failed', err.message); }
    finally { setRevokingSession(null); }
  };

  const parseDevice = (ua: string | null) => {
    if (!ua) return { device: 'Unknown Device', browser: 'Unknown' };
    const isMobile = /mobile|android|iphone|ipad/i.test(ua);
    const browser = /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : /edge/i.test(ua) ? 'Edge' : 'Browser';
    return { device: isMobile ? 'Mobile' : 'Desktop', browser };
  };

  const formatDate = (d: string) => { try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };

  const Toggle = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-cyan-500' : 'bg-gray-300'}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500 text-sm">Manage your notifications, security, and preferences</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Bell className="w-4 h-4 text-cyan-600" /> Notification Preferences
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center"><Mail className="w-4 h-4 text-blue-600" /></div>
              <div><p className="text-sm font-medium text-gray-900">Email Notifications</p><p className="text-xs text-gray-500">Receive updates via email</p></div>
            </div>
            <Toggle enabled={emailNotifications} onToggle={() => setEmailNotifications(!emailNotifications)} />
          </div>
          <div className="flex items-center justify-between py-1 border-t border-gray-50 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center"><Smartphone className="w-4 h-4 text-green-600" /></div>
              <div><p className="text-sm font-medium text-gray-900">SMS Notifications</p><p className="text-xs text-gray-500">Get text message alerts</p></div>
            </div>
            <Toggle enabled={smsNotifications} onToggle={() => setSmsNotifications(!smsNotifications)} />
          </div>
          <div className="border-t border-gray-100 pt-4 mt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notification Types</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-gray-700">Payment Reminders</span><Toggle enabled={paymentReminders} onToggle={() => setPaymentReminders(!paymentReminders)} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-gray-700">Maintenance Updates</span><Toggle enabled={maintenanceUpdates} onToggle={() => setMaintenanceUpdates(!maintenanceUpdates)} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-gray-700">Building Announcements</span><Toggle enabled={announcements} onToggle={() => setAnnouncements(!announcements)} /></div>
            </div>
          </div>
        </div>
        <button onClick={() => addToast('success', 'Preferences Saved', 'Your notification preferences have been updated.')}
          className="mt-5 w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 transition-colors">
          Save Notification Preferences
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-600" /> Security
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 pr-10" />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
          </div>
          <button onClick={handlePasswordChange} disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
            {changingPassword ? 'Changing Password...' : 'Change Password'}
          </button>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  {twoFAEnabled ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <ShieldOff className="w-4 h-4 text-gray-400" />}
                  Two-Factor Authentication
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{twoFAEnabled ? `Active via ${twoFAMethod}` : 'Add an extra layer of security to your account'}</p>
              </div>
              {twoFALoading ? <Loader2 className="w-4 h-4 text-gray-400 animate-spin" /> : twoFAEnabled ? (
                <button onClick={() => setShowDisable2FA(!showDisable2FA)} className="text-xs font-medium text-red-500 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors">Disable</button>
              ) : (
                <button onClick={handleEnable2FA} className="text-xs font-medium text-cyan-600 bg-cyan-50 px-3 py-1.5 rounded-full hover:bg-cyan-100 transition-colors">Enable</button>
              )}
            </div>

            {!twoFAEnabled && !showOTPInput && (
              <div className="flex gap-2 mb-3">
                <button onClick={() => setTwoFAMethod('email')} className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${twoFAMethod === 'email' ? 'bg-cyan-50 border-cyan-200 text-cyan-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                  <Mail className="w-3.5 h-3.5 inline mr-1.5" /> Email
                </button>
                <button onClick={() => setTwoFAMethod('sms')} className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${twoFAMethod === 'sms' ? 'bg-cyan-50 border-cyan-200 text-cyan-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                  <Smartphone className="w-3.5 h-3.5 inline mr-1.5" /> SMS
                </button>
              </div>
            )}

            {showOTPInput && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 mt-2">
                <p className="text-sm text-cyan-800 mb-3">Enter the 6-digit code sent to your {twoFAMethod}:</p>
                <div className="flex gap-2">
                  <input type="text" value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6}
                    className="flex-1 px-4 py-2.5 border border-cyan-300 rounded-xl text-center text-lg tracking-[0.3em] font-mono focus:ring-2 focus:ring-cyan-500" />
                  <button onClick={handleVerify2FA} disabled={otpCode.length !== 6 || verifying2FA}
                    className="px-4 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
                    {verifying2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                  </button>
                </div>
                <button onClick={() => { setShowOTPInput(false); setOtpCode(''); }} className="text-xs text-gray-500 mt-2 hover:text-gray-700">Cancel</button>
              </div>
            )}

            {showDisable2FA && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-2">
                <p className="text-sm text-red-800 mb-3">Enter your password to disable 2FA:</p>
                <div className="flex gap-2">
                  <input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} placeholder="Your password"
                    className="flex-1 px-4 py-2.5 border border-red-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                  <button onClick={handleDisable2FA} disabled={!disablePassword || disabling2FA}
                    className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:bg-gray-300">
                    {disabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                  </button>
                </div>
                <button onClick={() => { setShowDisable2FA(false); setDisablePassword(''); }} className="text-xs text-gray-500 mt-2 hover:text-gray-700">Cancel</button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><Monitor className="w-4 h-4 text-gray-600" /> Active Sessions</p>
                <p className="text-xs text-gray-500 mt-0.5">Manage your logged-in devices</p>
              </div>
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">{sessions.length} active</span>
            </div>

            {sessionsLoading ? (
              <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
            ) : sessions.length > 0 ? (
              <div className="space-y-2">
                {sessions.map((session) => {
                  const { device, browser } = parseDevice(session.userAgent);
                  return (
                    <div key={session.id} className={`flex items-center justify-between p-3 rounded-xl border ${session.isCurrent ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${session.isCurrent ? 'bg-green-100' : 'bg-gray-200'}`}>
                          {device === 'Mobile' ? <Smartphone className="w-4 h-4 text-gray-600" /> : <Monitor className="w-4 h-4 text-gray-600" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {browser} on {device}
                            {session.isCurrent && <span className="text-[10px] font-semibold text-green-700 bg-green-200 px-1.5 py-0.5 rounded-full">Current</span>}
                          </p>
                          <p className="text-xs text-gray-500">{session.ipAddress || 'Unknown IP'} &middot; {session.authMethod} &middot; Last active {formatDate(session.lastUsedAt)}</p>
                        </div>
                      </div>
                      {!session.isCurrent && (
                        <button onClick={() => handleRevokeSession(session.id)} disabled={revokingSession === session.id}
                          className="text-xs font-medium text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                          {revokingSession === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3">No active sessions found</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-600" /> Preferences
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-gray-900">Language</p><p className="text-xs text-gray-500">Choose your preferred language</p></div>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500">
              <option value="en">English</option><option value="tw">Twi</option><option value="ga">Ga</option><option value="ee">Ewe</option>
            </select>
          </div>
          <div className="flex items-center justify-between border-t border-gray-50 pt-4">
            <div><p className="text-sm font-medium text-gray-900">Currency Display</p><p className="text-xs text-gray-500">How payments are shown</p></div>
            <span className="text-sm font-medium text-gray-600">GHS (₵)</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-red-600 mb-4 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Danger Zone</h3>
        <p className="text-sm text-gray-500 mb-4">Request deletion of your account. This action is irreversible and must be approved by your property manager.</p>
        <button onClick={() => addToast('info', 'Contact Support', 'Please contact your property manager to request account deletion.')}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors">
          Request Account Deletion
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PortalShell title="Settings">
      <SettingsContent />
    </PortalShell>
  );
}
