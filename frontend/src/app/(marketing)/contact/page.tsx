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
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tighter mb-4 sm:mb-6 text-white">Get in Touch</h1>
                    <p className="text-base sm:text-xl text-zinc-400">
                        Ready to modernize your real estate operations? We&apos;re here to help.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-2 gap-8 sm:gap-12 max-w-5xl mx-auto">
                    <div className="space-y-6 sm:space-y-8">
                        <div className="flex items-start gap-4">
                            <MapPin className="w-6 h-6 text-amber-500 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-lg text-white">Headquarters</h3>
                                <p className="text-zinc-400">
                                    123 Independence Avenue<br />
                                    Ridge, Accra<br />
                                    Ghana
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Phone className="w-6 h-6 text-amber-500 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-lg text-white">Phone</h3>
                                <p className="text-zinc-400">+233 (0) 30 200 0000</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Mail className="w-6 h-6 text-amber-500 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-lg text-white">Email</h3>
                                <p className="text-zinc-400">hello@propmetrik.com</p>
                            </div>
                        </div>
                    </div>

                    <form className="space-y-5 sm:space-y-6 bg-zinc-900 p-6 sm:p-8 rounded-xl border border-zinc-800">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-300">First Name</label>
                                <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-300">Last Name</label>
                                <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Email</label>
                            <input type="email" className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Message</label>
                            <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2.5 min-h-[120px] text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors" />
                        </div>
                        <button className="w-full bg-amber-600 text-white font-bold py-3 rounded-md hover:bg-amber-700 transition-colors uppercase tracking-widest text-sm">
                            Send Message
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
