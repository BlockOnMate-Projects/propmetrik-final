'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function DPAPage() {
    const lastUpdated = 'January 16, 2026';

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

                    <h1 className="text-4xl md:text-6xl font-bold mb-4">Data Processing Agreement</h1>
                    <p className="text-muted-foreground mb-4">For Enterprise Customers</p>
                    <p className="text-muted-foreground mb-12">Last updated: {lastUpdated}</p>

                    <div className="prose prose-invert prose-lg max-w-none">
                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">1. Purpose and Scope</h2>
                            <p className="text-muted-foreground mb-4">
                                This Data Processing Agreement ("DPA") forms part of the service agreement between PROPMETRIK ("Processor") and our Enterprise customers ("Controller") regarding the processing of personal data in compliance with:
                            </p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Ghana Data Protection Act, 2012 (Act 843)</li>
                                <li>EU General Data Protection Regulation (GDPR) where applicable</li>
                                <li>Other applicable data protection laws</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">2. Definitions</h2>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li><strong>Controller:</strong> The Enterprise customer determining purposes and means of processing</li>
                                <li><strong>Processor:</strong> PROPMETRIK processing personal data on behalf of Controller</li>
                                <li><strong>Personal Data:</strong> Information relating to identified or identifiable individuals</li>
                                <li><strong>Processing:</strong> Any operation performed on personal data</li>
                                <li><strong>Sub-processor:</strong> Third-party engaged by Processor to process personal data</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">3. Processing Details</h2>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">3.1 Nature and Purpose</h3>
                            <p className="text-muted-foreground mb-2">PROPMETRIK processes personal data to provide:</p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Property valuation and advisory services</li>
                                <li>Real estate data intelligence and analytics</li>
                                <li>Deal management and CRM functionality</li>
                                <li>Market research and reporting</li>
                            </ul>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">3.2 Types of Personal Data</h3>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Contact information (names, emails, phone numbers)</li>
                                <li>Professional details (company, job title)</li>
                                <li>Property information (addresses, valuations, transactions)</li>                                <li>Usage data (platform interactions, preferences)</li>
                                <li>Financial information (for transactions)</li>
                            </ul>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">3.3 Categories of Data Subjects</h3>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Enterprise customer employees and users</li>
                                <li>Property owners and tenants</li>
                                <li>Real estate agents and brokers</li>
                                <li>Prospective buyers and investors</li>
                            </ul>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">3.4 Duration</h3>
                            <p className="text-muted-foreground">
                                Processing continues for the duration of the service agreement, plus retention periods required by law or as specified in the agreement.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">4. Processor Obligations</h2>
                            <p className="text-muted-foreground mb-2">PROPMETRIK commits to:</p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Process personal data only on documented instructions from the Controller</li>
                                <li>Ensure personnel processing data are bound by confidentiality</li>
                                <li>Implement appropriate technical and organizational security measures</li>
                                <li>Engage sub-processors only with prior written authorization</li>
                                <li>Assist Controller in responding to data subject rights requests</li>
                                <li>Assist Controller with data protection impact assessments</li>
                                <li>Delete or return data upon termination (unless retention required by law)</li>
                                <li>Make available information demonstrating compliance</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">5. Security Measures</h2>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">5.1 Technical Measures</h3>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Encryption in transit (TLS 1.3) and at rest (AES-256)</li>
                                <li>Multi-factor authentication for user access</li>
                                <li>Regular security patches and updates</li>
                                <li>Intrusion detection and prevention systems</li>
                                <li>Regular vulnerability scanning and penetration testing</li>
                            </ul>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">5.2 Organizational Measures</h3>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Access controls based on principle of least privilege</li>
                                <li>Employee training on data protection</li>
                                <li>Background checks for personnel with data access</li>
                                <li>Incident response and business continuity plans</li>
                                <li>Regular security audits and certifications</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">6. Sub-processors</h2>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">6.1 Authorized Sub-processors</h3>
                            <p className="text-muted-foreground mb-4">
                                PROPMETRIK engages the following sub-processors:
                            </p>
                            <div className="bg-card border border-border rounded-lg p-6 mb-4">
                                <table className="w-full text-sm text-muted-foreground">
                                    <thead className="border-b border-border">
                                        <tr>
                                            <th className="text-left py-2">Entity</th>
                                            <th className="text-left py-2">Purpose</th>
                                            <th className="text-left py-2">Location</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-border">
                                            <td className="py-2">Amazon Web Services</td>
                                            <td className="py-2">Cloud hosting</td>
                                            <td className="py-2">EU/US</td>
                                        </tr>
                                        <tr className="border-b border-border">
                                            <td className="py-2">Google Cloud</td>
                                            <td className="py-2">Analytics & Storage</td>
                                            <td className="py-2">EU/US</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2">Stripe</td>
                                            <td className="py-2">Payment processing</td>
                                            <td className="py-2">Global</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="text-xl font-bold text-foreground mb-3 mt-6">6.2 Sub-processor Changes</h3>
                            <p className="text-muted-foreground">
                                PROPMETRIK will notify Controller of any intended changes to sub-processors at least 30 days in advance. Controller may object to changes on reasonable grounds.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">7. Data Breach Notification</h2>
                            <p className="text-muted-foreground mb-4">
                                In the event of a personal data breach, PROPMETRIK will:
                            </p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Notify Controller without undue delay (within 72 hours where feasible)</li>
                                <li>Provide description of the breach and affected data</li>
                                <li>Detail likely consequences and mitigation measures taken</li>
                                <li>Provide contact point for further information</li>
                                <li>Cooperate with Controller's incident response</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">8. International Transfers</h2>
                            <p className="text-muted-foreground mb-4">
                                Where personal data is transferred outside Ghana, PROPMETRIK ensures adequate safeguards through:
                            </p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Standard Contractual Clauses (SCCs) approved by regulatory authorities</li>
                                <li>Adequacy decisions recognizing equivalent data protection</li>
                                <li>Binding Corporate Rules where applicable</li>
                                <li>Specific consent for certain transfers</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">9. Audit Rights</h2>
                            <p className="text-muted-foreground mb-4">
                                Controller has the right to:
                            </p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Request and review audit reports (SOC 2, ISO 27001)</li>
                                <li>Conduct audits or inspections with reasonable notice (once per year)</li>
                                <li>Engage third-party auditors (subject to confidentiality agreements)</li>
                            </ul>
                            <p className="text-muted-foreground mt-4">
                                PROPMETRIK will provide reasonable cooperation for audits, subject to confidentiality and operational constraints.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">10. Return and Deletion of Data</h2>
                            <p className="text-muted-foreground mb-4">
                                Upon termination or expiry of services, PROPMETRIK will:
                            </p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                                <li>Return all personal data to Controller in standard format (within 30 days)</li>
                                <li>Delete all copies of personal data from systems</li>
                                <li>Certify deletion upon Controller request</li>
                                <li>Retain data only where required by applicable law</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">11. Liability and Indemnification</h2>
                            <p className="text-muted-foreground">
                                Each party's liability under this DPA is subject to limitations in the main service agreement. PROPMETRIK indemnifies Controller for damages arising from PROPMETRIK's breach of data protection obligations, subject to applicable limitations.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">12. Duration and Termination</h2>
                            <p className="text-muted-foreground">
                                This DPA remains in effect for the duration of the service agreement and any retention periods required for data deletion or return. Termination of the service agreement automatically terminates this DPA, subject to data return/deletion obligations.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">13. Contact for DPA Matters</h2>
                            <p className="text-muted-foreground">
                                For DPA-related inquiries or data protection concerns:<br /><br />
                                Email: dpo@propmetrik.com<br />
                                Address: PROPMETRIK, Data Protection Officer, Accra, Ghana
                            </p>
                        </section>
                    </div>

                    <div className="mt-16 pt-8 border-t border-border">
                        <Link href="/privacy">
                            <motion.div
                                whileHover={{ x: 5 }}
                                className="p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors inline-block"
                            >
                                <div className="text-sm text-muted-foreground mb-1">Related</div>
                                <div className="font-bold text-foreground">Privacy Policy →</div>
                            </motion.div>
                        </Link>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
