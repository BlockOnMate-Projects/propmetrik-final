import {
    Shield,
    LayoutDashboard,
    HardHat,
    DollarSign,
    Building2,
    Users,
    TrendingUp,
    Briefcase,
    FileSignature,
    CreditCard,
    Database,
    Plug,
    Settings,
} from 'lucide-react';

export interface Guide {
    slug: string;
    title: string;
    description: string;
    icon: typeof Shield;
    screenshotCount: number;
    chapter: number;
}

export const guides: Guide[] = [
    {
        slug: 'authentication',
        title: 'Authentication & Onboarding',
        description:
            'Sign up, log in, SSO via Keycloak, password recovery, team invitations, and initial platform setup.',
        icon: Shield,
        screenshotCount: 6,
        chapter: 1,
    },
    {
        slug: 'dashboard',
        title: 'Dashboard & Navigation',
        description:
            'Main dashboard overview, market intelligence ticker, profile settings, notifications, calendar, and portfolio.',
        icon: LayoutDashboard,
        screenshotCount: 7,
        chapter: 2,
    },
    {
        slug: 'project-management',
        title: 'Project Management',
        description:
            'Full construction lifecycle — projects, schedules, teams, bids, RFIs, submittals, site logs, safety, change orders, and more.',
        icon: HardHat,
        screenshotCount: 28,
        chapter: 3,
    },
    {
        slug: 'budget-cost',
        title: 'Budget & Cost Management',
        description:
            'Project budgets, cost tracking, variance analysis, invoices, payment schedules, and Xero integration.',
        icon: DollarSign,
        screenshotCount: 6,
        chapter: 4,
    },
    {
        slug: 'property-management',
        title: 'Property Management',
        description:
            'Portfolio management, properties, tenants, leases, rent collection, maintenance, and bulk operations.',
        icon: Building2,
        screenshotCount: 18,
        chapter: 5,
    },
    {
        slug: 'tenant-portal',
        title: 'Tenant Portal',
        description:
            'Tenant self-service portal for lease viewing, rent payments (card & crypto), maintenance requests, and messaging.',
        icon: Users,
        screenshotCount: 4,
        chapter: 6,
    },
    {
        slug: 'valuations',
        title: 'Valuations',
        description:
            'Institutional-grade valuations — sales comparison, cost approach, income, DRC, HBU, reconciliation, and report generation.',
        icon: TrendingUp,
        screenshotCount: 7,
        chapter: 7,
    },
    {
        slug: 'deals-crm',
        title: 'Deals & CRM',
        description:
            'Deal pipeline, contacts, agents, commissions, drip campaigns, documents, workflows, and analytics.',
        icon: Briefcase,
        screenshotCount: 20,
        chapter: 8,
    },
    {
        slug: 'e-signature',
        title: 'E-Signatures',
        description:
            'Digital document signing — envelope creation, multi-party signing, templates, lease and report envelopes.',
        icon: FileSignature,
        screenshotCount: 5,
        chapter: 9,
    },
    {
        slug: 'financial',
        title: 'Financial Services',
        description:
            'Billing, subscriptions, project invoices, payment processing, and cross-module financial reporting.',
        icon: CreditCard,
        screenshotCount: 6,
        chapter: 10,
    },
    {
        slug: 'data-hub',
        title: 'Data Hub & Analytics',
        description:
            'Market data, construction indices, economic indicators, ML insights, ETL pipelines, spiders, and forecasting.',
        icon: Database,
        screenshotCount: 31,
        chapter: 11,
    },
    {
        slug: 'integrations',
        title: 'Integrations',
        description:
            'Connect with Xero, WhatsApp, Paystack, NowPayments, custom APIs, webhooks, and marketplace extensions.',
        icon: Plug,
        screenshotCount: 3,
        chapter: 12,
    },
    {
        slug: 'admin-compliance',
        title: 'Admin & Compliance',
        description:
            'RBAC, audit logs, API keys, platform fees, publications, newsletter, customer success, and onboarding.',
        icon: Settings,
        screenshotCount: 16,
        chapter: 13,
    },
];

/** Map from URL slug to the docs folder name */
const slugToFolder: Record<string, string> = {
    authentication: '01-authentication',
    dashboard: '02-dashboard',
    'project-management': '03-project-management',
    'budget-cost': '04-budget-cost',
    'property-management': '05-property-management',
    'tenant-portal': '06-tenant-portal',
    valuations: '07-valuations',
    'deals-crm': '08-deals-crm',
    'e-signature': '09-e-signature',
    financial: '10-financial',
    'data-hub': '11-data-hub',
    integrations: '12-integrations',
    'admin-compliance': '13-admin-compliance',
    reporting: '14-reporting',
};

export function getFolderForSlug(slug: string): string {
    return slugToFolder[slug] || slug;
}

export function getGuideBySlug(slug: string): Guide | undefined {
    return guides.find((g) => g.slug === slug);
}

export function getAdjacentGuides(slug: string): { prev: Guide | null; next: Guide | null } {
    const idx = guides.findIndex((g) => g.slug === slug);
    return {
        prev: idx > 0 ? guides[idx - 1] : null,
        next: idx < guides.length - 1 ? guides[idx + 1] : null,
    };
}
