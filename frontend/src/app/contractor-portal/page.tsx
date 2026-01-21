'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Clock,
  DollarSign,
  FileText,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Upload,
  Image,
  Send,
  User,
  Phone,
  Mail,
  Briefcase,
  TrendingUp,
  ChevronRight,
  HardHat,
  Hammer,
  ClipboardCheck,
  MessageSquare,
} from 'lucide-react';

// Types
interface ContractorAssignment {
  id: string;
  project_id: string;
  project_name: string;
  phase_name?: string;
  scope_of_work: string;
  start_date?: Date;
  end_date?: Date;
  contract_amount: number;
  amount_billed: number;
  amount_paid: number;
  progress_percentage: number;
  status: 'pending' | 'active' | 'completed' | 'on_hold';
}

interface PunchListItem {
  id: string;
  unit_id: string;
  unit_number: string;
  project_name: string;
  title: string;
  location: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'completed' | 'verified';
  due_date?: Date;
  assigned_date?: Date;
}

interface ContractorDashboardData {
  contractor: {
    id: string;
    business_name: string;
    contact_name: string;
    email: string;
    phone: string;
    specialty: string;
  };
  stats: {
    active_projects: number;
    total_contract_value: number;
    total_billed: number;
    total_paid: number;
    outstanding: number;
    open_punch_items: number;
  };
  assignments: ContractorAssignment[];
  punchItems: PunchListItem[];
  recentActivity: {
    type: string;
    description: string;
    date: Date;
    project_name?: string;
  }[];
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = 'amber',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'amber' | 'green' | 'blue' | 'red' | 'purple';
}) {
  const colorClasses = {
    amber: 'text-amber-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    red: 'text-red-500',
    purple: 'text-purple-500',
  };
  
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-zinc-500 text-xs mt-1">{subValue}</div>
      )}
    </div>
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
function formatDate(date: Date | string | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Status badge
function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-yellow-900/50 text-yellow-400' },
    active: { label: 'Active', className: 'bg-green-900/50 text-green-400' },
    completed: { label: 'Completed', className: 'bg-blue-900/50 text-blue-400' },
    on_hold: { label: 'On Hold', className: 'bg-zinc-700 text-zinc-300' },
    open: { label: 'Open', className: 'bg-red-900/50 text-red-400' },
    in_progress: { label: 'In Progress', className: 'bg-amber-900/50 text-amber-400' },
    verified: { label: 'Verified', className: 'bg-emerald-900/50 text-emerald-400' },
  };
  
  const config = configs[status] || { label: status, className: 'bg-zinc-700 text-zinc-300' };
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

// Priority badge
function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'text-red-500',
    high: 'text-orange-500',
    medium: 'text-yellow-500',
    low: 'text-green-500',
  };
  
  return (
    <span className={`text-xs font-medium ${colors[priority] || 'text-zinc-400'}`}>
      {priority.toUpperCase()}
    </span>
  );
}

// Assignment Card
function AssignmentCard({ assignment }: { assignment: ContractorAssignment }) {
  const progress = assignment.progress_percentage;
  const remaining = assignment.contract_amount - assignment.amount_paid;
  
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-amber-500/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-white font-medium">{assignment.project_name}</h3>
          {assignment.phase_name && (
            <p className="text-zinc-400 text-sm">{assignment.phase_name}</p>
          )}
        </div>
        <StatusBadge status={assignment.status} />
      </div>
      
      <p className="text-zinc-300 text-sm mb-4 line-clamp-2">
        {assignment.scope_of_work}
      </p>
      
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
          <span>Progress</span>
          <span className="text-amber-500">{progress}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      
      {/* Financial Summary */}
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-zinc-500 text-xs">Contract</span>
          <div className="text-white font-medium">{formatCurrency(assignment.contract_amount)}</div>
        </div>
        <div>
          <span className="text-zinc-500 text-xs">Billed</span>
          <div className="text-blue-400 font-medium">{formatCurrency(assignment.amount_billed)}</div>
        </div>
        <div>
          <span className="text-zinc-500 text-xs">Paid</span>
          <div className="text-green-400 font-medium">{formatCurrency(assignment.amount_paid)}</div>
        </div>
      </div>
      
      {/* Dates */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800 text-xs text-zinc-400">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {formatDate(assignment.start_date)} - {formatDate(assignment.end_date)}
        </div>
        {remaining > 0 && (
          <span className="text-amber-500">{formatCurrency(remaining)} remaining</span>
        )}
      </div>
    </div>
  );
}

