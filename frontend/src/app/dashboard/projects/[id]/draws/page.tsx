'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Building,
  Percent,
  Download,
  Upload,
  Calendar,
  User,
  AlertTriangle,
  TrendingUp,
  Landmark,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

const fetch = authedFetch;

// Types
interface DrawLineItem {
  cost_code: string;
  description: string;
  budget_amount: number;
  previous_draws: number;
  current_request: number;
  balance_remaining: number;
  percent_complete: number;
}

interface DrawRequest {
  id: string;
  project_id: string;
  draw_number: number;
  title: string;
  description?: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'funded';
  request_date: Date;
  period_start?: Date;
  period_end?: Date;
  total_amount: number;
  retention_amount: number;
  net_amount: number;
  retention_rate: number;
  previous_draws_total: number;
  amount_funded: number;
  funded_date?: Date;
  line_items: DrawLineItem[];
  supporting_documents: { url: string; type: string; name: string }[];
  submitted_by?: string;
  submitted_at?: Date;
  approved_by?: string;
  approved_at?: Date;
  approval_notes?: string;
  rejected_by?: string;
  rejected_at?: Date;
  rejection_reason?: string;
  esign_envelope_id?: string | null;
  esign_status?: string | null;
  esign_completed_at?: string | null;
  created_at: Date;
}

interface DrawSummary {
  project_id: string;
  total_budget: number;
  total_drawn: number;
  total_funded: number;
  retention_held: number;
  available_to_draw: number;
  percent_drawn: number;
  draw_count: number;
  pending_draws: number;
  pending_amount: number;
}

