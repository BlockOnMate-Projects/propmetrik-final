'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import { useToast } from '@/contexts/TenantToastContext';
import {
  getPaymentSummary,
  getRentSchedules,
  getPaymentHistory,
  initiatePayment,
  calculateFee,
  getUtilityCharges,
  disputeUtilityCharge,
  PaymentSummary,
  RentSchedule,
  PaymentHistory,
  UtilityCharge,
  FeeBreakdown,
} from '@/lib/tenant/api';
import dynamic from 'next/dynamic';

const CryptoPaymentFlow = dynamic(() => import('@/components/tenant/CryptoPaymentFlow'), { ssr: false });
import {
  CreditCard,
  Download,
  Filter,
  Smartphone,
  Building2,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  RefreshCw,
  X,
  ChevronDown,
  Receipt,
  ArrowRight,
  Zap,
  Droplets,
  Flame,
  Wifi,
  Trash2,
  Shield,
  MessageSquare,
  Wallet,
} from 'lucide-react';

function PaymentsContent() {
  const { profile, activeTenancy } = usePortal();
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const paymentToastShown = useRef(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'autopay'>('overview');
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [schedules, setSchedules] = useState<RentSchedule[]>([]);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'bank' | 'card' | 'qr' | 'usdt'>('momo');
  const [momoProvider, setMomoProvider] = useState('mtn');
  const [momoPhone, setMomoPhone] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'form' | 'processing' | 'success' | 'failed'>('form');

  const [utilityCharges, setUtilityCharges] = useState<UtilityCharge[]>([]);
  const [disputeChargeId, setDisputeChargeId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeLoading, setDisputeLoading] = useState(false);

  const [autoPayEnabled, setAutoPayEnabled] = useState(false);
  const [autoPayDay, setAutoPayDay] = useState('5');
  const [autoPayMethod, setAutoPayMethod] = useState('mtn');
  const [autoPayPhone, setAutoPayPhone] = useState('');

  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const feeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (feeDebounceRef.current) clearTimeout(feeDebounceRef.current);
    const amt = parseFloat(paymentAmount);
    if (!activeTenancy || !amt || amt <= 0) { setFeeBreakdown(null); return; }
    setFeeLoading(true);
    feeDebounceRef.current = setTimeout(() => {
      calculateFee(activeTenancy.id, amt)
        .then(setFeeBreakdown)
        .catch(() => setFeeBreakdown(null))
        .finally(() => setFeeLoading(false));
    }, 400);
    return () => { if (feeDebounceRef.current) clearTimeout(feeDebounceRef.current); };
  }, [paymentAmount, activeTenancy]);

  useEffect(() => {
    if (!activeTenancy) { setLoading(false); return; }
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success' && !paymentToastShown.current) {
      paymentToastShown.current = true;
      addToast('success', 'Payment Successful', 'Your rent payment has been confirmed and recorded.');
    }
    Promise.all([
      getPaymentSummary(activeTenancy.id).catch(() => null),
      getRentSchedules(activeTenancy.id).catch(() => []),
      getPaymentHistory(activeTenancy.id).catch(() => []),
      getUtilityCharges(activeTenancy.id).catch(() => ({ charges: [] })),
    ]).then(([sum, sched, hist, utilRes]) => {
      setSummary(sum);
      setSchedules(sched);
      setHistory(hist);
      setUtilityCharges((utilRes as any)?.charges || []);
      if (sum?.nextPaymentDue) {
        setPaymentAmount(sum.nextPaymentDue.amount.toString());
      } else if (activeTenancy.rentAmount) {
        setPaymentAmount(activeTenancy.rentAmount.toString());
      }
    }).finally(() => setLoading(false));
  }, [activeTenancy]);

  const handleInitiatePayment = async () => {
    if (!activeTenancy || !paymentAmount) return;
    setPaymentLoading(true);
    setPaymentStep('processing');
    try {
      const channel = paymentMethod === 'momo' ? 'mobile_money' : 'card';
      const result = await initiatePayment(activeTenancy.id, parseFloat(paymentAmount), undefined, channel);
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
      } else {
        setTimeout(() => {
          setPaymentStep('success');
          addToast('success', 'Payment Received!', feeBreakdown ? `${feeBreakdown.currency} ${feeBreakdown.totalCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })} paid successfully.` : 'Payment completed successfully.');
        }, 3000);
      }
    } catch (err: any) {
      setPaymentStep('failed');
      addToast('error', 'Payment Failed', err.message || 'Please try again or use a different payment method.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const resetPaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentStep('form');
    setPaymentLoading(false);
    setMomoPhone('');
    setFeeBreakdown(null);
  };

  const currency = summary?.currency || activeTenancy?.rentCurrency || 'GHS';

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'history' as const, label: 'History' },
    { key: 'autopay' as const, label: 'Auto-Pay' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payments & Billing</h2>
          <p className="text-gray-500 text-sm">Manage your rent payments and billing</p>
        </div>
        <button
          onClick={() => setShowPaymentModal(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl font-medium shadow-sm hover:shadow-md hover:from-cyan-600 hover:to-cyan-700 transition-all"
        >
          <CreditCard className="w-4 h-4" /> Pay Rent
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Expected</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{currency} {(summary?.totalExpected || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Paid</p>
              <p className="text-2xl font-bold text-emerald-600 mt-2">{currency} {(summary?.totalPaid || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outstanding</p>
              <p className={`text-2xl font-bold mt-2 ${(summary?.totalOutstanding || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {currency} {(summary?.totalOutstanding || 0).toLocaleString()}
              </p>
            </div>
          </div>

          {activeTenancy && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Rent Breakdown</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Base Rent</span>
                  <span className="text-sm font-semibold text-gray-900">{currency} {activeTenancy.rentAmount.toLocaleString()}</span>
                </div>
                <div className="border-t border-dashed border-gray-200 pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">Total Due</span>
                  <span className="text-base font-bold text-gray-900">{currency} {activeTenancy.rentAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {schedules.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h3 className="font-semibold text-gray-900">Rent Schedule</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {schedules.slice(0, 6).map(sched => (
                  <div key={sched.id} className="px-6 py-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(sched.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500">
                        Due: {new Date(sched.dueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{currency} {sched.amountDue.toLocaleString()}</p>
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                        sched.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                        sched.status === 'overdue' ? 'bg-red-50 text-red-700' :
                        sched.status === 'partially_paid' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {sched.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {utilityCharges.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Utility Charges</h3>
                <span className="text-xs text-gray-500">{utilityCharges.length} charge{utilityCharges.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {utilityCharges.map(charge => {
                  const iconMap: Record<string, typeof Zap> = { electricity: Zap, water: Droplets, gas: Flame, internet: Wifi, waste: Trash2, security: Shield };
                  const Icon = iconMap[charge.utility_type] || Zap;
                  return (
                    <div key={charge.id} className="px-6 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center">
                          <Icon className="w-4 h-4 text-cyan-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">{charge.utility_type.replace('_', ' ')}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(charge.billing_period_start).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                            {' — '}
                            {new Date(charge.billing_period_end).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">{charge.currency} {Number(charge.amount).toLocaleString()}</p>
                          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                            charge.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                            charge.status === 'applied' ? 'bg-blue-50 text-blue-700' :
                            charge.status === 'disputed' ? 'bg-orange-50 text-orange-700' :
                            charge.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {charge.status}
                          </span>
                        </div>
                        {(charge.status === 'pending' || charge.status === 'applied') && (
                          <button
                            onClick={() => { setDisputeChargeId(charge.id); setDisputeReason(''); }}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition-colors"
                            title="Dispute this charge"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase">Total Utility Charges</span>
                <span className="text-sm font-bold text-gray-900">
                  {currency} {utilityCharges.filter(c => c.status !== 'waived').reduce((s, c) => s + Number(c.amount), 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Filter className="w-3.5 h-3.5" /> Filter
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>

          {history.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map(payment => (
                      <tr key={payment.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-3.5 text-sm text-gray-900">{new Date(payment.paymentDate).toLocaleDateString('en-GB')}</td>
                        <td className="px-6 py-3.5 text-sm font-semibold text-gray-900">{currency} {payment.paymentAmount.toLocaleString()}</td>
                        <td className="px-6 py-3.5 text-sm text-gray-600">{payment.paymentMethod}</td>
                        <td className="px-6 py-3.5 text-sm text-gray-500 font-mono text-xs">{payment.reference}</td>
                        <td className="px-6 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            payment.status === 'success' || payment.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                            payment.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          }`}>
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <button className="text-cyan-600 hover:text-cyan-700">
                            <Receipt className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden divide-y divide-gray-50">
                {history.map(payment => (
                  <div key={payment.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">{currency} {payment.paymentAmount.toLocaleString()}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        payment.status === 'success' || payment.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        payment.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                      }`}>{payment.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(payment.paymentDate).toLocaleDateString('en-GB')} • {payment.paymentMethod}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">No payment history yet</p>
              <p className="text-xs text-gray-400 mt-1">Your payment records will appear here</p>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-cyan-600 hover:text-cyan-700"
              >
                Make your first payment <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'autopay' && (
        <div className="max-w-lg mx-auto space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-gray-900">Auto-Pay</h3>
                <p className="text-sm text-gray-500 mt-0.5">Never miss a rent payment</p>
              </div>
              <button
                onClick={() => {
                  setAutoPayEnabled(!autoPayEnabled);
                  if (!autoPayEnabled) addToast('success', 'Auto-Pay Enabled', 'Your rent will be paid automatically.');
                  else addToast('info', 'Auto-Pay Disabled', 'Auto-pay has been turned off.');
                }}
                className={`relative w-14 h-7 rounded-full transition-colors ${autoPayEnabled ? 'bg-cyan-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${autoPayEnabled ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {autoPayEnabled && (
              <div className="space-y-4 animate-slide-down">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Method</label>
                  <select value={autoPayMethod} onChange={e => setAutoPayMethod(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                    <option value="mtn">MTN Mobile Money</option>
                    <option value="vodafone">Vodafone Cash</option>
                    <option value="airteltigo">AirtelTigo Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 bg-gray-50 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+233</span>
                    <input type="tel" value={autoPayPhone} onChange={e => setAutoPayPhone(e.target.value)} placeholder="24 123 4567"
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-r-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Day</label>
                  <select value={autoPayDay} onChange={e => setAutoPayDay(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                    {[1, 5, 10, 15, 20, 25, 28].map(day => (
                      <option key={day} value={day}>{day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of every month</option>
                    ))}
                  </select>
                </div>
                <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-100">
                  <p className="text-sm text-cyan-800">
                    <strong>Summary:</strong> {currency} {activeTenancy?.rentAmount.toLocaleString()} will be deducted from your{' '}
                    {autoPayMethod === 'mtn' ? 'MTN MoMo' : autoPayMethod === 'vodafone' ? 'Vodafone Cash' : 'AirtelTigo'}{' '}
                    on the {autoPayDay}th of each month.
                  </p>
                </div>
                <button onClick={() => addToast('success', 'Auto-Pay Updated', 'Your auto-pay settings have been saved.')}
                  className="w-full py-2.5 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 transition-colors">
                  Save Auto-Pay Settings
                </button>
              </div>
            )}

            {!autoPayEnabled && (
              <div className="text-center py-6">
                <RefreshCw className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Enable auto-pay to never miss a payment</p>
                <p className="text-xs text-gray-400 mt-1">You&apos;ll be reminded 3 days before each deduction</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={resetPaymentModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Make a Payment</h3>
              <button onClick={resetPaymentModal} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
            {paymentStep === 'form' && (
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount ({currency})</label>
                  <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" placeholder="0.00" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'momo' as const, label: 'Mobile Money', icon: Smartphone },
                      { key: 'bank' as const, label: 'Bank Transfer', icon: Building2 },
                      { key: 'card' as const, label: 'Card', icon: CreditCard },
                      { key: 'qr' as const, label: 'GhQR', icon: QrCode },
                      { key: 'usdt' as const, label: 'Crypto', icon: Wallet },
                    ] as { key: typeof paymentMethod; label: string; icon: any }[]).map(m => (
                      <button key={m.key} onClick={() => setPaymentMethod(m.key)}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          paymentMethod === m.key ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        <m.icon className="w-4 h-4" /> {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod === 'momo' && (
                  <div className="space-y-3 animate-fade-in">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider</label>
                      <select value={momoProvider} onChange={e => setMomoProvider(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500">
                        <option value="mtn">MTN Mobile Money</option>
                        <option value="vodafone">Vodafone Cash</option>
                        <option value="airteltigo">AirtelTigo Money</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 bg-gray-50 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+233</span>
                        <input type="tel" value={momoPhone} onChange={e => setMomoPhone(e.target.value)} placeholder="24 123 4567"
                          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-r-xl text-sm focus:ring-2 focus:ring-cyan-500" />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'qr' && (
                  <div className="text-center py-4 animate-fade-in">
                    <div className="w-40 h-40 bg-gray-100 rounded-xl mx-auto flex items-center justify-center border-2 border-dashed border-gray-300">
                      <QrCode className="w-16 h-16 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 mt-3">Scan with any Ghana QR payment app</p>
                  </div>
                )}

                {paymentMethod === 'usdt' && activeTenancy && parseFloat(paymentAmount) > 0 && (
                  <div className="animate-fade-in">
                    <CryptoPaymentFlow
                      tenancyId={activeTenancy.id}
                      amountGHS={parseFloat(paymentAmount)}
                      onSuccess={(result) => {
                        setPaymentStep('success');
                        addToast('success', 'Crypto Payment Successful!', `Payment confirmed. Ref: ${result.txHash.slice(0, 14)}...`);
                      }}
                      onCancel={() => setPaymentMethod('momo')}
                    />
                  </div>
                )}

                {paymentMethod !== 'usdt' && feeBreakdown && parseFloat(paymentAmount) > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2 animate-fade-in">
                    {feeBreakdown.fx && (
                      <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-3 -mt-1 mb-1 space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Listed Rent</span>
                          <span className="font-medium text-gray-900">{feeBreakdown.fx.obligationCurrency} {feeBreakdown.fx.obligationAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Exchange Rate (live)</span>
                          <span className="font-medium text-cyan-700">1 {feeBreakdown.fx.obligationCurrency} = GHS {feeBreakdown.fx.rate.toLocaleString(undefined, { minimumFractionDigits: 4 })}</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Rate locked {new Date(feeBreakdown.fx.lockedAt).toLocaleTimeString()} · you pay the GHS equivalent below</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{feeBreakdown.fx ? 'Rent (GHS equivalent)' : 'Rent Amount'}</span>
                      <span className="font-medium text-gray-900">{feeBreakdown.currency} {feeBreakdown.principalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Service Fee</span>
                      <span className="font-medium text-amber-600">+ {feeBreakdown.currency} {feeBreakdown.serviceFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-dashed border-gray-300 pt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">Total to Pay</span>
                      <span className="text-base font-bold text-gray-900">{feeBreakdown.currency} {feeBreakdown.totalCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">{feeBreakdown.feeDescription}</p>
                  </div>
                )}

                {paymentMethod !== 'usdt' && feeLoading && parseFloat(paymentAmount) > 0 && (
                  <div className="flex items-center justify-center py-3 text-xs text-gray-400">
                    <div className="w-3 h-3 border-2 border-gray-300 border-t-cyan-500 rounded-full animate-spin mr-2" />
                    Calculating fee...
                  </div>
                )}

                {paymentMethod !== 'usdt' && (
                <button onClick={handleInitiatePayment} disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || feeLoading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl font-semibold hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all">
                  Pay {feeBreakdown ? `${feeBreakdown.currency} ${feeBreakdown.totalCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${currency} ${paymentAmount ? parseFloat(paymentAmount).toLocaleString() : '0'}`}
                </button>
                )}
              </div>
            )}

            {paymentStep === 'processing' && (
              <div className="p-12 text-center">
                <div className="w-16 h-16 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mx-auto" />
                <p className="text-lg font-semibold text-gray-900 mt-6">Processing Payment</p>
                <p className="text-sm text-gray-500 mt-2">
                  {paymentMethod === 'momo' ? 'Check your phone for the payment prompt...' : 'Please wait while we process your payment...'}
                </p>
              </div>
            )}

            {paymentStep === 'success' && (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-lg font-semibold text-gray-900 mt-6">Payment Successful!</p>
                <p className="text-sm text-gray-500 mt-2">{currency} {parseFloat(paymentAmount).toLocaleString()} has been received</p>
                <button onClick={resetPaymentModal} className="mt-6 px-6 py-2.5 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700">
                  Done
                </button>
              </div>
            )}

            {paymentStep === 'failed' && (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <p className="text-lg font-semibold text-gray-900 mt-6">Payment Failed</p>
                <p className="text-sm text-gray-500 mt-2">Please check your balance and try again</p>
                <div className="flex gap-3 mt-6 justify-center">
                  <button onClick={resetPaymentModal} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200">Cancel</button>
                  <button onClick={() => setPaymentStep('form')} className="px-5 py-2.5 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700">Try Again</button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {disputeChargeId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDisputeChargeId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Dispute Charge</h3>
              <button onClick={() => setDisputeChargeId(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Explain why you believe this charge is incorrect. Your landlord will be notified.</p>
            <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} placeholder="e.g. I was not occupying the unit during this period..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none" rows={3} />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDisputeChargeId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button disabled={!disputeReason.trim() || disputeLoading}
                onClick={async () => {
                  setDisputeLoading(true);
                  try {
                    await disputeUtilityCharge(disputeChargeId, disputeReason.trim());
                    if (activeTenancy) {
                      const res = await getUtilityCharges(activeTenancy.id);
                      setUtilityCharges(res.charges || []);
                    }
                    setDisputeChargeId(null);
                    addToast('success', 'Dispute Submitted', 'Your landlord will review your dispute.');
                  } catch (err: any) {
                    addToast('error', 'Dispute Failed', err.message || 'Please try again.');
                  } finally { setDisputeLoading(false); }
                }}
                className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {disputeLoading ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <PortalShell title="Payments & Billing">
      <PaymentsContent />
    </PortalShell>
  );
}