// Punch List Item Card
function PunchItemCard({ 
  item, 
  onComplete 
}: { 
  item: PunchListItem;
  onComplete: (id: string) => void;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-zinc-400 text-xs">{item.project_name} • {item.unit_number}</span>
          <h4 className="text-white font-medium">{item.title}</h4>
        </div>
        <PriorityBadge priority={item.priority} />
      </div>
      
      <p className="text-zinc-400 text-sm mb-3">{item.location}</p>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={item.status} />
          {item.due_date && (
            <span className={`text-xs flex items-center gap-1 ${
              new Date(item.due_date) < new Date() ? 'text-red-400' : 'text-zinc-400'
            }`}>
              <Clock className="w-3 h-3" />
              Due {formatDate(item.due_date)}
            </span>
          )}
        </div>
        
        {item.status !== 'completed' && item.status !== 'verified' && (
          <button
            onClick={() => onComplete(item.id)}
            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-500 flex items-center gap-1"
          >
            <CheckCircle className="w-3 h-3" />
            Complete
          </button>
        )}
      </div>
    </div>
  );
}

// Main Contractor Portal Page
export default function ContractorPortalPage() {
  const [data, setData] = useState<ContractorDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'punch-list'>('overview');
  
  useEffect(() => {
    // In a real app, this would fetch from the contractor portal API
    // For now, we'll simulate with mock data
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Simulated data - in production this would come from an API
        const mockData: ContractorDashboardData = {
          contractor: {
            id: 'contractor-1',
            business_name: 'Osei Construction Ltd',
            contact_name: 'Kwame Osei',
            email: 'kwame@oseiconstruction.gh',
            phone: '+233 24 123 4567',
            specialty: 'General Contractor',
          },
          stats: {
            active_projects: 3,
            total_contract_value: 2500000,
            total_billed: 1800000,
            total_paid: 1500000,
            outstanding: 300000,
            open_punch_items: 12,
          },
          assignments: [
            {
              id: '1',
              project_id: 'p1',
              project_name: 'The Cantonments Residences',
              phase_name: 'Foundation Works',
              scope_of_work: 'Complete foundation including excavation, footing, and foundation walls for Block A',
              start_date: new Date('2024-01-15'),
              end_date: new Date('2024-03-15'),
              contract_amount: 850000,
              amount_billed: 680000,
              amount_paid: 600000,
              progress_percentage: 80,
              status: 'active',
            },
            {
              id: '2',
              project_id: 'p1',
              project_name: 'The Cantonments Residences',
              phase_name: 'Structural Works',
              scope_of_work: 'Concrete structure for floors 1-5 including columns, beams, and slabs',
              start_date: new Date('2024-03-01'),
              end_date: new Date('2024-06-30'),
              contract_amount: 1200000,
              amount_billed: 900000,
              amount_paid: 700000,
              progress_percentage: 65,
              status: 'active',
            },
            {
              id: '3',
              project_id: 'p2',
              project_name: 'East Legon Gardens',
              phase_name: 'Site Preparation',
              scope_of_work: 'Site clearing, grading, and temporary facilities setup',
              start_date: new Date('2024-02-01'),
              end_date: new Date('2024-02-28'),
              contract_amount: 450000,
              amount_billed: 450000,
              amount_paid: 450000,
              progress_percentage: 100,
              status: 'completed',
            },
          ],
          punchItems: [
            {
              id: 'pi1',
              unit_id: 'u1',
              unit_number: 'A-101',
              project_name: 'The Cantonments Residences',
              title: 'Crack in living room wall',
              location: 'Living Room - North Wall',
              category: 'painting',
              priority: 'medium',
              status: 'open',
              due_date: new Date('2024-03-25'),
              assigned_date: new Date('2024-03-18'),
            },
            {
              id: 'pi2',
              unit_id: 'u2',
              unit_number: 'A-102',
              project_name: 'The Cantonments Residences',
              title: 'Leaking faucet in bathroom',
              location: 'Master Bathroom',
              category: 'plumbing',
              priority: 'high',
              status: 'in_progress',
              due_date: new Date('2024-03-22'),
              assigned_date: new Date('2024-03-15'),
            },
            {
              id: 'pi3',
              unit_id: 'u3',
              unit_number: 'B-201',
              project_name: 'The Cantonments Residences',
              title: 'Socket not working',
              location: 'Bedroom 2',
              category: 'electrical',
              priority: 'critical',
              status: 'open',
              due_date: new Date('2024-03-20'),
              assigned_date: new Date('2024-03-18'),
            },
          ],
          recentActivity: [
            {
              type: 'payment',
              description: 'Payment received: GH₵ 200,000',
              date: new Date('2024-03-15'),
              project_name: 'The Cantonments Residences',
            },
            {
              type: 'punch_item',
              description: 'New punch list item assigned',
              date: new Date('2024-03-18'),
              project_name: 'The Cantonments Residences',
            },
            {
              type: 'progress',
              description: 'Progress updated to 80%',
              date: new Date('2024-03-17'),
              project_name: 'The Cantonments Residences',
            },
          ],
        };
        
        setData(mockData);
      } catch (error) {
        console.error('Error fetching contractor data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const handleCompletePunchItem = async (itemId: string) => {
    try {
      // In production, this would call the API
      await fetch(`/api/v1/projects/punch-lists/${itemId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      // Update local state
      if (data) {
        setData({
          ...data,
          punchItems: data.punchItems.map(item =>
            item.id === itemId ? { ...item, status: 'completed' as const } : item
          ),
          stats: {
            ...data.stats,
            open_punch_items: data.stats.open_punch_items - 1,
          },
        });
      }
    } catch (error) {
      console.error('Error completing punch item:', error);
    }
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
      </div>
    );
  }
  
  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-400">Failed to load contractor data</p>
      </div>
    );
  }
  
  const { contractor, stats, assignments, punchItems, recentActivity } = data;
  
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <HardHat className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-white font-bold">Contractor Portal</h1>
              <p className="text-zinc-400 text-sm">{contractor.business_name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg">
              <MessageSquare className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-zinc-400" />
              <span className="text-white">{contractor.contact_name}</span>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            icon={Building2}
            label="Active Projects"
            value={stats.active_projects}
            color="amber"
          />
          <StatCard
            icon={DollarSign}
            label="Contract Value"
            value={formatCurrency(stats.total_contract_value)}
            color="blue"
          />
          <StatCard
            icon={FileText}
            label="Total Billed"
            value={formatCurrency(stats.total_billed)}
            color="purple"
          />
          <StatCard
            icon={CheckCircle}
            label="Total Paid"
            value={formatCurrency(stats.total_paid)}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="Outstanding"
            value={formatCurrency(stats.outstanding)}
            color="amber"
          />
          <StatCard
            icon={AlertTriangle}
            label="Open Punch Items"
            value={stats.open_punch_items}
            color="red"
          />
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800">
          {[
            { key: 'overview', label: 'Overview', icon: TrendingUp },
            { key: 'assignments', label: 'Assignments', icon: Briefcase },
            { key: 'punch-list', label: 'Punch List', icon: ClipboardCheck },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`px-4 py-2 flex items-center gap-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === key
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        
        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Assignments */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-white font-bold flex items-center gap-2">
                <Hammer className="w-5 h-5" />
                Active Assignments
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignments
                  .filter(a => a.status === 'active')
                  .map(assignment => (
                    <AssignmentCard key={assignment.id} assignment={assignment} />
                  ))}
              </div>
            </div>
            
            {/* Recent Activity */}
            <div className="space-y-4">
              <h2 className="text-white font-bold">Recent Activity</h2>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="p-4">
                    <p className="text-white text-sm">{activity.description}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
                      <span>{activity.project_name}</span>
                      <span>{formatDate(activity.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Quick Actions */}
              <h2 className="text-white font-bold pt-4">Quick Actions</h2>
              <div className="space-y-2">
                <button className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-left hover:border-amber-500/50 transition-colors flex items-center justify-between">
                  <span className="flex items-center gap-2 text-white">
                    <Upload className="w-4 h-4" />
                    Submit Invoice
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
                <button className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-left hover:border-amber-500/50 transition-colors flex items-center justify-between">
                  <span className="flex items-center gap-2 text-white">
                    <TrendingUp className="w-4 h-4" />
                    Update Progress
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
                <button className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-left hover:border-amber-500/50 transition-colors flex items-center justify-between">
                  <span className="flex items-center gap-2 text-white">
                    <Image className="w-4 h-4" />
                    Upload Photos
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignments.map(assignment => (
                <AssignmentCard key={assignment.id} assignment={assignment} />
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'punch-list' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">Assigned Punch Items</h2>
              <div className="flex gap-2">
                {['all', 'open', 'in_progress', 'completed'].map(filter => (
                  <button
                    key={filter}
                    className="px-3 py-1 rounded-full text-sm bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  >
                    {filter.replace('_', ' ').charAt(0).toUpperCase() + filter.slice(1).replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {punchItems.map(item => (
                <PunchItemCard
                  key={item.id}
                  item={item}
                  onComplete={handleCompletePunchItem}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
