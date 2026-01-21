'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
    const lastUpdated = 'January 16, 2026';

    const sections = [
        {
            title: '1. Introduction',
            content: `PropMetrik ("we," "our," or "us") respects your privacy and is committed to protecting your personal data. This privacy policy explains how we collect, use, share, and protect your personal information when you use our real estate platform and services, in compliance with the Ghana Data Protection Act, 2012 (Act 843) and international best practices.`
        },
        {
            title: '2. Information We Collect',
            subsections: [
                {
                    subtitle: '2.1 Information You Provide',
                    content: `We collect information you directly provide when you create an account, use our services, or contact us, including:
• Name, email address, phone number
• Company/organization details
• Property information and valuations requests
• Payment and billing information
• Communications with our support team`
                },
                {
                    subtitle: '2.2 Information We Collect Automatically',
                    content: `When you use our platform, we automatically collect certain information, including:
• Device information (IP address, browser type, operating system)
• Usage data (pages visited, features used, time spent)
• Location data (when you grant permission)
• Cookies and similar tracking technologies`
                },
                {
                    subtitle: '2.3 Information from Third Parties',
                    content: `We may receive information from:
• Credit bureaus and identity verification services
• Ghana Lands Commission (for title verification)
• Business partners and service providers`
                }
            ]
        },
        {
            title: '3. How We Use Your Information',
            content: `We use your personal data to:
• Provide and improve our services (valuations, data access, deal management)
• Process transactions and send related information
• Send service updates, security alerts, and support messages
• Conduct market research and analytics
• Personalize your experience and deliver relevant content
• Detect and prevent fraud and security threats
• Comply with legal obligations and regulatory requirements in Ghana`
        },
        {
            title: '4. Legal Basis for Processing',
            content: `Under the Ghana Data Protection Act, we process your data based on:
• Contractual necessity: To fulfill our services agreement with you
• Legitimate interests: For business operations, fraud prevention, and service improvement
• Legal obligations: To comply with Ghanaian laws and regulations
• Consent: Where you have explicitly agreed to specific processing activities`
        },
        {
            title: '5. Data Sharing and Disclosure',
            subsections: [
                {
                    subtitle: '5.1 Service Providers',
                    content: `We share data with trusted third-party service providers who assist with:
• Cloud hosting and data storage
• Payment processing
• Email and communication services
• Analytics and performance monitoring

All service providers are contractually bound to protect your data and use it only for specified purposes.`
                },
                {
                    subtitle: '5.2 Business Partners',
                    content: `With your consent, we may share data with:
• Real estate agents and brokers
• Property developers and managers
• Financial institutions (for mortgage and financing services)`
                },
                {
                    subtitle: '5.3 Legal Requirements',
                    content: `We may disclose your information when required by law, including:
• Compliance with court orders or subpoenas
• Response to lawful requests from Ghanaian authorities
• Protection of our rights, property, or safety
• Prevention of fraud or illegal activities`
                }
            ]
        },
        {
            title: '6. Data Security',
            content: `We implement industry-standard security measures to protect your data, including:
• Encryption of data in transit (TLS/SSL) and at rest (AES-256)
• Regular security audits and penetration testing
• Access controls and authentication requirements
• Employee training on data protection
• Incident response procedures

However, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security.`
        },
        {
            title: '7. Data Retention',
            content: `We retain your personal data only as long as necessary to fulfill the purposes outlined in this policy and comply with legal requirements:
• Account information: Duration of active account plus 7 years
• Transaction records: 10 years (Ghana tax law requirements)
• Marketing preferences: Until you opt out or close your account
• Anonymized analytics data: Indefinitely

You can request deletion of your data by contacting us, subject to legal retention requirements.`
        },
        {
            title: '8. Your Rights',
            content: `Under the Ghana Data Protection Act, you have the right to:
• Access: Request a copy of your personal data
• Rectification: Correct inaccurate or incomplete data
• Erasure: Request deletion of your data (subject to legal obligations)
• Restriction: Limit how we process your data
• Portability: Receive your data in a standard format
• Object: Opt out of certain processing activities (e.g., marketing)
• Withdraw consent: At any time, where processing is based on consent

To exercise these rights, contact us at privacy@propmetrik.com`
        },
        {
            title: '9. Cookies and Tracking',
            content: `We use cookies and similar technologies to:
• Remember your preferences and settings
• Analyze platform usage and performance
• Deliver personalized content and advertising
• Enable security features

You can control cookies through your browser settings. See our Cookie Policy for more details.`
        },
        {
            title: '10. International Data Transfers',
            content: `Your data may be transferred to and processed in countries outside Ghana, including cloud servers in the EU and US. We ensure appropriate safeguards are in place, including:
• Standard contractual clauses approved by regulatory authorities
• Adequacy decisions recognizing equivalent data protection
• Your explicit consent for specific transfers`
        },
        {
            title: '11. Children\'s Privacy',
            content: `Our services are not directed to individuals under 18 years of age. We do not knowingly collect personal information from children. If you believe we have inadvertently collected data from a child, please contact us immediately.`
        },
        {
            title: '12. Changes to This Policy',
            content: `We may update this privacy policy periodically to reflect changes in our practices or legal requirements. We will notify you of material changes via email or platform notification. Continued use of our services after changes constitutes acceptance of the updated policy.`
        },
        {
            title: '13. Contact Us',
            content: `For questions about this privacy policy or to exercise your data protection rights:

Email: privacy@propmetrik.com
Address: PropMetrik, Accra, Ghana
Data Protection Officer: dpo@propmetrik.com

You also have the right to lodge a complaint with the Data Protection Commission of Ghana if you believe we have violated your data protection rights.`
        }
    ];

    return (
        <main className="pt-32 pb-24 bg-zinc-950 text-white">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="mb-12">
                        <Link href="/" className="text-primary hover:text-primary/80 transition-colors text-sm font-medium">
                            ← Back to Home
                        </Link>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-bold mb-4">Privacy Policy</h1>
                    <p className="text-zinc-400 mb-12">Last updated: {lastUpdated}</p>

                    <div className="prose prose-invert prose-lg max-w-none">
                        {sections.map((section, index) => (
                            <motion.section
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="mb-12"
                            >
                                <h2 className="text-2xl font-bold text-white mb-4">{section.title}</h2>

                                {section.content && (
                                    <p className="text-zinc-300 leading-relaxed whitespace-pre-line mb-6">
                                        {section.content}
                                    </p>
                                )}

                                {section.subsections && section.subsections.map((subsection, subIndex) => (
                                    <div key={subIndex} className="mb-6">
                                        <h3 className="text-xl font-bold text-white mb-3">{subsection.subtitle}</h3>
                                        <p className="text-zinc-300 leading-relaxed whitespace-pre-line">
                                            {subsection.content}
                                        </p>
                                    </div>
                                ))}
                            </motion.section>
                        ))}
                    </div>

                    {/* Footer Navigation */}
                    <div className="mt-16 pt-8 border-t border-zinc-800">
                        <div className="grid md:grid-cols-2 gap-4">
                            <Link href="/terms">
                                <motion.div
                                    whileHover={{ x: 5 }}
                                    className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-primary/50 transition-colors"
                                >
                                    <div className="text-sm text-zinc-500 mb-1">Next</div>
                                    <div className="font-bold text-white">Terms of Service →</div>
                                </motion.div>
                            </Link>
                            <Link href="/cookies">
                                <motion.div
                                    whileHover={{ x: 5 }}
                                    className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-primary/50 transition-colors"
                                >
                                    <div className="text-sm text-zinc-500 mb-1">Related</div>
                                    <div className="font-bold text-white">Cookie Policy →</div>
                                </motion.div>
                            </Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
