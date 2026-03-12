'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Send } from 'lucide-react';

interface ApplicationFormProps {
    property: any;
    token?: string;
}

export default function ApplicationForm({ property, token }: ApplicationFormProps) {
    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        message: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');
    const [inquiryId, setInquiryId] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!form.first_name || !form.last_name || !form.phone) {
            setError('Please fill in your name and phone number.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch('/api/marketplace/inquiries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: form.first_name,
                    last_name: form.last_name,
                    email: form.email || undefined,
                    phone: form.phone,
                    message: form.message || undefined,
                    property_id: property?.id,
                    inquiry_type: property?.transaction_type === 'rental' ? 'rent' : 'buy',
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to submit inquiry');
            }

            setSubmitted(true);
            setInquiryId(data.inquiry_id || '');
        } catch (err: any) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                    Inquiry Submitted!
                </h3>
                <p className="text-sm text-green-700 dark:text-green-300">
                    An agent will contact you shortly about this property.
                </p>
                {inquiryId && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                        Reference: {inquiryId}
                    </p>
                )}
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Interested in this property?
            </h3>
            <p className="text-sm text-muted-foreground">
                Fill in your details and an agent will reach out to you.
            </p>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label htmlFor="first_name" className="text-xs font-medium">First Name *</Label>
                    <Input
                        id="first_name"
                        placeholder="First name"
                        value={form.first_name}
                        onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                        required
                    />
                </div>
                <div>
                    <Label htmlFor="last_name" className="text-xs font-medium">Last Name *</Label>
                    <Input
                        id="last_name"
                        placeholder="Last name"
                        value={form.last_name}
                        onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                        required
                    />
                </div>
            </div>

            <div>
                <Label htmlFor="phone" className="text-xs font-medium">Phone Number *</Label>
                <Input
                    id="phone"
                    type="tel"
                    placeholder="+233 XX XXX XXXX"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    required
                />
            </div>

            <div>
                <Label htmlFor="email" className="text-xs font-medium">Email (optional)</Label>
                <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
            </div>

            <div>
                <Label htmlFor="message" className="text-xs font-medium">Message (optional)</Label>
                <Textarea
                    id="message"
                    placeholder="I'm interested in scheduling a viewing..."
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    rows={3}
                />
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button
                type="submit"
                disabled={submitting}
                className="w-full"
                size="lg"
            >
                {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                    <Send className="w-4 h-4 mr-2" />
                )}
                {submitting ? 'Submitting...' : 'Express Interest'}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
                By submitting, you agree to be contacted about this property.
            </p>
        </form>
    );
}
