'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Search } from 'lucide-react';

export default function FAQPage() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const faqCategories = [
        {
            category: 'General',
            questions: [
                {
                    question: 'What is PropMetrik?',
                    answer: 'PropMetrik is Ghana\'s leading proptech platform providing automated property valuations, real estate data intelligence, deal management tools, and market research. We serve banks, developers, investors, and real estate professionals across Ghana.'
                },
                {
                    question: 'Who can use PropMetrik?',
                    answer: 'Our platform serves financial institutions, property developers, real estate agencies, investors, property managers, and individuals looking for property valuations or market data in Ghana.'
                },
                {
                    question: 'Which areas in Ghana do you cover?',
                    answer: 'We cover all major urban centers including Greater Accra (Accra, Tema), Ashanti Region (Kumasi), Western Region (Takoradi), Central Region (Cape Coast), and Northern Region (Tamale). Our database includes over 50,000 verified property transactions.'
                },
            ]
        },
        {
            category: 'Valuation Services',
            questions: [
                {
                    question: 'How accurate are your property valuations?',
                    answer: 'Our automated valuation models (AVMs) achieve 95%+ accuracy by analyzing 50,000+ verified Ghana property transactions. All valuations are reviewed by RICS-certified professionals for quality assurance.'
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
                    answer: 'Our comprehensive valuation reports with RICS verification are suitable for most mortgage and financing purposes. However, we recommend confirming with your specific lender as requirements may vary.'
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
                    answer: 'Pricing varies by service: Automated Valuations start from GHS 150, Market Intelligence subscriptions range from GHS 500-1,500/month, and Enterprise solutions are custom-priced. Visit our pricing page for detailed information.'
                },
                {
                    question: 'Do you offer free trials?',
                    answer: 'Yes! We offer a 14-day free trial for our Market Intelligence and Deal Management subscriptions. No credit card required to start.'
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
                    answer: 'Absolutely. We use bank-level encryption (AES-256) for data at rest and TLS 1.3 for data in transit. We\'re fully compliant with the Ghana Data Protection Act and implement regular security audits.'
                },
                {
                    question: 'Do you have a mobile app?',
                    answer: 'Our platform is fully responsive and works on mobile browsers. Native iOS and Android apps are currently in development and will be launched in Q2 2026.'
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
        <main className="pt-32 pb-24 bg-zinc-950">
            {/* Hero Section */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-3xl mx-auto text-center"
                    >
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
                            Frequently Asked{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Questions
                            </span>
                        </h1>
                        <p className="text-xl text-zinc-400 leading-relaxed mb-8">
                            Find answers to common questions about our services, pricing, and platform.
                        </p>

                        {/* Search Bar */}
                        <div className="relative max-w-2xl mx-auto">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Search for answers..."
                                className="w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-800 text-white rounded-lg focus:outline-none focus:border-primary transition-colors"
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
                            <h2 className="text-2xl font-bold text-white mb-6 pb-4 border-b border-zinc-800">
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
                                            className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                                        >
                                            <button
                                                onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                                                className="w-full flex items-center justify-between p-6 text-left"
                                            >
                                                <span className="text-lg font-bold text-white pr-4">
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
                                                <div className="px-6 pb-6 text-zinc-400 leading-relaxed">
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
            <section className="py-16 border-t border-zinc-800">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                            Still Have Questions?
                        </h2>
                        <p className="text-xl text-zinc-400 mb-8">
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
                                    className="px-8 py-4 border-2 border-zinc-700 text-white font-bold rounded hover:border-primary hover:text-primary transition-colors"
                                >
                                    Start Free Trial
                                </motion.button>
                            </Link>
                        </div>

                        <div className="mt-12 pt-12 border-t border-zinc-800">
                            <div className="grid md:grid-cols-3 gap-8">
                                <div>
                                    <h3 className="font-bold text-white mb-2">Email Support</h3>
                                    <p className="text-zinc-400 text-sm">support@propmetrik.com</p>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white mb-2">Sales Inquiries</h3>
                                    <p className="text-zinc-400 text-sm">sales@propmetrik.com</p>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white mb-2">Response Time</h3>
                                    <p className="text-zinc-400 text-sm">Within 24 hours</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
