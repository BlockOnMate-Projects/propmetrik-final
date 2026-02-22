'use client'

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Plus, Upload, Play } from 'lucide-react'

interface EmptyStateAction {
    label: string
    href?: string
    onClick?: () => void
    icon?: React.ElementType
    variant?: 'default' | 'outline' | 'ghost'
}

interface EmptyStateProps {
    icon: React.ElementType
    title: string
    description: string
    actions?: EmptyStateAction[]
    className?: string
}

export function EmptyState({ icon: Icon, title, description, actions, className }: EmptyStateProps) {
    return (
        <div className={cn(
            'flex flex-col items-center justify-center py-16 px-8 border border-dashed border-border rounded-lg bg-muted/30',
            className
        )}>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Icon className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">{description}</p>
            {actions && actions.length > 0 && (
                <div className="flex items-center gap-3">
                    {actions.map((action, idx) => {
                        const ActionIcon = action.icon
                        const btn = (
                            <Button
                                key={idx}
                                variant={action.variant || (idx === 0 ? 'default' : 'outline')}
                                onClick={action.onClick}
                                className={idx === 0 ? 'shadow-sm' : ''}
                            >
                                {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
                                {action.label}
                            </Button>
                        )
                        if (action.href) {
                            return <Link key={idx} href={action.href}>{btn}</Link>
                        }
                        return btn
                    })}
                </div>
            )}
        </div>
    )
}
