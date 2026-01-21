'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

interface ProcessStep {
    title: string;
    description: string;
}

interface ProcessTimelineProps {
    steps?: ProcessStep[];
}

const defaultSteps: ProcessStep[] = [
    {
        title: 'Submit Request',
        description: 'Share property details and requirements through our platform',
    },
    {
        title: 'AI Analysis',
        description: 'Our algorithms process market data and comparable properties',
    },
    {
        title: 'Expert Review',
        description: 'Licensed valuers verify and validate the automated assessment',
    },
    {
        title: 'Receive Report',
        description: 'Get comprehensive valuation report with confidence intervals',
    },
];

export default function ProcessTimeline({ steps = defaultSteps }: ProcessTimelineProps) {
    return (
        <div className="relative py-12">
            {/* Timeline Line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-zinc-800 md:left-1/2" />

            {/* Steps */}
            <div className="space-y-12">
                {steps.map((step, index) => {
                    const isEven = index % 2 === 0;

                    return (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, x: isEven ? -50 : 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: index * 0.2 }}
                            className={`relative flex items-center ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                        >
                            <div className={`w-full md:w-1/2 ${isEven ? 'md:pr-12' : 'md:pl-12'}`}>
                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors"
                                >
                                    {/* Step Number Badge */}
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-yellow-400 flex items-center justify-center text-zinc-950 font-bold text-xl shrink-0">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-primary uppercase tracking-wider">
                                                    Step {index + 1}
                                                </span>
                                            </div>
                                            <h3 className="text-xl font-bold text-white mb-2">
                                                {step.title}
                                            </h3>
                                            <p className="text-zinc-400">
                                                {step.description}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Center Circle */}
                            <div className="absolute left-8 md:left-1/2 transform md:-translate-x-1/2 z-10">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    whileInView={{ scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.2 + 0.3 }}
                                    className="w-16 h-16 rounded-full bg-zinc-950 border-4 border-primary flex items-center justify-center"
                                >
                                    <CheckCircle2 className="w-8 h-8 text-primary" />
                                </motion.div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
