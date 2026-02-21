import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
    return (
        <footer className="bg-zinc-950 text-white pt-24 pb-12 border-t border-zinc-800">
            <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-x-10 gap-y-12 mb-20">

                    {/* Brand Column */}
                    <div className="lg:col-span-2 min-w-0">
                        <Link href="/" className="inline-block mb-8">
                            <Image
                                src="/branding/logo-dark-bg.svg"
                                alt="PROPMETRIK Logo"
                                width={180}
                                height={50}
                                className="h-12 w-auto object-contain"
                            />
                        </Link>
                        <p className="text-zinc-400 text-lg leading-relaxed max-w-sm mb-8">
                            Ghana&apos;s definitive real estate intelligence platform. Empowering stakeholders with verified data and AI-driven insights.
                        </p>
                        <div className="flex gap-4">
                            {['LinkedIn', 'Twitter', 'Facebook'].map((social) => (
                                <div key={social} className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:bg-amber-600 hover:text-white transition-colors cursor-pointer">
                                    <span className="text-[10px] font-bold">{social[0]}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Company */}
                    <div className="min-w-0">
                        <h4 className="font-bold text-lg mb-6 whitespace-nowrap">Company</h4>
                        <ul className="space-y-4 text-zinc-400">
                            <li><Link href="/about" className="hover:text-amber-500 transition-colors whitespace-nowrap">About Us</Link></li>
                            <li><Link href="/careers" className="hover:text-amber-500 transition-colors whitespace-nowrap">Careers</Link></li>
                            <li><Link href="/contact" className="hover:text-amber-500 transition-colors whitespace-nowrap">Contact</Link></li>
                            <li><Link href="/pricing" className="hover:text-amber-500 transition-colors whitespace-nowrap">Pricing</Link></li>
                            <li><Link href="/api" className="hover:text-amber-500 transition-colors whitespace-nowrap">API Docs</Link></li>
                        </ul>
                    </div>

                    {/* Insights */}
                    <div className="min-w-0">
                        <h4 className="font-bold text-lg mb-6 whitespace-nowrap">Insights</h4>
                        <ul className="space-y-4 text-zinc-400">
                            <li><Link href="/insights/outlook" className="hover:text-amber-500 transition-colors whitespace-nowrap">Real Estate Outlook</Link></li>
                            <li><Link href="/insights/snapshot" className="hover:text-amber-500 transition-colors whitespace-nowrap">Property Snapshot</Link></li>
                            <li><Link href="/insights/indices" className="hover:text-amber-500 transition-colors whitespace-nowrap">Indices &amp; Data</Link></li>
                            <li><Link href="/insights/policy-papers" className="hover:text-amber-500 transition-colors whitespace-nowrap">Policy Papers</Link></li>
                        </ul>
                    </div>

                    {/* Press */}
                    <div className="min-w-0">
                        <h4 className="font-bold text-lg mb-6 whitespace-nowrap">Press</h4>
                        <ul className="space-y-4 text-zinc-400">
                            <li><Link href="/press/releases" className="hover:text-amber-500 transition-colors whitespace-nowrap">Press Releases</Link></li>
                            <li><Link href="/press/commentary" className="hover:text-amber-500 transition-colors whitespace-nowrap">Expert Commentary</Link></li>
                            <li><Link href="/press/media-kit" className="hover:text-amber-500 transition-colors whitespace-nowrap">Media Kit</Link></li>
                        </ul>
                    </div>

                    {/* Services */}
                    <div className="min-w-0">
                        <h4 className="font-bold text-lg mb-6 whitespace-nowrap">Services</h4>
                        <ul className="space-y-4 text-zinc-400">
                            <li><Link href="/services/valuation" className="hover:text-amber-500 transition-colors whitespace-nowrap">Valuation Engine</Link></li>
                            <li><Link href="/services/data" className="hover:text-amber-500 transition-colors whitespace-nowrap">Data Hub</Link></li>
                            <li><Link href="/services/deal-management" className="hover:text-amber-500 transition-colors whitespace-nowrap">Deal Management</Link></li>
                            <li><Link href="/services/market-intelligence" className="hover:text-amber-500 transition-colors whitespace-nowrap">Market Intelligence</Link></li>
                            <li><Link href="/services/project-management" className="hover:text-amber-500 transition-colors whitespace-nowrap">Project Management</Link></li>
                            <li><Link href="/services/property-management" className="hover:text-amber-500 transition-colors whitespace-nowrap">Property Management</Link></li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-zinc-500">
                    <p>&copy; {new Date().getFullYear()} PROPMETRIK Ghana. All Rights Reserved.</p>
                    <div className="flex gap-8">
                        <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
                        <Link href="/cookies" className="hover:text-white transition-colors">Cookie Policy</Link>
                        <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