// Status badge component
function StatusBadge({ status }: { status: DrawRequest['status'] }) {
  const config = {
    draft: { label: 'Draft', className: 'bg-zinc-800 text-zinc-300' },
    submitted: { label: 'Submitted', className: 'bg-blue-900/50 text-blue-400' },
    under_review: { label: 'Under Review', className: 'bg-yellow-900/50 text-yellow-400' },
    approved: { label: 'Approved', className: 'bg-green-900/50 text-green-400' },
    rejected: { label: 'Rejected', className: 'bg-red-900/50 text-red-400' },
    funded: { label: 'Funded', className: 'bg-emerald-900/50 text-emerald-400' },
  };
  
  const { label, className } = config[status];
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format date
function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Draw summary cards
function DrawSummaryCards({ summary }: { summary: DrawSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <DollarSign className="w-4 h-4" />
          Total Budget
        </div>
        <div className="text-xl font-bold text-white">
          {formatCurrency(summary.total_budget)}
        </div>
      </div>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <TrendingUp className="w-4 h-4" />
          Total Drawn
        </div>
        <div className="text-xl font-bold text-amber-500">
          {formatCurrency(summary.total_drawn)}
        </div>
        <div className="text-xs text-zinc-500 mt-1">
          {summary.percent_drawn.toFixed(1)}% of budget
        </div>
      </div>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <Landmark className="w-4 h-4" />
          Total Funded
        </div>
        <div className="text-xl font-bold text-green-500">
          {formatCurrency(summary.total_funded)}
        </div>
      </div>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <Percent className="w-4 h-4" />
          Retention Held
        </div>
        <div className="text-xl font-bold text-yellow-500">
          {formatCurrency(summary.retention_held)}
        </div>
      </div>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <Clock className="w-4 h-4" />
          Pending
        </div>
        <div className="text-xl font-bold text-blue-500">
          {formatCurrency(summary.pending_amount)}
        </div>
        <div className="text-xs text-zinc-500 mt-1">
          {summary.pending_draws} request(s)
        </div>
      </div>
    </div>
  );
}

// Draw list item
function DrawListItem({ 
  draw, 
  onView 
}: { 
  draw: DrawRequest;
  onView: (id: string) => void;
}) {
  return (
    <div 
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-amber-500/50 cursor-pointer transition-colors"
      onClick={() => onView(draw.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">Draw #{draw.draw_number}</span>
            <StatusBadge status={draw.status} />
          </div>
          <p className="text-zinc-400 text-sm mt-1">{draw.title}</p>
        </div>
        <div className="text-right">
          <div className="text-amber-500 font-bold">{formatCurrency(draw.net_amount)}</div>
          <div className="text-zinc-500 text-xs">Net after retention</div>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-zinc-500">Request Date</span>
          <div className="text-white">{formatDate(draw.request_date)}</div>
        </div>
        <div>
          <span className="text-zinc-500">Gross Amount</span>
          <div className="text-white">{formatCurrency(draw.total_amount)}</div>
        </div>
        <div>
          <span className="text-zinc-500">Retention ({draw.retention_rate}%)</span>
          <div className="text-yellow-500">{formatCurrency(draw.retention_amount)}</div>
        </div>
      </div>
      
      {draw.status === 'funded' && draw.funded_date && (
        <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          Funded on {formatDate(draw.funded_date)} - {formatCurrency(draw.amount_funded)}
        </div>
      )}
      
      {draw.status === 'rejected' && draw.rejection_reason && (
        <div className="mt-3 pt-3 border-t border-zinc-800 flex items-start gap-2 text-red-400 text-sm">
          <XCircle className="w-4 h-4 mt-0.5" />
          <span>{draw.rejection_reason}</span>
        </div>
      )}
    </div>
  );
}

// Create draw modal
function CreateDrawModal({
  isOpen,
  onClose,
  projectId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    period_start: '',
    period_end: '',
    retention_rate: 10,
    line_items: [
      { cost_code: '', description: '', current_request: 0 }
    ]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  if (!isOpen) return null;
  
  const addLineItem = () => {
    setFormData({
      ...formData,
      line_items: [...formData.line_items, { cost_code: '', description: '', current_request: 0 }]
    });
  };
  
  const updateLineItem = (index: number, field: string, value: any) => {
    const items = [...formData.line_items];
    items[index] = { ...items[index], [field]: value };
    setFormData({ ...formData, line_items: items });
  };
  
  const removeLineItem = (index: number) => {
    setFormData({
      ...formData,
      line_items: formData.line_items.filter((_, i) => i !== index)
    });
  };
  
  const totalAmount = formData.line_items.reduce((sum, item) => sum + (item.current_request || 0), 0);
  const retentionAmount = totalAmount * (formData.retention_rate / 100);
  const netAmount = totalAmount - retentionAmount;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/draws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          period_start: formData.period_start || undefined,
          period_end: formData.period_end || undefined,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to create draw');
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating draw:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-xl font-bold text-white">Create Draw Request</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Draw Request for March 2024"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Period Start</label>
              <input
                type="date"
                value={formData.period_start}
                onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Period End</label>
              <input
                type="date"
                value={formData.period_end}
                onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Retention Rate (%)</label>
              <input
                type="number"
                min="0"
                max="20"
                step="0.5"
                value={formData.retention_rate}
                onChange={(e) => setFormData({ ...formData, retention_rate: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Description of work completed..."
              />
            </div>
          </div>
          
          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-zinc-400">Line Items</label>
              <button
                type="button"
                onClick={addLineItem}
                className="text-amber-500 text-sm hover:underline"
              >
                + Add Line Item
              </button>
            </div>
            
            <div className="space-y-2">
              {formData.line_items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={item.cost_code}
                    onChange={(e) => updateLineItem(index, 'cost_code', e.target.value)}
                    placeholder="Cost Code"
                    className="col-span-2 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    placeholder="Description"
                    className="col-span-6 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <input
                    type="number"
                    value={item.current_request || ''}
                    onChange={(e) => updateLineItem(index, 'current_request', parseFloat(e.target.value) || 0)}
                    placeholder="Amount"
                    className="col-span-3 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  {formData.line_items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="col-span-1 text-red-500 hover:text-red-400"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Summary */}
          <div className="bg-zinc-800 rounded-lg p-4 grid grid-cols-3 gap-4">
            <div>
              <span className="text-zinc-400 text-sm">Gross Amount</span>
              <div className="text-white font-bold">{formatCurrency(totalAmount)}</div>
            </div>
            <div>
              <span className="text-zinc-400 text-sm">Retention ({formData.retention_rate}%)</span>
              <div className="text-yellow-500 font-bold">-{formatCurrency(retentionAmount)}</div>
            </div>
            <div>
              <span className="text-zinc-400 text-sm">Net Amount</span>
              <div className="text-amber-500 font-bold">{formatCurrency(netAmount)}</div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || totalAmount === 0}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Draw Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Draw detail modal
function DrawDetailModal({
  draw,
  onClose,
  onAction,
}: {
  draw: DrawRequest | null;
  onClose: () => void;
  onAction: (action: string, data?: any) => void;
}) {
  const [actionNote, setActionNote] = useState('');
  const [fundingAmount, setFundingAmount] = useState(0);
  const [fundingRef, setFundingRef] = useState('');
  const [showFundingForm, setShowFundingForm] = useState(false);
  
  if (!draw) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Draw #{draw.draw_number}</h2>
            <p className="text-zinc-400 text-sm">{draw.title}</p>
          </div>
          <StatusBadge status={draw.status} />
        </div>
        
        <div className="p-6 space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-800 rounded-lg p-3">
              <span className="text-zinc-400 text-sm">Gross Amount</span>
              <div className="text-white font-bold">{formatCurrency(draw.total_amount)}</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-3">
              <span className="text-zinc-400 text-sm">Retention ({draw.retention_rate}%)</span>
              <div className="text-yellow-500 font-bold">{formatCurrency(draw.retention_amount)}</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-3">
              <span className="text-zinc-400 text-sm">Net Amount</span>
              <div className="text-amber-500 font-bold">{formatCurrency(draw.net_amount)}</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-3">
              <span className="text-zinc-400 text-sm">Amount Funded</span>
              <div className="text-green-500 font-bold">{formatCurrency(draw.amount_funded)}</div>
            </div>
          </div>
          
          {/* Line Items */}
          <div>
            <h3 className="text-white font-medium mb-3">Line Items</h3>
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-700">
                  <tr>
                    <th className="text-left px-4 py-2 text-zinc-300">Code</th>
                    <th className="text-left px-4 py-2 text-zinc-300">Description</th>
                    <th className="text-right px-4 py-2 text-zinc-300">Budget</th>
                    <th className="text-right px-4 py-2 text-zinc-300">Previous</th>
                    <th className="text-right px-4 py-2 text-zinc-300">Current</th>
                    <th className="text-right px-4 py-2 text-zinc-300">Balance</th>
                    <th className="text-right px-4 py-2 text-zinc-300">%</th>
                  </tr>
                </thead>
                <tbody>
                  {draw.line_items.map((item, index) => (
                    <tr key={index} className="border-t border-zinc-700">
                      <td className="px-4 py-2 text-zinc-400 font-mono">{item.cost_code}</td>
                      <td className="px-4 py-2 text-white">{item.description}</td>
                      <td className="px-4 py-2 text-right text-zinc-300">{formatCurrency(item.budget_amount)}</td>
                      <td className="px-4 py-2 text-right text-zinc-400">{formatCurrency(item.previous_draws)}</td>
                      <td className="px-4 py-2 text-right text-amber-500 font-medium">{formatCurrency(item.current_request)}</td>
                      <td className="px-4 py-2 text-right text-zinc-300">{formatCurrency(item.balance_remaining)}</td>
                      <td className="px-4 py-2 text-right text-zinc-400">{item.percent_complete}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Documents */}
          {draw.supporting_documents.length > 0 && (
            <div>
              <h3 className="text-white font-medium mb-3">Supporting Documents</h3>
              <div className="flex flex-wrap gap-2">
                {draw.supporting_documents.map((doc, index) => (
                  <a
                    key={index}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700"
                  >
                    <FileText className="w-4 h-4" />
                    {doc.name}
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {/* Status History */}
          <div>
            <h3 className="text-white font-medium mb-3">History</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3 text-zinc-400">
                <Calendar className="w-4 h-4" />
                Created on {formatDate(draw.created_at)}
              </div>
              {draw.submitted_at && (
                <div className="flex items-center gap-3 text-blue-400">
                  <Send className="w-4 h-4" />
                  Submitted on {formatDate(draw.submitted_at)} by {draw.submitted_by}
                </div>
              )}
              {draw.approved_at && (
                <div className="flex items-center gap-3 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  Approved on {formatDate(draw.approved_at)} by {draw.approved_by}
                  {draw.approval_notes && <span className="text-zinc-400">- {draw.approval_notes}</span>}
                </div>
              )}
              {draw.rejected_at && (
                <div className="flex items-center gap-3 text-red-400">
                  <XCircle className="w-4 h-4" />
                  Rejected on {formatDate(draw.rejected_at)} by {draw.rejected_by}
                  {draw.rejection_reason && <span className="text-zinc-400">- {draw.rejection_reason}</span>}
                </div>
              )}
              {draw.funded_date && (
                <div className="flex items-center gap-3 text-emerald-400">
                  <Landmark className="w-4 h-4" />
                  Funded {formatCurrency(draw.amount_funded)} on {formatDate(draw.funded_date)}
                </div>
              )}
            </div>
          </div>
          
          {/* Funding Form */}
          {showFundingForm && draw.status === 'approved' && (
            <div className="bg-zinc-800 rounded-lg p-4 space-y-4">
              <h3 className="text-white font-medium">Record Funding</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Amount</label>
                  <input
                    type="number"
                    value={fundingAmount || ''}
                    onChange={(e) => setFundingAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder={draw.net_amount.toString()}
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Reference Number</label>
                  <input
                    type="text"
                    value={fundingRef}
                    onChange={(e) => setFundingRef(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Transfer reference..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowFundingForm(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onAction('fund', { amount: fundingAmount || draw.net_amount, referenceNumber: fundingRef });
                    setShowFundingForm(false);
                  }}
                  className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-500"
                >
                  Record Funding
                </button>
              </div>
            </div>
          )}
          
          {/* Action Input */}
          {(draw.status === 'submitted' || draw.status === 'under_review') && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Notes (for approval/rejection)</label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Add notes..."
              />
            </div>
          )}
        </div>
        
        {/* Actions Footer */}
        <div className="p-6 border-t border-zinc-800 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
          >
            Close
          </button>
          
          <div className="flex gap-2">
            {draw.status === 'draft' && (
              <>
                <button
                  onClick={() => onAction('submit')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Submit for Approval
                </button>
              </>
            )}
            
            {(draw.status === 'submitted' || draw.status === 'under_review') && (
              <>
                <button
                  onClick={() => onAction('reject', { reason: actionNote })}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                <button
                  onClick={() => onAction('approve', { notes: actionNote })}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
              </>
            )}

            {draw.esign_status === 'completed' ? (
              <span className="px-3 py-2 rounded-lg bg-green-600/15 text-green-400 border border-green-600/30 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> E-signed
              </span>
            ) : draw.esign_status === 'sent' ? (
              <span className="px-3 py-2 rounded-lg bg-blue-600/15 text-blue-400 border border-blue-600/30 text-sm flex items-center gap-2">
                <Send className="w-4 h-4" /> Out for signature
              </span>
            ) : (draw.status === 'submitted' || draw.status === 'under_review' || draw.status === 'approved') ? (
              <button
                onClick={() => onAction('request-esign')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> Request E-Signature
              </button>
            ) : null}

            {draw.status === 'approved' && (
              <button
                onClick={() => setShowFundingForm(true)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 flex items-center gap-2"
              >
                <Landmark className="w-4 h-4" />
                Record Funding
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main draws page
export default function ProjectDrawsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const [draws, setDraws] = useState<DrawRequest[]>([]);
  const [summary, setSummary] = useState<DrawSummary | null>(null);
  const [selectedDraw, setSelectedDraw] = useState<DrawRequest | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectName, setProjectName] = useState('');
  
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch draws
      const statusParam = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const drawsRes = await fetch(`/api/projects/${projectId}/draws${statusParam}`);
      const drawsData = await drawsRes.json();
      setDraws(drawsData.data || []);
      
      // Fetch summary
      const summaryRes = await fetch(`/api/projects/${projectId}/draws/summary`);
      const summaryData = await summaryRes.json();
      setSummary(summaryData);
      
      // Fetch project name
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();
      setProjectName(projectData.project_name || 'Project');
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, [projectId, statusFilter]);
  
  const handleViewDraw = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/draws/${id}`);
      const data = await res.json();
      setSelectedDraw(data);
    } catch (error) {
      console.error('Error fetching draw:', error);
    }
  };
  
  const handleDrawAction = async (action: string, data?: any) => {
    if (!selectedDraw) return;
    
    try {
      let endpoint = `/api/projects/draws/${selectedDraw.id}/${action}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      
      if (!res.ok) throw new Error(`Failed to ${action} draw`);
      
      // Refresh data
      await fetchData();
      
      // Refresh selected draw
      const updatedRes = await fetch(`/api/projects/draws/${selectedDraw.id}`);
      const updatedData = await updatedRes.json();
      setSelectedDraw(updatedData);
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
    }
  };
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Draw Requests</h1>
            <p className="text-zinc-400">{projectName}</p>
          </div>
        </div>
        
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          New Draw
        </button>
      </div>
      
      {/* Summary Cards */}
      {summary && <DrawSummaryCards summary={summary} />}
      
      {/* Filter */}
      <div className="flex items-center gap-4">
        <span className="text-zinc-400 text-sm">Filter:</span>
        <div className="flex gap-2">
          {['all', 'draft', 'submitted', 'approved', 'funded', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 rounded-full text-sm ${
                statusFilter === status
                  ? 'bg-amber-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Draws List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
        </div>
      ) : draws.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
          <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">No Draw Requests</h3>
          <p className="text-zinc-400 text-sm mb-4">
            Create your first draw request to track construction financing.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Draw Request
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {draws.map((draw) => (
            <DrawListItem
              key={draw.id}
              draw={draw}
              onView={handleViewDraw}
            />
          ))}
        </div>
      )}
      
      {/* Create Modal */}
      <CreateDrawModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={projectId}
        onSuccess={fetchData}
      />
      
      {/* Detail Modal */}
      <DrawDetailModal
        draw={selectedDraw}
        onClose={() => setSelectedDraw(null)}
        onAction={handleDrawAction}
      />
    </div>
  );
}
