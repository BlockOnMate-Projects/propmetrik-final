'use client';

import { motion } from 'framer-motion';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function ContactPage() {
    return (
        <main className="pt-32 pb-24">
            <div className="container mx-auto px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-4xl mx-auto text-center mb-16"
                >
                    <h1 className="text-5xl font-bold tracking-tighter mb-6">Get in Touch</h1>
                    <p className="text-xl text-muted-foreground">
                        Ready to modernize your real estate operations? We're here to help.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
                    <div className="space-y-8">
                        <div className="flex items-start gap-4">
                            <MapPin className="w-6 h-6 text-primary mt-1" />
                            <div>
                                <h3 className="font-bold text-lg">Headquarters</h3>
                                <p className="text-muted-foreground">
                                    123 Independence Avenue<br />
                                    Ridge, Accra<br />
                                    Ghana
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Phone className="w-6 h-6 text-primary mt-1" />
                            <div>
                                <h3 className="font-bold text-lg">Phone</h3>
                                <p className="text-muted-foreground">+233 (0) 30 200 0000</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Mail className="w-6 h-6 text-primary mt-1" />
                            <div>
                                <h3 className="font-bold text-lg">Email</h3>
                                <p className="text-muted-foreground">hello@propmetrik.com</p>
                            </div>
                        </div>
                    </div>

                    <form className="space-y-6 bg-card p-8 rounded-xl border border-border">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">First Name</label>
                                <input type="text" className="w-full bg-background border border-input rounded-md px-3 py-2" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Last Name</label>
                                <input type="text" className="w-full bg-background border border-input rounded-md px-3 py-2" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <input type="email" className="w-full bg-background border border-input rounded-md px-3 py-2" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Message</label>
                            <textarea className="w-full bg-background border border-input rounded-md px-3 py-2 min-h-[120px]" />
                        </div>
                        <button className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-md hover:bg-primary/90 transition-colors uppercase tracking-widest text-sm">
                            Send Message
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
