'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function CookiePolicyPage() {
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

                    <h1 className="text-4xl md:text-6xl font-bold mb-4">Cookie Policy</h1>
                    <p className="text-muted-foreground mb-12">Last updated: {lastUpdated}</p>

                    <div className="prose prose-invert prose-lg max-w-none">
                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">1. What Are Cookies?</h2>
                            <p className="text-muted-foreground leading-relaxed">
                                Cookies are small text files stored on your device when you visit websites. They help websites remember your preferences and provide a better user experience. PROPMETRIK uses cookies and similar technologies (web beacons, pixels, local storage) to enhance your experience on our platform.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">2. Types of Cookies We Use</h2>

                            <div className="space-y-6 mt-6">
                                <div className="bg-card border border-border rounded-lg p-6">
                                    <h3 className="text-xl font-bold text-foreground mb-3">Essential Cookies (Required)</h3>
                                    <p className="text-muted-foreground mb-4">
                                        These cookies are necessary for the platform to function properly. They cannot be disabled.
                                    </p>
                                    <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                        <li>Authentication and session management</li>
                                        <li>Security and fraud prevention</li>
                                        <li>Load balancing</li>
                                        <li>CSRF protection</li>
                                    </ul>
                                    <div className="mt-4 text-sm text-muted-foreground">
                                        Duration: Session or up to 30 days
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-lg p-6">
                                    <h3 className="text-xl font-bold text-foreground mb-3">Functional Cookies (Optional)</h3>
                                    <p className="text-muted-foreground mb-4">
                                        These cookies enhance functionality and personalization.
                                    </p>
                                    <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                        <li>Language and currency preferences</li>
                                        <li>Dashboard layout customization</li>
                                        <li>Saved search filters</li>
                                        <li>Theme preferences (dark/light mode)</li>
                                    </ul>
                                    <div className="mt-4 text-sm text-muted-foreground">
                                        Duration: Up to 1 year
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-lg p-6">
                                    <h3 className="text-xl font-bold text-foreground mb-3">Analytics Cookies (Optional)</h3>
                                    <p className="text-muted-foreground mb-4">
                                        These cookies help us understand how users interact with our platform.
                                    </p>
                                    <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                        <li>Google Analytics (anonymized IP)</li>
                                        <li>Page visit tracking</li>
                                        <li>Feature usage statistics</li>
                                        <li>Performance monitoring</li>
                                    </ul>
                                    <div className="mt-4 text-sm text-muted-foreground">
                                        Duration: Up to 2 years
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-lg p-6">
                                    <h3 className="text-xl font-bold text-foreground mb-3">Marketing Cookies (Optional)</h3>
                                    <p className="text-muted-foreground mb-4">
                                        These cookies enable personalized advertising and marketing.
                                    </p>
                                    <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                        <li>Facebook Pixel</li>
                                        <li>Google Ads conversion tracking</li>
                                        <li>Retargeting campaigns</li>
                                        <li>LinkedIn Insight Tag</li>
                                    </ul>
                                    <div className="mt-4 text-sm text-muted-foreground">
                                        Duration: Up to 1 year
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">3. How to Control Cookies</h2>

                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-2">Browser Settings</h3>
                                    <p className="text-muted-foreground">
                                        Most browsers allow you to control cookies through settings. You can:
                                    </p>
                                    <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-2">
                                        <li>Block all cookies</li>
                                        <li>Block third-party cookies only</li>
                                        <li>Delete cookies after each session</li>
                                        <li>Set exceptions for specific websites</li>
                                    </ul>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-2">PROPMETRIK Cookie Preferences</h3>
                                    <p className="text-muted-foreground mb-4">
                                        You can manage your cookie preferences directly in our platform:
                                    </p>
                                    <Link href="/settings/cookies">
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="bg-primary text-zinc-950 px-6 py-3 font-bold rounded hover:bg-primary/90 transition-colors"
                                        >
                                            Manage Cookie Preferences
                                        </motion.button>
                                    </Link>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-2">Browser Instructions</h3>
                                    <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" className="text-primary hover:underline">Chrome</a></li>
                                        <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" className="text-primary hover:underline">Safari</a></li>
                                        <li><a href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" target="_blank" className="text-primary hover:underline">Firefox</a></li>
                                        <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" className="text-primary hover:underline">Edge</a></li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">4. Third-Party Cookies</h2>
                            <p className="text-muted-foreground mb-4">
                                Some cookies are set by third-party services we use:
                            </p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                <li><strong>Google Analytics:</strong> Website usage analytics</li>
                                <li><strong>Google Ads:</strong> Advertising and conversion tracking</li>
                                <li><strong>Facebook:</strong> Social media integration and advertising</li>
                                <li><strong>LinkedIn:</strong> Professional networking and B2B marketing</li>
                            </ul>
                            <p className="text-muted-foreground mt-4">
                                These third parties have their own privacy policies. We recommend reviewing them.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">5. Impact of Disabling Cookies</h2>
                            <p className="text-muted-foreground mb-4">
                                Disabling certain cookies may affect your experience:
                            </p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-2">
                                <li>You may need to log in on each visit</li>
                                <li>Your preferences may not be saved</li>
                                <li>Some features may not work properly</li>
                                <li>Personalized content may not be available</li>
                            </ul>
                            <p className="text-muted-foreground mt-4">
                                Essential cookies are required for the platform to function and cannot be disabled.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">6. Updates to This Policy</h2>
                            <p className="text-muted-foreground">
                                We may update this Cookie Policy to reflect changes in our practices or technologies. We will notify you of material changes via email or platform notification.
                            </p>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-bold text-foreground mb-4">7. Contact Us</h2>
                            <p className="text-muted-foreground mb-4">
                                For questions about our cookie practices:
                            </p>
                            <p className="text-muted-foreground">
                                Email: privacy@propmetrik.com<br />
                                Address: PROPMETRIK, Accra, Ghana
                            </p>
                        </section>
                    </div>

                    <div className="mt-16 pt-8 border-t border-border">
                        <div className="grid md:grid-cols-2 gap-4">
                            <Link href="/privacy">
                                <motion.div
                                    whileHover={{ x: 5 }}
                                    className="p-4 bg-card border border zinc-800 rounded-lg hover:border-primary/50 transition-colors"
                                >
                                    <div className="text-sm text-muted-foreground mb-1">Related</div>
                                    <div className="font-bold text-foreground">Privacy Policy →</div>
                                </motion.div>
                            </Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
