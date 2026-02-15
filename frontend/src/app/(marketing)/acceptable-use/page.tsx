'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function AcceptableUsePage() {
    const lastUpdated = 'January 16, 2026';

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

                    <h1 className="text-4xl md:text-6xl font-bold mb-4">Acceptable Use Policy</h1>
                    <p className="text-zinc-400 mb-12">Last updated: {lastUpdated}</p>

                    <div className="prose prose-invert prose-lg max-w-none">
                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">1. Purpose</h2>
                            <p className="text-zinc-300 leading-relaxed">
                                This Acceptable Use Policy ("Policy") governs your use of PROPMETRIK's platform and services. By using our Services, you agree to comply with this Policy. Violation may result in suspension or termination of your account.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">2. Prohibited Activities</h2>

                            <h3 className="text-xl font-bold text-white mb-3 mt-6">2.1 Illegal Activities</h3>
                            <p className="text-zinc-300 mb-2">You may NOT use our Services to:</p>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                                <li>Violate any law or regulation in Ghana or internationally</li>
                                <li>Engage in fraudulent or deceptive practices</li>
                                <li>Facilitate money laundering or terrorist financing</li>
                                <li>Infringe intellectual property rights</li>
                                <li>Distribute malware, viruses, or harmful code</li>
                            </ul>

                            <h3 className="text-xl font-bold text-white mb-3 mt-6">2.2 Misuse of Platform</h3>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                                <li>Attempt unauthorized access to systems or user accounts</li>
                                <li>Circumvent security measures or authentication mechanisms</li>
                                <li>Scrape, harvest, or collect data without permission</li>
                                <li>Reverse engineer, decompile, or disassemble the platform</li>
                                <li>Overload or disrupt servers through excessive requests</li>
                                <li>Use automated systems (bots) without authorization</li>
                            </ul>

                            <h3 className="text-xl font-bold text-white mb-3 mt-6">2.3 Content Violations</h3>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                                <li>Upload false or misleading property information</li>
                                <li>Post defamatory, obscene, or offensive content</li>
                                <li>Publish hate speech or discriminatory material</li>
                                <li>Share sexually explicit or violent content</li>
                                <li>Violate privacy rights of individuals</li>
                            </ul>

                            <h3 className="text-xl font-bold text-white mb-3 mt-6">2.4 Commercial Misuse</h3>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                                <li>Resell or redistribute our data without authorization</li>
                                <li>Use Services to compete with PROPMETRIK</li>
                                <li>Share account credentials with unauthorized parties</li>
                                <li>Use a single account for multiple businesses (unless Enterprise plan)</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">3. User Responsibilities</h2>
                            <h3 className="text-xl font-bold text-white mb-3">You agree to:</h3>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                                <li>Provide accurate and truthful information</li>
                                <li>Maintain the security of your account credentials</li>
                                <li>Comply with all applicable laws and regulations</li>
                                <li>Respect intellectual property rights</li>
                                <li>Report security vulnerabilities responsibly</li>
                                <li>Use Services in good faith and professionally</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">4. Consequences of Violations</h2>
                            <p className="text-zinc-300 mb-4">
                                Violation of this Policy may result in:
                            </p>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                                <li><strong>Warning:</strong> First-time minor violations may receive a written warning</li>
                                <li><strong>Temporary Suspension:</strong> Account access suspended for a defined period</li>
                                <li><strong>Permanent Termination:</strong> Account permanently closed without refund</li>
                                <li><strong>Legal Action:</strong> Pursuit of civil or criminal remedies for serious violations</li>
                                <li><strong>Reporting to Authorities:</strong> Illegal activities reported to Ghanaian law enforcement</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">5. Reporting Violations</h2>
                            <p className="text-zinc-300 mb-4">
                                If you become aware of violations of this Policy, please report them immediately:
                            </p>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                                <p className="text-zinc-300">
                                    <strong>Email:</strong> abuse@propmetrik.com<br />
                                    <strong>Subject Line:</strong> "AUP Violation Report"<br />
                                    <strong>Include:</strong> Details of the violation, evidence, and affected parties
                                </p>
                            </div>
                            <p className="text-zinc-300 mt-4">
                                We investigate all reports and take appropriate action. Reports are confidential.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">6. Monitoring and Enforcement</h2>
                            <p className="text-zinc-300 mb-4">
                                PROPMETRIK reserves the right to:
                            </p>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                                <li>Monitor usage patterns for compliance and security</li>
                                <li>Investigate suspected violations</li>
                                <li>Review user-generated content</li>
                                <li>Cooperate with law enforcement investigations</li>
                                <li>Disable accounts or features without prior notice</li>
                            </ul>
                            <p className="text-zinc-300 mt-4">
                                Monitoring is conducted in accordance with our Privacy Policy.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">7. Changes to This Policy</h2>
                            <p className="text-zinc-300">
                                We may update this Policy to reflect new prohibitions or clarify existing rules. Changes will be notified via email or platform notification. Continued use constitutes acceptance of the updated Policy.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-4">8. Contact Us</h2>
                            <p className="text-zinc-300">
                                Questions about this Policy? Contact us at:<br /><br />
                                Email: legal@propmetrik.com<br />
                                Address: PROPMETRIK, Accra, Ghana
                            </p>
                        </section>
                    </div>

                    <div className="mt-16 pt-8 border-t border-zinc-800">
                        <Link href="/terms">
                            <motion.div
                                whileHover={{ x: 5 }}
                                className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-primary/50 transition-colors inline-block"
                            >
                                <div className="text-sm text-zinc-500 mb-1">Related</div>
                                <div className="font-bold text-white">Terms of Service →</div>
                            </motion.div>
                        </Link>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
