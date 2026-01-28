'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';

type ServiceCategory = 'full' | 'pm' | 'crm' | 'data';

export default function PricingPage() {
    const [category, setCategory] = useState<ServiceCategory>('full');

    const pricingData = {
        full: [
            {
                name: "Core Package",
                price: "GHS 390",
                period: "/month",
                target: "Starters & Individuals",
                description: "Essential tools for individual agents and small property owners.",
                features: [
                    "Access to public listings",
                    "Basic Valuation (limited)",
                    "Standard Market Reports",
                    "Email Support",
                    "1 User Seat"
                ],
                cta: "Start Free Trial",
                highlight: false
            },
            {
                name: "Pro Package",
                price: "GHS 975",
                period: "/month",
                target: "Agencies & Developers",
                description: "Advanced intelligence for growing agencies and developers.",
                features: [
                    "All Core Features",
                    "Unlimited Valuations",
                    "Historical Transaction Data",
                    "CRM & Deal Management",
                    "Priority Support",
                    "Up to 5 User Seats"
                ],
                cta: "Get Started",
                highlight: true
            },
            {
                name: "Enterprise",
                price: "GHS 3,250",
                period: "/month",
                target: "Banks & Institutions",
                description: "Full-scale platform access for large financial organizations.",
                features: [
                    "Full API Access (100k calls)",
                    "Portfolio Analysis Tools",
                    "Risk & Compliance Modules",
                    "Custom Reporting",
                    "Dedicated Account Manager",
                    "Unlimited Seats"
                ],
                cta: "Contact Sales",
                highlight: false
            }
        ],
        pm: [
            {
                name: "Basic",
                price: "GHS 390",
                period: "/month",
                target: "Small Portfolios",
                description: "Streamlined management for private landlords.",
                features: [
                    "Up to 100 Properties",
                    "Tenant Portal",
                    "Maintenance Tracking",
                    "Basic Accounting",
                    "Lease Management"
                ],
                cta: "Start Basic",
                highlight: false
            },
            {
                name: "Premium",
                price: "GHS 780",
                period: "/month",
                target: "Property Managers",
                description: "Professional tools for scaling operations.",
                features: [
                    "Up to 500 Properties",
                    "Vendor Management",
                    "Automated Invoicing",
                    "Owner Portals",
                    "Vacancy Marketing"
                ],
                cta: "Go Premium",
                highlight: true
            },
            {
                name: "Enterprise",
                price: "GHS 1,560",
                period: "/month",
                target: "Large Corporations",
                description: "Unlimited scale for major real estate firms.",
                features: [
                    "Unlimited Properties",
                    "Multi-User Roles",
                    "Custom Workflows",
                    "API Integration",
                    "Dedicated Support"
                ],
                cta: "Contact Sales",
                highlight: false
            }
        ],
        crm: [
            {
                name: "Starter",
                price: "GHS 325",
                period: "/month",
                target: "Solo Agents",
                description: "Organize your leads and close more deals.",
                features: [
                    "Up to 5 Users",
                    "Lead Pipeline",
                    "Contact Management",
                    "Task & Calendar Sync",
                    "Mobile App Access"
                ],
                cta: "Start CRM",
                highlight: false
            },
            {
                name: "Professional",
                price: "GHS 650",
                period: "/month",
                target: "Growing Teams",
                description: "Collaboration tools for successful agencies.",
                features: [
                    "Up to 20 Users",
                    "Team Performance Reports",
                    "Document Generation",
                    "E-Signature Integration",
                    "Email Campaigns"
                ],
                cta: "Upgrade Team",
                highlight: true
            },
            {
                name: "Enterprise",
                price: "GHS 1,300",
                period: "/month",
                target: "Brokerages",
                description: "Complete control for large sales organizations.",
                features: [
                    "Unlimited Users",
                    "Advanced Permissions",
                    "Commission Tracking",
                    "Territory Management",
                    "API Access"
                ],
                cta: "Contact Sales",
                highlight: false
            }
        ],
        data: [
            {
                name: "Developer",
                price: "GHS 260",
                period: "/month",
                target: "App Builders",
                description: "Integrate trusted data into your applications.",
                features: [
                    "1,000 API Calls",
                    "Standard Endpoints",
                    "Weekly Updates",
                    "Community Support",
                    "Sandbox Access"
                ],
                cta: "Get API Key",
                highlight: false
            },
            {
                name: "Business",
                price: "GHS 650",
                period: "/month",
                target: "PropTech Startups",
                description: "Scale your product with high-volume access.",
                features: [
                    "10,000 API Calls",
                    "Advanced Filtering",
                    "Daily Updates",
                    "Priority Email Support",
                    "Increased Rate Limits"
                ],
                cta: "Scale Up",
                highlight: true
            },
            {
                name: "Enterprise",
                price: "GHS 1,950",
                period: "/month",
                target: "Data Aggregators",
                description: "Massive scale for data-intensive operations.",
                features: [
                    "100,000 API Calls",
                    "Full Database Access",
                    "Real-time Webhooks",
                    "SLA Guarantee",
                    "Dedicated Solutions Engineer"
                ],
                cta: "Talk to Sales",
                highlight: false
            }
        ]
    };

    return (
        <main className="pt-32 pb-24">
            <div className="container mx-auto px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-4xl mx-auto text-center mb-16"
                >
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8">
                        Pricing that scales <br />
                        <span className="text-primary">with you</span>
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-12">
                        Choose the Full Platform for complete access, or select individual modules tailored to your specific needs.
                    </p>

                    {/* Category Tabs */}
                    <div className="flex flex-wrap justify-center gap-2 mb-16">
                        {[
                            { id: 'full', label: 'Full Platform' },
                            { id: 'pm', label: 'Property Management' },
                            { id: 'crm', label: 'CRM' },
                            { id: 'data', label: 'Data Intelligence' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setCategory(tab.id as ServiceCategory)}
                                className={`px-6 py-3 rounded-full text-sm font-bold transition-all border ${category === tab.id
                                    ? 'bg-primary text-primary-foreground border-primary shadow-lg scale-105'
                                    : 'bg-card text-muted-foreground border-border hover:border-zinc-700 hover:text-white'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Pricing Cards */}
                <div className="grid md:grid-cols-3 gap-8 items-start">
                    {pricingData[category].map((tier, idx) => (
                        <motion.div
                            key={`${category}-${idx}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: idx * 0.1 }}
                            className={`relative p-8 rounded-xl border flex flex-col h-full ${tier.highlight ? 'border-primary bg-primary/5' : 'border-border bg-card'
                                }`}
                        >
                            {tier.highlight && (
                                <div className="absolute top-0 right-0 -mt-3 -mr-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-sm shadow-lg">
                                    Recommended
                                </div>
                            )}

                            <div className="mb-8">
                                <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                                <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium mb-4">{tier.target}</p>
                                <p className="text-zinc-400 text-sm leading-relaxed min-h-[40px]">{tier.description}</p>
                            </div>

                            <div className="flex items-baseline gap-1 mb-8">
                                <span className="text-4xl font-bold">{tier.price}</span>
                                <span className="text-muted-foreground">{tier.period}</span>
                            </div>

                            <ul className="space-y-4 mb-8 flex-1">
                                {tier.features.map((feat, i) => (
                                    <li key={i} className="flex gap-3 text-sm">
                                        <span className="text-primary font-bold">✓</span>
                                        <span className="text-zinc-300">{feat}</span>
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={`/signup?plan=${tier.name.toLowerCase().replace(/ /g, '-')}&category=${category}`}
                                className={`block w-full py-4 text-center text-sm font-bold uppercase tracking-widest rounded-sm transition-all ${tier.highlight
                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg'
                                        : 'bg-zinc-800 text-white hover:bg-zinc-700'
                                    }`}>
                                {tier.cta}
                            </Link>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-24 text-center border-t border-border pt-16">
                    <h3 className="text-2xl font-bold mb-6">Need a custom solution?</h3>
                    <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                        For government agencies and international entities requiring custom integrations or regional rollout plans.
                    </p>
                    <Link href="/contact" className="text-primary font-bold hover:underline">
                        Contact our Enterprise Team →
                    </Link>
                </div>
            </div>
        </main>
    );
}
