'use client'

import React from 'react'
import PaymentSettings from '@/components/property-management/PaymentSettings'
import { projectsPaymentConfigApi } from '@/lib/projects-api'

export default function PaymentSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-mono font-bold text-foreground tracking-tight">
                    PAYMENT SETTINGS
                </h1>
                <p className="text-muted-foreground font-mono text-xs mt-1">
                    Configure payment methods, currencies &amp; processing options
                </p>
            </div>

            <PaymentSettings
                paymentApi={projectsPaymentConfigApi}
                serviceLabel="Project Management"
            />
        </div>
    )
}
