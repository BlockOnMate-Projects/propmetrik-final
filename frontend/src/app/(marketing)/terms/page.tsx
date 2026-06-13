'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function TermsOfServicePage() {
    const lastUpdated = 'January 16, 2026';

    const sections = [
        {
            title: '1. Acceptance of Terms',
            content: `By accessing or using PROPMETRIK's platform and services ("Services"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our Services. These Terms constitute a legally binding agreement between you and PROPMETRIK, a company registered in Ghana.`
        },
        {
            title: '2. Description of Services',
            content: `PROPMETRIK provides:
• Property valuation and advisory services
• Real estate data intelligence and analytics
• Deal management and CRM tools
• Market research and reporting
• API access to real estate data

We reserve the right to modify, suspend, or discontinue any part of our Services with or without notice.`
        },
        {
            title: '3. Account Registration and Security',
            content: `To use certain features, you must create an account. You agree to:
• Provide accurate, current, and complete information
• Maintain and update your information
• Keep your password secure and confidential
• Notify us immediately of unauthorized access
• Accept responsibility for all activities under your account

You must be at least 18 years old to create an account.`
        },
        {
            title: '4. User Obligations and Conduct',
            content: `You agree NOT to:
• Violate any applicable laws or regulations in Ghana
• Infringe intellectual property rights
• Upload malicious code or viruses
• Attempt unauthorized access to our systems
• Scrape, harvest, or collect user data without permission
• Use our Services for fraudulent purposes
• Impersonate others or misrepresent your affiliation
• Interfere with or disrupt the Services`
        },
        {
            title: '5. Payment Terms',
            content: `Subscription Services:
• Fees are charged in Ghana Cedis (GHS)
• Subscriptions renew automatically unless cancelled
• All fees are non-refundable except as required by law
• We reserve the right to change pricing with 30 days notice
• Failed payments may result in service suspension

One-Time Services:
• Valuation and research fees are payable upfront
• Services commence upon payment confirmation`
        },
        {
            title: '6. Intellectual Property Rights',
            content: `PROPMETRIK Content:
• All content, trademarks, and data on our platform are owned by PROPMETRIK
• You receive a limited, non-exclusive license to access and use our Services
• You may not copy, modify, distribute, or create derivative works

User Content:
• You retain ownership of content you submit
• You grant us a license to use your content for service provision
• You represent that you have rights to all content you submit`
        },
        {
            title: '7. Valuation Services  Disclaimer',
            content: `Our automated valuations are estimates based on available data and algorithms. They:
• Should not replace professional appraisals for formal purposes
• Are subject to data quality and market conditions
• May not reflect unique property characteristics
• Are provided "as is" without guarantees of accuracy

For mortgage, legal, or formal purposes, consult a licensed RICS-accredited valuer.`
        },
        {
            title: '8. Data Accuracy and Third-Party Sources',
            content: `While we strive for data accuracy:
• Information is provided "as is" without warranties
• We rely on third-party data sources (Lands Commission, public records)
• Users should independently verify critical information
• We are not liable for errors or omissions in data
• Historical data may not predict future market conditions`
        },
        {
            title: '9. Limitation of Liability',
            content: `To the maximum extent permitted by Ghanaian law:
• PROPMETRIK is not liable for indirect, incidental, or consequential damages
• Our total liability shall not exceed fees paid in the 12 months preceding the claim
• We are not liable for third-party actions or content
• Service interruptions or data loss due to factors beyond our control

This limitation applies even if we have been advised of the possibility of damages.`
        },
        {
            title: '10. Indemnification',
            content: `You agree to indemnify and hold PROPMETRIK harmless from claims arising from:
• Your violation of these Terms
• Your violation of any law or third-party rights
• Your use of the Services
• Content you submit to the platform

This obligation survives termination of your account.`
        },
        {
            title: '11. Term and Termination',
            content: `These Terms remain in effect until terminated. We may terminate or suspend your account:
• Immediately for Terms violations
• With notice for non-payment
• At our discretion with 30 days notice

Upon termination:
• Your access rights cease immediately
• You remain liable for outstanding fees
• Provisions that naturally survive termination (indemnification, limitation of liability) continue`
        },
        {
            title: '12. Dispute Resolution and Governing Law',
            content: `Governing Law:
• These Terms are governed by the laws of Ghana
• Exclusive jurisdiction: Courts of Accra, Ghana

Dispute Resolution:
1. Informal resolution: Contact us first to resolve disputes
2. Mediation: Good-faith mediation before litigation
3. Arbitration: Binding arbitration under Ghanaian law (optional by mutual agreement)
4. Litigation: As a last resort in Ghanaian courts

Class Action Waiver:
• Disputes must be brought individually, not as class actions`
        },
        {
            title: '13. Changes to Terms',
            content: `We may modify these Terms at any time. Changes will be effective:
• Immediately for new users
• 30 days after notification for existing users (via email or platform)

Continued use after changes constitutes acceptance. Material changes will be prominently notified.`
        },
        {
            title: '14. Miscellaneous',
            content: `Severability: If any provision is unenforceable, the remaining provisions continue in effect.

Waiver: Failure to enforce any right does not waive that right.

Assignment: You may not assign these Terms. We may assign to affiliates or successors.

Entire Agreement: These Terms, Privacy Policy, and other referenced policies constitute the entire agreement.

Force Majeure: We are not liable for delays or failures due to circumstances beyond our control.`
        },
        {
            title: '15. Contact Information',
            content: `For questions about these Terms:

Email: legal@propmetrik.com
Address: PROPMETRIK, Accra, Ghana
Phone: [To be added]

For service support: support@propmetrik.com`
        }
    ];

    return (
        <main className="pt-32 pb-24 bg-background text-foreground">
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

                    <h1 className="text-4xl md:text-6xl font-bold mb-4">Terms of Service</h1>
                    <p className="text-muted-foreground mb-12">Last updated: {lastUpdated}</p>

                    <div className="prose prose-invert prose-lg max-w-none">
                        {sections.map((section, index) => (
                            <motion.section
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.05 }}
                                className="mb-12"
                            >
                                <h2 className="text-2xl font-bold text-foreground mb-4">{section.title}</h2>
                                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                                    {section.content}
                                </p>
                            </motion.section>
                        ))}
                    </div>

                    <div className="mt-16 pt-8 border-t border-border">
                        <div className="grid md:grid-cols-2 gap-4">
                            <Link href="/privacy">
                                <motion.div
                                    whileHover={{ x: 5 }}
                                    className="p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
                                >
                                    <div className="text-sm text-muted-foreground mb-1">Related</div>
                                    <div className="font-bold text-foreground">Privacy Policy →</div>
                                </motion.div>
                            </Link>
                            <Link href="/acceptable-use">
                                <motion.div
                                    whileHover={{ x: 5 }}
                                    className="p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
                                >
                                    <div className="text-sm text-muted-foreground mb-1">Related</div>
                                    <div className="font-bold text-foreground">Acceptable Use Policy →</div>
                                </motion.div>
                            </Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
