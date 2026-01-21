'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

interface Testimonial {
    name: string;
    role: string;
    company: string;
    content: string;
    rating: number;
}

const testimonials: Testimonial[] = [
    {
        name: 'Kwame Mensah',
        role: 'CEO',
        company: 'Accra Properties Ltd',
        content: 'PropMetrik has transformed how we value properties in Ghana. The AI-powered AVMs are incredibly accurate and save us days of work.',
        rating: 5
    },
    {
        name: 'Ama Sarpong',
        role: 'Head of Real Estate',
        company: 'Ghana Commercial Bank',
        content: 'The market intelligence and data quality are unmatched. We\'ve reduced our property assessment time by 70% since implementing PropMetrik.',
        rating: 5
    },
    {
        name: 'Yaw Boateng',
        role: 'Managing Director',
        company: 'Kumasi Development Corp',
        content: 'Finally, reliable property data for Ghana. The deal management tools have streamlined our entire workflow from lead to closing.',
        rating: 5
    },
    {
        name: 'Abena Owusu',
        role: 'Investment Manager',
        company: 'West Africa REIT',
        content: 'PropMetrik\'s portfolio analytics give us confidence in our investment decisions. The platform is world-class.',
        rating: 5
    },
];

export default function TestimonialCarousel() {
    const [current, setCurrent] = useState(0);
    const [direction, setDirection] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            next();
        }, 5000);
        return () => clearInterval(timer);
    }, [current]);

    const next = () => {
        setDirection(1);
        setCurrent((prev) => (prev + 1) % testimonials.length);
    };

    const previous = () => {
        setDirection(-1);
        setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    };

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 1000 : -1000,
            opacity: 0
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 1000 : -1000,
            opacity: 0
        })
    };

    return (
        <div className="relative max-w-4xl mx-auto px-8 py-12">
            {/* Testimonial Content */}
            <div className="relative h-80 overflow-hidden">
                <AnimatePresence initial={false} custom={direction}>
                    <motion.div
                        key={current}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{
                            x: { type: "spring", stiffness: 300, damping: 30 },
                            opacity: { duration: 0.2 }
                        }}
                        className="absolute w-full"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
                            {/* Rating Stars */}
                            <div className="flex gap-1 mb-4">
                                {Array.from({ length: testimonials[current].rating }, (_, i) => (
                                    <Star key={i} className="w-5 h-5 fill-primary text-primary" />
                                ))}
                            </div>

                            {/* Content */}
                            <blockquote className="text-lg md:text-xl text-zinc-300 leading-relaxed mb-6">
                                "{testimonials[current].content}"
                            </blockquote>

                            {/* Author */}
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-yellow-400 flex items-center justify-center text-white font-bold">
                                    {testimonials[current].name.charAt(0)}
                                </div>
                                <div>
                                    <div className="font-bold text-white">{testimonials[current].name}</div>
                                    <div className="text-sm text-zinc-400">
                                        {testimonials[current].role}, {testimonials[current].company}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8">
                <button
                    onClick={previous}
                    className="p-3 rounded-full bg-zinc-900 border border-zinc-800 hover:border-primary transition-colors"
                    aria-label="Previous testimonial"
                >
                    <ChevronLeft className="w-5 h-5 text-white" />
                </button>

                {/* Dots */}
                <div className="flex gap-2">
                    {testimonials.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => {
                                setDirection(index > current ? 1 : -1);
                                setCurrent(index);
                            }}
                            className={`w-2 h-2 rounded-full transition-all ${index === current
                                    ? 'bg-primary w-8'
                                    : 'bg-zinc-700 hover:bg-zinc-600'
                                }`}
                            aria-label={`Go to testimonial ${index + 1}`}
                        />
                    ))}
                </div>

                <button
                    onClick={next}
                    className="p-3 rounded-full bg-zinc-900 border border-zinc-800 hover:border-primary transition-colors"
                    aria-label="Next testimonial"
                >
                    <ChevronRight className="w-5 h-5 text-white" />
                </button>
            </div>
        </div>
    );
}
