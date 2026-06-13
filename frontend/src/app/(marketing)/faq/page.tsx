'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, Search } from 'lucide-react';

export default function FAQPage() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    // Pull the lowest live plan price so the pricing answer never drifts from the real pricing page.
    const [fromPrice, setFromPrice] = useState<number | null>(null);
    useEffect(() => {
        fetch('/api/subscriptions/plans')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const prices = (data?.plans || [])
                    .map((p: any) => Number(p.price_monthly_ghs))
                    .filter((n: number) => Number.isFinite(n) && n > 0);
                if (prices.length) setFromPrice(Math.min(...prices));
            })
            .catch(() => { /* fall back to generic copy */ });
    }, []);

    const pricingAnswer = fromPrice
        ? `Plans start from GHS ${fromPrice.toLocaleString()}/month, with full access from the moment you subscribe. Enterprise solutions are custom-priced — visit our pricing page for the full breakdown.`
        : 'Pricing varies by plan and module, and you get full access as soon as you subscribe. Visit our pricing page for current rates and details.';

    const faqCategories = [
        {
            category: 'General',
            questions: [
                {
                    question: 'What is PROPMETRIK?',
                    answer: 'PROPMETRIK is a Ghana-focused proptech platform providing automated property valuations, real estate data intelligence, deal management tools, and market research — built for banks, developers, investors, and real estate professionals across Ghana.'
                },
                {
                    question: 'Who can use PROPMETRIK?',
                    answer: 'Our platform serves financial institutions, property developers, real estate agencies, investors, property managers, and individuals looking for property valuations or market data in Ghana.'
                },
                {
                    question: 'Which areas in Ghana do you cover?',
                    answer: 'We cover all major urban centers including Greater Accra (Accra, Tema), Ashanti Region (Kumasi), Western Region (Takoradi), Central Region (Cape Coast), and Northern Region (Tamale). Our database is built to standardise verified property transactions across these markets.'
                },
            ]
        },
        {
            category: 'Valuation Services',
            questions: [
                {
                    question: 'How accurate are your property valuations?',
                    answer: 'Our automated valuation models (AVMs) are trained on verified Ghana property transactions, and every valuation is reviewed by qualified valuation professionals for quality assurance.'
                },
                {
                    question: 'How long does a valuation take?',
                    answer: 'Instant preliminary valuations are available immediately. Full comprehensive reports with expert verification are typically delivered within 24-48 hours.'
                },
                {
                    question: 'What information do I need to request a valuation?',
                    answer: 'Basic requirements include property location, size (land area and built-up area), property type, number of bedrooms/bathrooms, and property condition. Photos are helpful but optional.'
                },
                {
                    question: 'Can your valuations be used for mortgage applications?',
                    answer: 'Our comprehensive valuation reports are suitable for most mortgage and financing purposes. However, we recommend confirming with your specific lender as requirements may vary.'
                },
            ]
        },
        {
            category: 'Data & API Access',
            questions: [
                {
                    question: 'What data do you provide?',
                    answer: 'We provide market comparables (sold and rental properties), construction cost indices (materials and labor), price trends, market analytics, and soon land title verification data via Ghana Lands Commission integration.'
                },
                {
                    question: 'How do I access your API?',
                    answer: 'API access is available with our Professional and Enterprise plans. Contact our sales team for API documentation, authentication keys, and integration support.'
                },
                {
                    question: 'How often is your data updated?',
                    answer: 'Market comparables are updated weekly. Construction cost indices are updated bi-weekly. Quarterly market reports are published four times per year.'
                },
            ]
        },
        {
            category: 'Pricing & Billing',
            questions: [
                {
                    question: 'How much do your services cost?',
                    answer: pricingAnswer
                },
                {
                    question: 'How does billing work?',
                    answer: 'You subscribe to a plan and get full access immediately — no trial period. Payment is processed securely via Paystack (card or mobile money), and you can change plans or cancel anytime from your billing dashboard.'
                },
                {
                    question: 'What payment methods do you accept?',
                    answer: 'We accept mobile money (MTN, Vodafone, AirtelTigo), bank transfers, and major credit/debit cards via our secure payment processor.'
                },
                {
                    question: 'Can I cancel my subscription anytime?',
                    answer: 'Yes, you can cancel your subscription at any time. Your access continues until the end of your current billing period with no additional charges.'
                },
            ]
        },
        {
            category: 'Technical & Support',
            questions: [
                {
                    question: 'Is my data secure?',
                    answer: 'Protecting your data is a priority. Access is restricted to authorized users and data is transmitted over secure, encrypted (HTTPS) connections. We are actively working toward formal certification and full compliance with the Ghana Data Protection Act.'
                },
                {
                    question: 'Do you have a mobile app?',
                    answer: 'Our platform is fully responsive and works on any mobile browser. Native iOS and Android apps are in development — we\'ll announce availability soon.'
                },
                {
                    question: 'What support do you offer?',
                    answer: 'We provide email support for all users (24-48 hour response), priority support for Professional plan subscribers (12-hour response), and dedicated account managers for Enterprise clients.'
                },
                {
                    question: 'How do I report a data error?',
                    answer: 'Email us at support@propmetrik.com with details of the error, including property location and specific data point. We investigate all reports within 48 hours and correct verified errors immediately.'
                },
            ]
        },
    ];

    return (
        <main className="pt-32 pb-24 bg-background">
            {/* Hero Section */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-3xl mx-auto text-center"
                    >
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6">
                            Frequently Asked{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Questions
                            </span>
                        </h1>
                        <p className="text-xl text-muted-foreground leading-relaxed mb-8">
                            Find answers to common questions about our services, pricing, and platform.
                        </p>

                        {/* Search Bar */}
                        <div className="relative max-w-2xl mx-auto">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search for answers..."
                                className="w-full pl-12 pr-4 py-4 bg-card border border-border text-foreground rounded-lg focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* FAQ Categories */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6 max-w-4xl">
                    {faqCategories.map((category, categoryIndex) => (
                        <div key={categoryIndex} className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-6 pb-4 border-b border-border">
                                {category.category}
                            </h2>

                            <div className="space-y-4">
                                {category.questions.map((faq, faqIndex) => {
                                    const globalIndex = faqCategories
                                        .slice(0, categoryIndex)
                                        .reduce((acc, cat) => acc + cat.questions.length, 0) + faqIndex;

                                    const isOpen = openIndex === globalIndex;

                                    return (
                                        <motion.div
                                            key={faqIndex}
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: faqIndex * 0.05 }}
                                            className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                                        >
                                            <button
                                                onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                                                className="w-full flex items-center justify-between p-6 text-left"
                                            >
                                                <span className="text-lg font-bold text-foreground pr-4">
                                                    {faq.question}
                                                </span>
                                                <ChevronDown
                                                    className={`w-5 h-5 text-primary shrink-0 transition-transform ${isOpen ? 'transform rotate-180' : ''
                                                        }`}
                                                />
                                            </button>

                                            <motion.div
                                                initial={false}
                                                animate={{
                                                    height: isOpen ? 'auto' : 0,
                                                    opacity: isOpen ? 1 : 0
                                                }}
                                                transition={{ duration: 0.3 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                                                    {faq.answer}
                                                </div>
                                            </motion.div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Still Have Questions CTA */}
            <section className="py-16 border-t border-border">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                            Still Have Questions?
                        </h2>
                        <p className="text-xl text-muted-foreground mb-8">
                            Our team is here to help. Get in touch and we'll respond within 24 hours.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/contact">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold rounded hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Contact Support
                                </motion.button>
                            </Link>
                            <Link href="/signup">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 border-2 border-border text-foreground font-bold rounded hover:border-primary hover:text-primary transition-colors"
                                >
                                    Get Started
                                </motion.button>
                            </Link>
                        </div>

                        <div className="mt-12 pt-12 border-t border-border">
                            <div className="grid md:grid-cols-3 gap-8">
                                <div>
                                    <h3 className="font-bold text-foreground mb-2">Email Support</h3>
                                    <p className="text-muted-foreground text-sm">support@propmetrik.com</p>
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground mb-2">Sales Inquiries</h3>
                                    <p className="text-muted-foreground text-sm">sales@propmetrik.com</p>
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground mb-2">Response Time</h3>
                                    <p className="text-muted-foreground text-sm">Within 24 hours</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
