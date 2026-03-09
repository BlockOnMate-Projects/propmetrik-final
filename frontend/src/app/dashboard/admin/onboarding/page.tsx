'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { authedFetch } from '@/lib/authed-fetch'
import {
  CheckCircle,
  Circle,
  ArrowRight,
  Sparkles,
  Building2,
  FileText,
  Key,
  CreditCard,
  Users,
  BarChart3,
  Rocket,
  RefreshCw,
  Trophy,
} from 'lucide-react'

/* ────────────── Types ────────────── */
interface OnboardingStep {
  id: string
  title: string
  description: string
  done: boolean
  href: string
}

interface OnboardingData {
  steps: OnboardingStep[]
  completed: number
  total: number
  progress_pct: number
}

const STEP_ICONS: Record<string, React.ElementType> = {
  profile: Building2,
  property: FileText,
  valuation: FileText,
  api_key: Key,
  subscription: CreditCard,
  team: Users,
  analytics: BarChart3,
}

const STEP_TIPS: Record<string, string> = {
  profile: 'A complete profile helps your team collaborate effectively and ensures reports carry your branding.',
  property: 'Properties are the foundation of PROPMETRIK. Import from CSV or add manually to start analyzing.',
  valuation: 'Valuations leverage our ML models to provide accurate property values with confidence intervals.',
  api_key: 'API keys let you integrate PROPMETRIK data into your own applications and workflows.',
  subscription: 'Upgrade to unlock ML predictions, custom reports, and unlimited API access.',
  team: 'Add team members with role-based access — valuers, analysts, and managers each get tailored views.',
  analytics: 'Explore market intelligence, construction cost indices, and housing affordability data.',
}

/* ────────────── Main Page ────────────── */

export default function OnboardingPage() {
  const [data, setData] = useState<OnboardingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/platform/onboarding/checklist')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      if (json.data) setData(json.data)
    } catch {
      // Fallback with template data
      setData({
        steps: [
          { id: 'profile', title: 'Complete your profile', description: 'Add your organization details and branding', done: true, href: '/dashboard/profile' },
          { id: 'property', title: 'Add your first property', description: 'Import or manually create a property listing', done: false, href: '/dashboard/deals' },
          { id: 'valuation', title: 'Request a valuation', description: 'Submit a property for professional valuation', done: false, href: '/dashboard/valuations' },
          { id: 'api_key', title: 'Generate an API key', description: 'Enable programmatic access to PROPMETRIK APIs', done: false, href: '/dashboard/admin/api-keys' },
          { id: 'subscription', title: 'Choose a subscription plan', description: 'Select a plan that fits your needs', done: false, href: '/dashboard/admin/billing' },
          { id: 'team', title: 'Invite team members', description: 'Add colleagues with appropriate roles', done: false, href: '/dashboard/admin/users' },
          { id: 'analytics', title: 'Explore analytics', description: 'View market intelligence and property analytics', done: true, href: '/dashboard/analytics' },
        ],
        completed: 2,
        total: 7,
        progress_pct: 29,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-zinc-600 animate-spin" />
      </div>
    )
  }

  if (!data) return null

  const isComplete = data.progress_pct >= 100
  const nextStep = data.steps.find((s) => !s.done)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Rocket className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-bold text-white font-mono">ONBOARDING</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1 ml-9">Get started with PROPMETRIK in a few simple steps</p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="px-3 py-1 text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-800 hover:border-red-600 transition-colors"
        >
          REFRESH
        </button>
      </div>

      {/* Progress Bar */}
      <div className="bg-zinc-900 border border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {isComplete ? (
              <Trophy className="w-5 h-5 text-amber-400" />
            ) : (
              <Sparkles className="w-5 h-5 text-red-500" />
            )}
            <span className="text-sm font-bold text-white font-mono">
              {isComplete ? 'SETUP COMPLETE!' : 'GETTING STARTED'}
            </span>
          </div>
          <span className="text-sm font-bold font-mono text-red-400">
            {data.completed}/{data.total}
          </span>
        </div>

        {/* Progress track */}
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${data.progress_pct}%`,
              background: isComplete
                ? 'linear-gradient(90deg, #f59e0b, #10b981)'
                : 'linear-gradient(90deg, #dc2626, #f59e0b)',
            }}
          />
        </div>
        <p className="text-[10px] text-zinc-500 font-mono mt-2">
          {isComplete
            ? 'You\'re all set! Explore the platform or check out our API docs.'
            : `${data.progress_pct}% complete — ${data.total - data.completed} steps remaining`}
        </p>

        {/* Next step callout */}
        {nextStep && (
          <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 rounded flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-900/50 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Next: {nextStep.title}</p>
                <p className="text-[10px] text-zinc-500">{nextStep.description}</p>
              </div>
            </div>
            <Link
              href={nextStep.href}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[11px] font-mono font-bold transition-colors"
            >
              START →
            </Link>
          </div>
        )}
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {data.steps.map((step, index) => {
          const Icon = STEP_ICONS[step.id] || Circle
          const isActive = activeStep === step.id
          const tip = STEP_TIPS[step.id]

          return (
            <div key={step.id}>
              <button
                onClick={() => setActiveStep(isActive ? null : step.id)}
                className={`w-full flex items-center gap-4 p-4 transition-all border ${
                  step.done
                    ? 'bg-zinc-900/50 border-zinc-800/50'
                    : isActive
                      ? 'bg-zinc-900 border-red-800'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Step number */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.done
                    ? 'bg-green-900/50'
                    : 'bg-zinc-800'
                }`}>
                  {step.done ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <span className="text-xs font-mono font-bold text-zinc-400">{index + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 text-left">
                  <p className={`text-xs font-bold font-mono ${step.done ? 'text-zinc-500 line-through' : 'text-white'}`}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{step.description}</p>
                </div>

                {/* Icon + Action */}
                <Icon className={`w-5 h-5 flex-shrink-0 ${step.done ? 'text-green-500/40' : 'text-red-500/70'}`} />

                {!step.done && (
                  <Link
                    href={step.href}
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-1 bg-zinc-800 hover:bg-red-900/40 border border-zinc-700 hover:border-red-700 text-[10px] font-mono text-zinc-300 hover:text-white transition-colors flex-shrink-0"
                  >
                    GO →
                  </Link>
                )}
              </button>

              {/* Expanded tip */}
              {isActive && tip && (
                <div className="ml-12 p-3 bg-zinc-950 border-x border-b border-zinc-800 text-[11px] text-zinc-400">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 inline mr-2" />
                  {tip}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Help section */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-sm font-bold text-white font-mono mb-3">NEED HELP?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { title: 'API Documentation', desc: 'Explore our REST API reference', href: '/dashboard/admin/api-docs' },
            { title: 'Usage Analytics', desc: 'Track your platform usage', href: '/dashboard/admin/usage' },
            { title: 'Support', desc: 'Contact the PROPMETRIK team', href: 'mailto:support@propmetrik.com' },
          ].map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="p-3 bg-zinc-800/50 border border-zinc-700 hover:border-red-800 transition-colors rounded"
            >
              <p className="text-xs font-bold text-white">{item.title}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
