
'use client'

import Link from 'next/link'
import { ArrowLeft, Save, Upload, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

export default function NewWorkOrderPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/maintenance">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">New Work Order</h1>
                        <p className="text-sm text-muted-foreground">Report a maintenance issue or request repair</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/property-management/maintenance">
                        <Button variant="outline" className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                            Cancel
                        </Button>
                    </Link>
                    <Button className="bg-orange-600 hover:bg-orange-500 text-foreground">
                        <Save className="mr-2 h-4 w-4" />
                        Create Ticket
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Step 1: Issue Details */}
                <Card className="bg-card border-border md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground">Issue Details</CardTitle>
                        <CardDescription className="text-muted-foreground">Describe the problem and location</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="property" className="text-muted-foreground">Property</Label>
                                <Select>
                                    <SelectTrigger className="bg-background border-border focus:border-orange-500 text-muted-foreground">
                                        <SelectValue placeholder="Select property" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-muted-foreground">
                                        <SelectItem value="prop-1">East Legon Villa</SelectItem>
                                        <p className="text-muted-foreground font-mono text-sm leading-relaxed">
                                            If you can&apos;t find the specific category, choose &quot;Other&quot; and provide details in the description.
                                        </p>
                                        <SelectItem value="prop-2">Cantonments Apt 304</SelectItem>
                                        <SelectItem value="prop-3">Osu Commercial Space</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-muted-foreground">Category</Label>
                                <Select>
                                    <SelectTrigger className="bg-background border-border focus:border-orange-500 text-muted-foreground">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-muted-foreground">
                                        <SelectItem value="PLUMBING">Plumbing</SelectItem>
                                        <SelectItem value="ELECTRICAL">Electrical</SelectItem>
                                        <SelectItem value="HVAC">AC / HVAC</SelectItem>
                                        <SelectItem value="CARPENTRY">Carpentry</SelectItem>
                                        <SelectItem value="MASONRY">Masonry</SelectItem>
                                        <SelectItem value="PAINTING">Painting</SelectItem>
                                        <SelectItem value="SECURITY">Security / Locks</SelectItem>
                                        <SelectItem value="GENERAL">General Maintenance</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="subject" className="text-muted-foreground">Subject / Title</Label>
                            <Input id="subject" placeholder="Biief summary of the issue (e.g. Leaking pipe)" className="bg-background border-border focus:border-orange-500" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-muted-foreground">Detailed Description</Label>
                            <Textarea id="description" placeholder="Provide full details about the issue..." className="bg-background border-border focus:border-orange-500 h-32" />
                        </div>
                        <div>
                            <Label className="text-muted-foreground mb-2 block">Photos / Attachments</Label>
                            <div className="border border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center bg-background/50 hover:bg-card/50 transition-colors cursor-pointer">
                                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                                <span className="text-sm text-muted-foreground">Click to upload photos or documents</span>
                                <span className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF up to 10MB</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Step 2: Planning & Assignment */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground">Planning</CardTitle>
                        <CardDescription className="text-muted-foreground">Timeline and urgency</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="priority" className="text-muted-foreground">Priority Level</Label>
                            <Select defaultValue="MEDIUM">
                                <SelectTrigger className="bg-background border-border focus:border-orange-500 text-muted-foreground">
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-muted-foreground">
                                    <SelectItem value="LOW">Low (Routine)</SelectItem>
                                    <SelectItem value="MEDIUM">Medium (Normal)</SelectItem>
                                    <SelectItem value="HIGH">High (Urgent)</SelectItem>
                                    <SelectItem value="CRITICAL">Critical (Emergency)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dueDate" className="text-muted-foreground">Due Date</Label>
                            <Input id="dueDate" type="date" className="bg-background border-border focus:border-orange-500" />
                        </div>
                        <div className="flex items-center space-x-2 pt-2">
                            <Checkbox id="tenantAccess" className="border-zinc-600 data-[state=checked]:bg-orange-500" />
                            <Label htmlFor="tenantAccess" className="text-muted-foreground font-normal">Tenant has granted access permission</Label>
                        </div>
                    </CardContent>
                </Card>

                {/* Step 3: Vendor Assignment (Optional) */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground">Assignment</CardTitle>
                        <CardDescription className="text-muted-foreground">Assign to a vendor (Optional)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="vendor" className="text-muted-foreground">Select Vendor</Label>
                            <Select>
                                <SelectTrigger className="bg-background border-border focus:border-orange-500 text-muted-foreground">
                                    <SelectValue placeholder="Unassigned" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-muted-foreground">
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    <SelectItem value="v-1">Kofi Plumbers Ltd</SelectItem>
                                    <SelectItem value="v-2">Bright Electricals</SelectItem>
                                    <SelectItem value="v-3">Secure Gates Gh</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="rounded-md bg-blue-100 dark:bg-blue-900/10 border border-blue-900/30 p-3">
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                                Leave unassigned if you haven&apos;t received quotes yet. You can assign a vendor later.
                            </p>
                        </div>
                        <Button variant="outline" className="w-full border-border text-muted-foreground hover:bg-muted">
                            <Plus className="mr-2 h-4 w-4" /> Add New Vendor
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
