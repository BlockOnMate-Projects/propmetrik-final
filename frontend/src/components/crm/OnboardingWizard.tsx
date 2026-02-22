'use client';

/**
 * CRM First-Run Onboarding Wizard
 *
 * A step-by-step guided setup that appears when a user first
 * accesses the CRM. Covers: pipeline setup, first contact, deal creation tips,
 * AI features overview. Progress is persisted in localStorage.
 */

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
    ArrowRight, ArrowLeft, Check, X, Sparkles,
    Building2, Users, Target, BarChart3, Phone, Bot,
    Layers, Zap, ChevronRight,
} from 'lucide-react';
import { pipelinesApi, contactsApi } from '@/lib/crm-api';

// ─── Types ──────────────────────────────────────────

interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    content: React.ReactNode;
    optional?: boolean;
    action?: () => Promise<void>;
    actionLabel?: string;
}

interface OnboardingWizardProps {
    className?: string;
    onComplete?: () => void;
}

const STORAGE_KEY = 'crm-onboarding-progress';

// ─── Component ──────────────────────────────────────

export function OnboardingWizard({ className, onComplete }: OnboardingWizardProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
    const [dismissed, setDismissed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pipelineCount, setPipelineCount] = useState(0);
    const [contactCount, setContactCount] = useState(0);

    // Load progress from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.dismissed) { setDismissed(true); return; }
                if (data.completed) setCompletedSteps(new Set(data.completed));
                if (data.step) setCurrentStep(data.step);
            } catch { /* ignore */ }
        }
    }, []);

    // Check existing data
    useEffect(() => {
        (async () => {
            try {
                const [pipelines, contacts] = await Promise.all([
                    pipelinesApi.getAll(),
                    contactsApi.getAll({ limit: 1 }),
                ]);
                setPipelineCount(Array.isArray(pipelines) ? pipelines.length : 0);
                setContactCount(contacts?.pagination?.total || contacts?.data?.length || 0);
            } catch { /* ignore */ }
        })();
    }, []);

    const saveProgress = useCallback((step: number, completed: Set<string>, isDismissed = false) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            step,
            completed: Array.from(completed),
            dismissed: isDismissed,
        }));
    }, []);

    const handleComplete = useCallback(() => {
        saveProgress(0, completedSteps, true);
        setDismissed(true);
        onComplete?.();
    }, [completedSteps, onComplete, saveProgress]);

    const markStepDone = useCallback((stepId: string) => {
        const next = new Set(completedSteps);
        next.add(stepId);
        setCompletedSteps(next);
        saveProgress(currentStep, next);
    }, [completedSteps, currentStep, saveProgress]);

    const steps: OnboardingStep[] = [
        {
            id: 'welcome',
            title: 'Welcome to CRM',
            description: 'Let\'s get your deal management pipeline configured in a few quick steps.',
            icon: <Sparkles className="w-6 h-6" />,
            content: (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { icon: <Target className="w-5 h-5" />, label: 'Deal Pipelines', desc: 'Track deals through stages' },
                            { icon: <Users className="w-5 h-5" />, label: 'Contacts', desc: 'Manage leads & clients' },
                            { icon: <BarChart3 className="w-5 h-5" />, label: 'Analytics', desc: 'Revenue & performance' },
                            { icon: <Bot className="w-5 h-5" />, label: 'AI Assistant', desc: 'Smart deal insights' },
                        ].map(item => (
                            <div key={item.label} className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border">
                                <span className="text-primary">{item.icon}</span>
                                <div>
                                    <p className="text-sm font-medium">{item.label}</p>
                                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            id: 'pipeline',
            title: 'Configure Pipelines',
            description: pipelineCount > 0
                ? `You already have ${pipelineCount} pipeline(s). You can customize stages from the Deals tab.`
                : 'Create your first deal pipeline with custom stages.',
            icon: <Layers className="w-6 h-6" />,
            content: (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Pipelines define the stages a deal moves through — from lead to close.
                        Common setups include:
                    </p>
                    <div className="space-y-2">
                        {[
                            { name: 'Sales Pipeline', stages: 'Lead → Qualified → Proposal → Negotiation → Closed' },
                            { name: 'Leasing Pipeline', stages: 'Inquiry → Viewing → Application → Approved → Signed' },
                            { name: 'Development Pipeline', stages: 'Site Selection → Due Diligence → Planning → Construction → Handover' },
                        ].map(p => (
                            <div key={p.name} className="p-3 rounded-lg bg-muted/30 border border-border">
                                <p className="text-sm font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">{p.stages}</p>
                            </div>
                        ))}
                    </div>
                    {pipelineCount === 0 && (
                        <p className="text-xs text-warning flex items-center gap-1">
                            <Zap className="w-3 h-3" /> No pipelines detected. Head to Deals → Pipeline Settings to create one.
                        </p>
                    )}
                </div>
            ),
        },
        {
            id: 'contacts',
            title: 'Add Your First Contact',
            description: contactCount > 0
                ? `Great — you have ${contactCount} contact(s) already!`
                : 'Import or manually add contacts to start tracking relationships.',
            icon: <Users className="w-6 h-6" />,
            content: (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Contacts are the people and organizations you work with. You can:
                    </p>
                    <ul className="space-y-2 text-sm">
                        {[
                            { icon: <Phone className="w-4 h-4" />, text: 'Add contacts manually with name, email, phone' },
                            { icon: <ArrowRight className="w-4 h-4" />, text: 'Bulk import from CSV (up to 500 at a time)' },
                            { icon: <Building2 className="w-4 h-4" />, text: 'Link contacts to companies and deals' },
                        ].map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-muted-foreground">
                                <span className="text-primary mt-0.5">{item.icon}</span>
                                {item.text}
                            </li>
                        ))}
                    </ul>
                </div>
            ),
        },
        {
            id: 'deals',
            title: 'Create Deals',
            description: 'Deals represent transactions you\'re working on. Link them to contacts, properties, and pipeline stages.',
            icon: <Target className="w-6 h-6" />,
            content: (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Each deal tracks value, probability, expected close date, and assigned agent.
                        Use the Kanban board to drag deals between stages.
                    </p>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                        <p className="text-xs text-foreground">
                            <strong>Pro tip:</strong> The AI assistant can analyze your pipeline and suggest deals that need attention.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: 'ai',
            title: 'Meet Kobby AI',
            description: 'Your AI assistant can answer questions about deals, contacts, and pipeline performance.',
            icon: <Bot className="w-6 h-6" />,
            content: (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Try asking questions like:
                    </p>
                    <div className="space-y-2">
                        {[
                            'What deals are closing this month?',
                            'Which agent has the highest conversion rate?',
                            'Show me stale deals that haven\'t moved in 2 weeks.',
                            'Generate a pipeline summary report.',
                        ].map(q => (
                            <div key={q} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm">
                                <ChevronRight className="w-3 h-3 text-primary flex-shrink-0" />
                                <span className="text-muted-foreground">{q}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
    ];

    if (dismissed) return null;

    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    const progress = Math.round(((currentStep + 1) / steps.length) * 100);

    return (
        <div className={cn('max-w-lg mx-auto', className)}>
            <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                {/* Header */}
                <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            {step.icon}
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground">{step.title}</h3>
                            <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {steps.length}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleComplete}
                        className="text-muted-foreground hover:text-foreground p-1 rounded"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Progress bar */}
                <div className="mx-5 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Content */}
                <div className="p-5">
                    <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
                    {step.content}
                </div>

                {/* Step indicator dots */}
                <div className="flex justify-center gap-1.5 pb-3">
                    {steps.map((s, i) => (
                        <button
                            key={s.id}
                            onClick={() => { setCurrentStep(i); saveProgress(i, completedSteps); }}
                            className={cn(
                                'w-2 h-2 rounded-full transition-all',
                                i === currentStep
                                    ? 'bg-primary w-6'
                                    : completedSteps.has(s.id)
                                        ? 'bg-success'
                                        : 'bg-muted-foreground/30',
                            )}
                        />
                    ))}
                </div>

                {/* Navigation */}
                <div className="px-5 pb-5 flex items-center justify-between">
                    <button
                        onClick={() => {
                            const prev = Math.max(0, currentStep - 1);
                            setCurrentStep(prev);
                            saveProgress(prev, completedSteps);
                        }}
                        disabled={currentStep === 0}
                        className={cn(
                            'flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-border',
                            'hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed',
                        )}
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back
                    </button>

                    <div className="flex items-center gap-2">
                        {step.optional && (
                            <button
                                onClick={() => {
                                    const next = Math.min(steps.length - 1, currentStep + 1);
                                    setCurrentStep(next);
                                    saveProgress(next, completedSteps);
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground"
                            >
                                Skip
                            </button>
                        )}
                        <button
                            onClick={async () => {
                                markStepDone(step.id);
                                if (step.action) {
                                    setLoading(true);
                                    try { await step.action(); } catch { /* ignore */ }
                                    setLoading(false);
                                }
                                if (isLast) {
                                    handleComplete();
                                } else {
                                    const next = currentStep + 1;
                                    setCurrentStep(next);
                                    saveProgress(next, completedSteps);
                                }
                            }}
                            disabled={loading}
                            className={cn(
                                'flex items-center gap-1 text-sm px-4 py-1.5 rounded-lg',
                                'bg-primary text-primary-foreground hover:bg-primary/90',
                                'disabled:opacity-50',
                            )}
                        >
                            {loading ? (
                                <span className="animate-spin w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
                            ) : isLast ? (
                                <>
                                    <Check className="w-3.5 h-3.5" />
                                    Finish Setup
                                </>
                            ) : (
                                <>
                                    Next
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default OnboardingWizard;
