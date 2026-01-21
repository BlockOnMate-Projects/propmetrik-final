import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
    return (
        <footer className="bg-card text-card-foreground pt-24 pb-12 border-t border-border">
            <div className="container mx-auto px-4 md:px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-20">

                    {/* Brand Column */}
                    <div className="lg:col-span-2">
                        <Link href="/" className="inline-block mb-8">
                            <Image
                                src="/branding/logo-full.png"
                                alt="Propmetrik Logo"
                                width={180}
                                height={50}
                                className="h-12 w-auto object-contain"
                            />
                        </Link>
                        <p className="text-muted-foreground text-lg leading-relaxed max-w-sm mb-8">
                            Ghana's definitive real estate intelligence platform. Empowering stakeholders with verified data and AI-driven insights.
                        </p>
                        <div className="flex gap-4">
                            {['Likedin', 'Twitter', 'Facebook'].map((social) => (
                                <div key={social} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer">
                                    {/* Abstract placeholder for icon to avoid lucide dependency issues if not installed, purely CSS shapes/text for now */}
                                    <span className="text-[10px] font-bold">{social[0]}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Links Columns */}
                    <div>
                        <h4 className="font-bold text-lg mb-6">Company</h4>
                        <ul className="space-y-4 text-muted-foreground">
                            <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
                            <li><Link href="/careers" className="hover:text-primary transition-colors">Careers</Link></li>
                            <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
                            <li><Link href="/press" className="hover:text-primary transition-colors">Press</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-lg mb-6">Solutions</h4>
                        <ul className="space-y-4 text-muted-foreground">
                            <li><Link href="/services/valuation" className="hover:text-primary transition-colors">Valuation Engine</Link></li>
                            <li><Link href="/services/data" className="hover:text-primary transition-colors">Data Hub</Link></li>
                            <li><Link href="/services/deal-management" className="hover:text-primary transition-colors">Deal Management</Link></li>
                            <li><Link href="/services/market-intelligence" className="hover:text-primary transition-colors">Market Intelligence</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-lg mb-6">Resources</h4>
                        <ul className="space-y-4 text-muted-foreground">
                            <li><Link href="/blog" className="hover:text-primary transition-colors">Market Reports</Link></li>
                            <li><Link href="/research" className="hover:text-primary transition-colors">Research</Link></li>
                            <li><Link href="/faq" className="hover:text-primary transition-colors">Help Center</Link></li>
                            <li><Link href="/api" className="hover:text-primary transition-colors">API Docs</Link></li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                    <p>&copy; {new Date().getFullYear()} PROPMETRIK Ghana. All Rights Reserved.</p>
                    <div className="flex gap-8">
                        <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
                        <Link href="/cookies" className="hover:text-foreground">Cookie Policy</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
