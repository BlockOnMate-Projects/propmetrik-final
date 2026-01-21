'use client';

import { motion } from 'framer-motion';

export default function CareersPage() {
    return (
        <main className="pt-32 pb-24">
            <div className="container mx-auto px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-4xl mx-auto text-center mb-16"
                >
                    <h1 className="text-5xl font-bold tracking-tighter mb-6">Join the Revolution</h1>
                    <p className="text-xl text-muted-foreground mb-8">
                        We are looking for bold minds to help us digitize African real estate.
                    </p>
                    <div className="p-12 border border-dashed border-border rounded-xl bg-card/50">
                        <h3 className="text-2xl font-bold mb-4">No Open Positions</h3>
                        <p className="text-muted-foreground">
                            We don't have any specific openings right now, but we are always looking for talent.<br />
                            Send your CV to <span className="text-primary font-bold">careers@propmetrik.com</span>
                        </p>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
