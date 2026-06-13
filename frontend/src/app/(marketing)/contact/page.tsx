'use client';

import { motion } from 'framer-motion';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function ContactPage() {
    return (
        <main className="pt-24 sm:pt-32 pb-16 sm:pb-24">
            <div className="container mx-auto px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-4xl mx-auto text-center mb-10 sm:mb-16"
                >
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tighter mb-4 sm:mb-6 text-foreground">Get in Touch</h1>
                    <p className="text-base sm:text-xl text-muted-foreground">
                        Ready to modernize your real estate operations? We&apos;re here to help.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-2 gap-8 sm:gap-12 max-w-5xl mx-auto">
                    <div className="space-y-6 sm:space-y-8">
                        <div className="flex items-start gap-4">
                            <MapPin className="w-6 h-6 text-amber-500 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-lg text-foreground">Headquarters</h3>
                                <p className="text-muted-foreground">
                                    123 Independence Avenue<br />
                                    Ridge, Accra<br />
                                    Ghana
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Phone className="w-6 h-6 text-amber-500 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-lg text-foreground">Phone</h3>
                                <p className="text-muted-foreground">+233 (0) 30 200 0000</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Mail className="w-6 h-6 text-amber-500 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-lg text-foreground">Email</h3>
                                <p className="text-muted-foreground">hello@propmetrik.com</p>
                            </div>
                        </div>
                    </div>

                    <form className="space-y-5 sm:space-y-6 bg-card p-6 sm:p-8 rounded-xl border border-border">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">First Name</label>
                                <input type="text" className="w-full bg-muted border border-border rounded-md px-3 py-2.5 text-foreground placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Last Name</label>
                                <input type="text" className="w-full bg-muted border border-border rounded-md px-3 py-2.5 text-foreground placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Email</label>
                            <input type="email" className="w-full bg-muted border border-border rounded-md px-3 py-2.5 text-foreground placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Message</label>
                            <textarea className="w-full bg-muted border border-border rounded-md px-3 py-2.5 min-h-[120px] text-foreground placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                        </div>
                        <button className="w-full bg-amber-600 text-foreground font-bold py-3 rounded-md hover:bg-amber-700 transition-colors uppercase tracking-widest text-sm">
                            Send Message
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
