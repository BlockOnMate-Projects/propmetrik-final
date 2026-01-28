
'use client'

import React, { use } from 'react'
import Link from 'next/link'
import {
    ArrowLeft,
    MapPin,
    Wrench,
    AlertTriangle,
    Clock,
    User,
    CheckCircle2,
    MoreVertical,
    Phone,
    MessageSquare,
    Calendar,
    FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

// Mock Data
const ticket = {
    id: 'WO-2024-042',
    subject: 'Leaking pipe in master bathroom',
    description: 'There is a persistent leak under the sink in the master bathroom. Water is pooling on the floor and causing damage to the cabinet.',
    category: 'PLUMBING',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    dateReported: '2024-01-15',
    dueDate: '2024-01-18',
    property: {
        name: 'East Legon Villa',
        unit: 'Unit A',
        address: '45 Nii Sai Street, East Legon'
    },
    tenant: {
        name: 'Kwame Mensah',
        phone: '+233 24 456 7890'
    },
    vendor: {
        name: 'Kofi Plumbers Ltd',
        phone: '+233 27 123 4567',
        email: 'kofiplumbers@example.com',
        rating: 4.8
    },
    timeline: [
        { date: '2024-01-15 09:30', event: 'Ticket created by Tenant', users: 'Kwame Mensah' },
        { date: '2024-01-15 10:15', event: 'Status changed to Assigned', users: 'Property Manager' },
        { date: '2024-01-15 14:00', event: 'Vendor accepted work order', users: 'Kofi Plumbers Ltd' },
        { date: '2024-01-16 08:00', event: 'Technician on site', users: 'Kofi Plumbers Ltd' }
    ]
}

export default function WorkOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/maintenance">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-white">{ticket.id}</h1>
                            <Badge
                                className="bg-amber-900/40 text-amber-500 border-amber-900"
                            >
                                In Progress
                            </Badge>
                        </div>
                        <p className="text-sm text-zinc-400">Maintenance Request Details</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800">
                        Edit Details
                    </Button>
                    <Button className="bg-green-600 hover:bg-green-500 text-white">
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark Complete
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Left Column: Ticket Info & Timeline */}
                <div className="md:col-span-2 space-y-6">
                    {/* Summary Card */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl font-bold text-white mb-1">{ticket.subject}</CardTitle>
                                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                                        <MapPin className="h-3 w-3" /> {ticket.property.name} • {ticket.property.unit}
                                    </div>
                                </div>
                                <Badge variant="outline" className="border-orange-900 text-orange-500 bg-orange-900/10">High Priority</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="text-sm font-medium text-zinc-300 mb-2">Description</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed bg-zinc-950/50 p-4 rounded-md border border-zinc-800">
                                    {ticket.description}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-zinc-500 uppercase">Category</label>
                                    <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
                                        <Wrench className="h-4 w-4 text-zinc-500" /> {ticket.category}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-zinc-500 uppercase">Reported On</label>
                                    <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
                                        <Calendar className="h-4 w-4 text-zinc-500" /> {ticket.dateReported}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-zinc-500 uppercase">Vendor</label>
                                    <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
                                        <User className="h-4 w-4 text-zinc-500" /> {ticket.vendor.name}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-zinc-500 uppercase">Due Date</label>
                                    <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
                                        <Clock className="h-4 w-4 text-zinc-500" /> {ticket.dueDate}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Activity Timeline */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-base text-white">Activity Log</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6 relative pl-4 border-l border-zinc-800 ml-2">
                                {ticket.timeline.map((item, index) => (
                                    <div key={index} className="relative">
                                        <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-zinc-700 border-2 border-zinc-900" />
                                        <div className="flex flex-col gap-1">
                                            <div className="text-sm text-zinc-300 font-medium">{item.event}</div>
                                            <div className="text-xs text-zinc-500 flex items-center gap-2">
                                                <span>{item.date}</span>
                                                <span>•</span>
                                                <span>{item.users}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <Separator className="my-6 bg-zinc-800" />

                            <div className="flex gap-4">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-orange-600 text-white">AD</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2">
                                    <Textarea placeholder="Add a comment or update..." className="bg-zinc-950 border-zinc-800 min-h-[80px]" />
                                    <Button size="sm" className="bg-zinc-800 hover:bg-zinc-700 text-white">Post Comment</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Contact & Actions */}
                <div className="space-y-6">
                    {/* Tenant Card */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-white">Tenant Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3 mb-4">
                                <Avatar className="h-10 w-10 border border-zinc-700">
                                    <AvatarFallback className="bg-zinc-800 text-zinc-400">KM</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="text-zinc-200 font-medium">{ticket.tenant.name}</div>
                                    <div className="text-xs text-zinc-500">Occupant</div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-zinc-300">
                                    <Phone className="mr-2 h-4 w-4 text-zinc-500" />
                                    {ticket.tenant.phone}
                                </Button>
                                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-zinc-300">
                                    <MessageSquare className="mr-2 h-4 w-4 text-zinc-500" />
                                    Send Message
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Vendor Card */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-base text-white">Assigned Vendor</CardTitle>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-400 hover:text-white">
                                    <MoreVertical className="h-3 w-3" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-10 w-10 rounded bg-blue-900/20 flex items-center justify-center text-blue-500 font-bold border border-blue-900/30">KP</div>
                                <div>
                                    <div className="text-zinc-200 font-medium">{ticket.vendor.name}</div>
                                    <div className="flex items-center text-xs text-amber-500">
                                        ★ {ticket.vendor.rating} Rating
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-zinc-300">
                                    <Phone className="mr-2 h-4 w-4 text-zinc-500" />
                                    {ticket.vendor.phone}
                                </Button>
                                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-zinc-300">
                                    <FileText className="mr-2 h-4 w-4 text-zinc-500" />
                                    View Invoice
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Actions Card */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-white">Ticket Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button variant="secondary" className="w-full bg-zinc-800 hover:bg-zinc-700 text-white">Reassign Vendor</Button>
                            <Button variant="secondary" className="w-full bg-zinc-800 hover:bg-zinc-700 text-white">Change Priority</Button>
                            <Separator className="my-2 bg-zinc-800" />
                            <Button variant="ghost" className="w-full text-red-500 hover:text-red-400 hover:bg-red-900/10">Cancel Ticket</Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
