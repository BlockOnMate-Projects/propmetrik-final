
'use client'

import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

export default function NewLeasePage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/leases">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">New Lease Agreement</h1>
                        <p className="text-sm text-zinc-400">Create a new tenancy for a property</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/property-management/leases">
                        <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800">
                            Cancel
                        </Button>
                    </Link>
                    <Button className="bg-orange-600 hover:bg-orange-500 text-white">
                        <Save className="mr-2 h-4 w-4" />
                        Create Lease
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Step 1: Property & Tenant Selection */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Property & Tenant</CardTitle>
                        <CardDescription className="text-zinc-500">Select the property and tenant for this lease</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="property" className="text-zinc-300">Property</Label>
                                <Select>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                        <SelectValue placeholder="Select property" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                        <SelectItem value="prop-1">East Legon Villa</SelectItem>
                                        <SelectItem value="prop-2">Cantonments Apt 304</SelectItem>
                                        <SelectItem value="prop-3">Osu Commercial Space</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="unit" className="text-zinc-300">Unit (Optional)</Label>
                                <Input id="unit" placeholder="e.g. Unit A, Flat 4, Shop 1" className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tenant" className="text-zinc-300">Tenant</Label>
                                <Select>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                        <SelectValue placeholder="Select tenant" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                        <SelectItem value="tnt-1">Kwame Mensah</SelectItem>
                                        <SelectItem value="tnt-2">Ama Osei</SelectItem>
                                        <SelectItem value="tnt-3">Pending Tenant (John Doe)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Step 2: Lease Terms */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Lease Duration</CardTitle>
                        <CardDescription className="text-zinc-500">Define the start and end dates</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="startDate" className="text-zinc-300">Start Date</Label>
                                <Input id="startDate" type="date" className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endDate" className="text-zinc-300">End Date</Label>
                                <Input id="endDate" type="date" className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 pt-2">
                            <Checkbox id="autoRenew" className="border-zinc-600 data-[state=checked]:bg-orange-500" />
                            <Label htmlFor="autoRenew" className="text-zinc-300 font-normal">Auto-renew lease at end of term</Label>
                        </div>
                        <div className="space-y-2 pt-2">
                            <Label htmlFor="noticePeriod" className="text-zinc-300">Notice Period (Days)</Label>
                            <Input id="noticePeriod" type="number" defaultValue={90} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                        </div>
                    </CardContent>
                </Card>

                {/* Step 3: Financial Details */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Financials</CardTitle>
                        <CardDescription className="text-zinc-500">Rent, deposits, and payment terms</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="rentAmount" className="text-zinc-300">Monthly Rent</Label>
                                <Input id="rentAmount" type="number" placeholder="0.00" className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="currency" className="text-zinc-300">Currency</Label>
                                <Select defaultValue="GHS">
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                        <SelectItem value="GHS">GHS (Cedi)</SelectItem>
                                        <SelectItem value="USD">USD ($)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="securityDeposit" className="text-zinc-300">Security Deposit</Label>
                                <Input id="securityDeposit" type="number" placeholder="0.00" className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="advanceMonths" className="text-zinc-300">Advance Months</Label>
                                <Input id="advanceMonths" type="number" defaultValue={1} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rentDue" className="text-zinc-300">Rent Due Day</Label>
                            <Select defaultValue="1">
                                <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                    <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300 h-64 overflow-y-auto">
                                    {Array.from({ length: 28 }, (_, i) => (
                                        <SelectItem key={i + 1} value={(i + 1).toString()}>{i + 1}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Step 4: Additional Terms */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Terms & Conditions</CardTitle>
                        <CardDescription className="text-zinc-500">Special clauses and included utilities</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <Label className="text-zinc-300 mb-3 block">Included Utilities</Label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="water" className="border-zinc-600 data-[state=checked]:bg-green-500" />
                                    <Label htmlFor="water" className="text-zinc-400 font-normal">Water</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="electricity" className="border-zinc-600 data-[state=checked]:bg-green-500" />
                                    <Label htmlFor="electricity" className="text-zinc-400 font-normal">Electricity</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="internet" className="border-zinc-600 data-[state=checked]:bg-green-500" />
                                    <Label htmlFor="internet" className="text-zinc-400 font-normal">Internet</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="cleaning" className="border-zinc-600 data-[state=checked]:bg-green-500" />
                                    <Label htmlFor="cleaning" className="text-zinc-400 font-normal">Cleaning</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="generator" className="border-zinc-600 data-[state=checked]:bg-green-500" />
                                    <Label htmlFor="generator" className="text-zinc-400 font-normal">Generator</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="security" className="border-zinc-600 data-[state=checked]:bg-green-500" />
                                    <Label htmlFor="security" className="text-zinc-400 font-normal">Security</Label>
                                </div>
                            </div>
                        </div>

                        <Separator className="bg-zinc-800" />

                        <div className="space-y-2">
                            <Label htmlFor="specialConditions" className="text-zinc-300">Special Conditions</Label>
                            <Textarea id="specialConditions" placeholder="Enter any additional clauses or conditions..." className="bg-zinc-950 border-zinc-800 focus:border-orange-500 h-24" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
