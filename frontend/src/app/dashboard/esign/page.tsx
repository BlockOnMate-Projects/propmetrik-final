'use client'

import { useState, useRef, useEffect } from 'react'
import { TerminalPanel, DataMetricCard } from '@/components/ui/terminal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    FileSignature,
    Upload,
    Check,
    Clock,
    Shield,
    Eye,
    PenTool,
    Type,
    MousePointer,
    Send,
    FileText,
    Users,
    CheckCircle,
    XCircle,
    Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type SignatureMethod = 'click_to_sign' | 'typed_name' | 'drawn_signature'

interface SigningRequest {
    id: string
    documentTitle: string
    documentType: string
    status: string
    createdAt: string
    signees?: SigningRequestSignee[]
}

interface SigningRequestSignee {
    id: string
    signeeType: string
    status: string
    externalName?: string
    externalEmail?: string
    signeeRole?: string
}

export default function ESignTestPage() {
    // State for testing
    const [activeTab, setActiveTab] = useState<'create' | 'sign' | 'requests' | 'audit'>('create')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    // Create request state
    const [documentTitle, setDocumentTitle] = useState('')
    const [documentType, setDocumentType] = useState('test_document')
    const [signeeType, setSigneeType] = useState<'internal' | 'external'>('internal')
    const [externalName, setExternalName] = useState('')
    const [externalEmail, setExternalEmail] = useState('')
    const [externalPhone, setExternalPhone] = useState('')

    // Sign state
    const [signingRequestId, setSigningRequestId] = useState('')
    const [signeeId, setSigneeId] = useState('')
    const [signatureMethod, setSignatureMethod] = useState<SignatureMethod>('click_to_sign')
    const [typedName, setTypedName] = useState('')
    const [consentChecked, setConsentChecked] = useState(false)
    const [stepUpCode, setStepUpCode] = useState('')

    // Drawn signature state
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [drawnSignature, setDrawnSignature] = useState<string | null>(null)

    // Requests list
    const [requests, setRequests] = useState<SigningRequest[]>([])
    const [selectedRequest, setSelectedRequest] = useState<SigningRequest | null>(null)
    const [auditTrail, setAuditTrail] = useState<any[]>([])

    // Load requests
    useEffect(() => {
        if (activeTab === 'requests') {
            loadRequests()
        }
    }, [activeTab])

    const loadRequests = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/v1/esign/requests`)
            const data = await res.json()
            if (data.success) {
                setRequests(data.data)
            }
        } catch (error) {
            console.error('Failed to load requests:', error)
        }
    }

    const loadRequestDetails = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/v1/esign/requests/${id}`)
            const data = await res.json()
            if (data.success) {
                setSelectedRequest(data.data)
                setSigningRequestId(id)
                if (data.data.signees?.length > 0) {
                    setSigneeId(data.data.signees[0].id)
                }
            }
        } catch (error) {
            console.error('Failed to load request details:', error)
        }
    }

    const loadAuditTrail = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/v1/esign/audit/${id}`)
            const data = await res.json()
            if (data.success) {
                setAuditTrail(data.data.events)
            }
        } catch (error) {
            console.error('Failed to load audit trail:', error)
        }
    }

    const formatError = (error: any): string => {
        if (typeof error === 'string') return error;
        if (error?.message) return error.message;
        return 'An unknown error occurred';
    };

    // Create signing request
    const handleCreateRequest = async () => {
        if (!documentTitle) {
            setMessage({ type: 'error', text: 'Please enter a document title' })
            return
        }

        setLoading(true)
        setMessage(null)

        try {
            const body = {
                documentId: crypto.randomUUID(),
                documentType,
                documentTitle,
                originalPdfUrl: '/test/test-document.pdf',
                signees: [
                    signeeType === 'internal'
                        ? { signeeType: 'internal', userId: '575438e9-a0a2-461d-8011-e9e54c30acd3', signeeRole: 'Approver' }
                        : { signeeType: 'external', externalName, externalEmail, externalPhone, signeeRole: 'External Signee' }
                ]
            }

            const res = await fetch(`${API_BASE}/api/v1/esign/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            const data = await res.json()

            if (data.success) {
                setMessage({ type: 'success', text: `Signing request created: ${data.data.id}` })
                setSigningRequestId(data.data.id)
                setDocumentTitle('')
            } else {
                setMessage({ type: 'error', text: formatError(data.error) || 'Failed to create request' })
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message })
        } finally {
            setLoading(false)
        }
    }

    // ... (omitted parts) ...


    // Canvas drawing functions
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        setIsDrawing(true)
        const rect = canvas.getBoundingClientRect()
        ctx.beginPath()
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    }

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const rect = canvas.getBoundingClientRect()
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.stroke()
    }

    const stopDrawing = () => {
        setIsDrawing(false)
        const canvas = canvasRef.current
        if (canvas) {
            setDrawnSignature(canvas.toDataURL('image/png'))
        }
    }

    const clearCanvas = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        setDrawnSignature(null)
    }

    // Capture signature
    const handleSign = async () => {
        if (!consentChecked) {
            setMessage({ type: 'error', text: 'Please accept the consent statement' })
            return
        }

        if (!signingRequestId || !signeeId) {
            setMessage({ type: 'error', text: 'Please select a signing request and signee' })
            return
        }

        if (signatureMethod === 'typed_name' && !typedName) {
            setMessage({ type: 'error', text: 'Please type your name' })
            return
        }

        if (signatureMethod === 'drawn_signature' && !drawnSignature) {
            setMessage({ type: 'error', text: 'Please draw your signature' })
            return
        }

        setLoading(true)
        setMessage(null)

        try {
            const body = {
                signingRequestId,
                signeeId,
                signatureMethod,
                signatureImageBase64: signatureMethod === 'drawn_signature' ? drawnSignature : (signatureMethod === 'typed_name' ? btoa(typedName) : null),
                stepUpMethod: 'otp',
                stepUpCode: stepUpCode || '123456' // Default for testing
            }

            const res = await fetch(`${API_BASE}/api/v1/esign/sign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            const data = await res.json()

            if (data.success) {
                setMessage({ type: 'success', text: 'Document signed successfully!' })
                setConsentChecked(false)
                clearCanvas()
                setTypedName('')
            } else {
                setMessage({ type: 'error', text: formatError(data.error) || 'Failed to sign document' })
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-10">
            {/* Header */}
            <div className="mb-6">
                <h1 className="font-mono text-2xl text-amber-500 tracking-wider flex items-center gap-3">
                    <FileSignature className="w-6 h-6" />
                    E-SIGNATURE TESTING
                </h1>
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                    IN-HOUSE ELECTRONIC SIGNATURE SYSTEM • TESTING INTERFACE
                </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <DataMetricCard
                    title="Pending Signatures"
                    value={requests.filter(r => r.status === 'pending_sign').length}
                    subtitle="Awaiting signature"
                    icon={Clock}
                    color="amber"
                />
                <DataMetricCard
                    title="Completed"
                    value={requests.filter(r => r.status === 'signed').length}
                    subtitle="Fully signed"
                    icon={CheckCircle}
                    color="green"
                />
                <DataMetricCard
                    title="Total Requests"
                    value={requests.length}
                    subtitle="All time"
                    icon={FileText}
                    color="blue"
                />
                <DataMetricCard
                    title="E-Sign Status"
                    value="ACTIVE"
                    subtitle="System operational"
                    icon={Shield}
                    color="green"
                    status="live"
                />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6">
                {[
                    { id: 'create', label: 'CREATE REQUEST', icon: Upload },
                    { id: 'sign', label: 'SIGN DOCUMENT', icon: PenTool },
                    { id: 'requests', label: 'VIEW REQUESTS', icon: FileText },
                    { id: 'audit', label: 'AUDIT TRAIL', icon: Eye },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            'px-4 py-2 font-mono text-[10px] tracking-wider transition-colors border flex items-center gap-2',
                            activeTab === tab.id
                                ? 'bg-amber-500 text-black border-amber-500 font-bold'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                        )}
                    >
                        <tab.icon className="w-3 h-3" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Message */}
            {message && (
                <div className={cn(
                    'mb-4 p-3 border font-mono text-xs',
                    message.type === 'success' ? 'bg-green-900/30 border-green-500/50 text-green-400' : 'bg-red-900/30 border-red-500/50 text-red-400'
                )}>
                    {message.type === 'success' ? <CheckCircle className="w-4 h-4 inline mr-2" /> : <XCircle className="w-4 h-4 inline mr-2" />}
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Create Request Tab */}
                {activeTab === 'create' && (
                    <TerminalPanel title="Create Signing Request">
                        <div className="space-y-4">
                            <div>
                                <Label className="font-mono text-xs text-zinc-400">Document Title</Label>
                                <Input
                                    value={documentTitle}
                                    onChange={e => setDocumentTitle(e.target.value)}
                                    placeholder="e.g., Lease Agreement - Unit 3A"
                                    className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label className="font-mono text-xs text-zinc-400">Document Type</Label>
                                <Select value={documentType} onValueChange={setDocumentType}>
                                    <SelectTrigger className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="test_document">Test Document</SelectItem>
                                        <SelectItem value="lease_agreement">Lease Agreement</SelectItem>
                                        <SelectItem value="valuation_report">Valuation Report</SelectItem>
                                        <SelectItem value="sale_agreement">Sale Agreement</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="font-mono text-xs text-zinc-400">Signee Type</Label>
                                <div className="flex gap-2 mt-1">
                                    <button
                                        onClick={() => setSigneeType('internal')}
                                        className={cn(
                                            'flex-1 py-2 font-mono text-xs border transition-colors',
                                            signeeType === 'internal'
                                                ? 'bg-amber-500 text-black border-amber-500'
                                                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                                        )}
                                    >
                                        Internal (Logged In)
                                    </button>
                                    <button
                                        onClick={() => setSigneeType('external')}
                                        className={cn(
                                            'flex-1 py-2 font-mono text-xs border transition-colors',
                                            signeeType === 'external'
                                                ? 'bg-amber-500 text-black border-amber-500'
                                                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                                        )}
                                    >
                                        External (Magic Link)
                                    </button>
                                </div>
                            </div>

                            {signeeType === 'external' && (
                                <div className="space-y-3 p-3 bg-zinc-900/50 border border-zinc-800">
                                    <div>
                                        <Label className="font-mono text-xs text-zinc-400">External Signee Name</Label>
                                        <Input
                                            value={externalName}
                                            onChange={e => setExternalName(e.target.value)}
                                            placeholder="John Doe"
                                            className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-sm"
                                        />
                                    </div>
                                    <div>
                                        <Label className="font-mono text-xs text-zinc-400">Email</Label>
                                        <Input
                                            value={externalEmail}
                                            onChange={e => setExternalEmail(e.target.value)}
                                            placeholder="john@example.com"
                                            className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-sm"
                                        />
                                    </div>
                                    <div>
                                        <Label className="font-mono text-xs text-zinc-400">Phone</Label>
                                        <Input
                                            value={externalPhone}
                                            onChange={e => setExternalPhone(e.target.value)}
                                            placeholder="+233 XX XXX XXXX"
                                            className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-sm"
                                        />
                                    </div>
                                </div>
                            )}

                            <Button
                                onClick={handleCreateRequest}
                                disabled={loading}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-mono"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                                CREATE SIGNING REQUEST
                            </Button>
                        </div>
                    </TerminalPanel>
                )}

                {/* Sign Document Tab */}
                {activeTab === 'sign' && (
                    <>
                        <TerminalPanel title="Sign Document">
                            <div className="space-y-4">
                                <div>
                                    <Label className="font-mono text-xs text-zinc-400">Signing Request ID</Label>
                                    <Input
                                        value={signingRequestId}
                                        onChange={e => {
                                            setSigningRequestId(e.target.value)
                                            if (e.target.value) loadRequestDetails(e.target.value)
                                        }}
                                        placeholder="Paste request ID or select from requests"
                                        className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-sm"
                                    />
                                </div>

                                {selectedRequest && (
                                    <div className="p-3 bg-zinc-900/50 border border-zinc-800">
                                        <div className="font-mono text-xs text-zinc-400">Document: {selectedRequest.documentTitle}</div>
                                        <div className="font-mono text-xs text-zinc-500">Status: {selectedRequest.status}</div>
                                        {selectedRequest.signees && (
                                            <div className="mt-2">
                                                <div className="font-mono text-[10px] text-zinc-500 mb-1">Signees:</div>
                                                {selectedRequest.signees.map(s => (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => setSigneeId(s.id)}
                                                        className={cn(
                                                            'p-2 border cursor-pointer transition-colors',
                                                            signeeId === s.id ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700 hover:border-zinc-600'
                                                        )}
                                                    >
                                                        <span className="font-mono text-xs">{s.signeeType === 'internal' ? 'Internal User' : s.externalName}</span>
                                                        <span className={cn(
                                                            'ml-2 text-[10px]',
                                                            s.status === 'signed' ? 'text-green-400' : 'text-yellow-400'
                                                        )}>{s.status.toUpperCase()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <Label className="font-mono text-xs text-zinc-400">Signature Method</Label>
                                    <div className="flex gap-2 mt-1">
                                        {[
                                            { id: 'click_to_sign', label: 'Click', icon: MousePointer },
                                            { id: 'typed_name', label: 'Type', icon: Type },
                                            { id: 'drawn_signature', label: 'Draw', icon: PenTool },
                                        ].map(method => (
                                            <button
                                                key={method.id}
                                                onClick={() => setSignatureMethod(method.id as SignatureMethod)}
                                                className={cn(
                                                    'flex-1 py-2 font-mono text-xs border transition-colors flex items-center justify-center gap-2',
                                                    signatureMethod === method.id
                                                        ? 'bg-amber-500 text-black border-amber-500'
                                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                                                )}
                                            >
                                                <method.icon className="w-3 h-3" />
                                                {method.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {signatureMethod === 'typed_name' && (
                                    <div>
                                        <Label className="font-mono text-xs text-zinc-400">Type Your Full Name</Label>
                                        <Input
                                            value={typedName}
                                            onChange={e => setTypedName(e.target.value)}
                                            placeholder="Your legal name"
                                            className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-lg italic"
                                        />
                                    </div>
                                )}

                                {signatureMethod === 'drawn_signature' && (
                                    <div>
                                        <Label className="font-mono text-xs text-zinc-400">Draw Your Signature</Label>
                                        <div className="mt-1 border border-zinc-700 bg-zinc-900">
                                            <canvas
                                                ref={canvasRef}
                                                width={400}
                                                height={150}
                                                onMouseDown={startDrawing}
                                                onMouseMove={draw}
                                                onMouseUp={stopDrawing}
                                                onMouseLeave={stopDrawing}
                                                className="cursor-crosshair w-full"
                                            />
                                        </div>
                                        <button
                                            onClick={clearCanvas}
                                            className="mt-1 text-xs font-mono text-zinc-500 hover:text-amber-500"
                                        >
                                            Clear Signature
                                        </button>
                                    </div>
                                )}

                                <div>
                                    <Label className="font-mono text-xs text-zinc-400">Step-Up Verification Code (OTP)</Label>
                                    <Input
                                        value={stepUpCode}
                                        onChange={e => setStepUpCode(e.target.value)}
                                        placeholder="Enter 6-digit code (use 123456 for testing)"
                                        className="mt-1 bg-zinc-800 border-zinc-700 font-mono text-sm"
                                    />
                                </div>

                                <div className="p-3 bg-zinc-900/50 border border-zinc-800">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={consentChecked}
                                            onChange={e => setConsentChecked(e.target.checked)}
                                            className="mt-0.5 accent-amber-500"
                                        />
                                        <span className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                                            By clicking &quot;Sign&quot;, I agree to sign this document electronically.
                                            I understand that my electronic signature is legally binding and has the same
                                            legal effect as my handwritten signature. I consent to the use of electronic
                                            records and signatures pursuant to the Electronic Transactions Act (Act 772) of Ghana.
                                        </span>
                                    </label>
                                </div>

                                <Button
                                    onClick={handleSign}
                                    disabled={loading || !consentChecked}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white font-mono"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                                    SIGN DOCUMENT
                                </Button>
                            </div>
                        </TerminalPanel>
                    </>
                )}

                {/* View Requests Tab */}
                {activeTab === 'requests' && (
                    <TerminalPanel title="Signing Requests">
                        <div className="space-y-2">
                            <Button onClick={loadRequests} variant="outline" size="sm" className="mb-2 font-mono text-xs">
                                Refresh
                            </Button>
                            {requests.length === 0 ? (
                                <div className="text-center py-8 text-zinc-500 font-mono text-xs">
                                    No signing requests found
                                </div>
                            ) : (
                                requests.map(request => (
                                    <div
                                        key={request.id}
                                        onClick={() => loadRequestDetails(request.id)}
                                        className="p-3 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono text-sm text-white">{request.documentTitle}</span>
                                            <span className={cn(
                                                'px-2 py-0.5 font-mono text-[10px] border',
                                                request.status === 'signed' ? 'bg-green-900/30 text-green-400 border-green-500/30' :
                                                    request.status === 'pending_sign' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' :
                                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                            )}>
                                                {request.status.replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="font-mono text-[10px] text-zinc-500 mt-1">
                                            ID: {request.id.substring(0, 8)}... | Type: {request.documentType}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </TerminalPanel>
                )}

                {/* Audit Trail Tab */}
                {activeTab === 'audit' && (
                    <TerminalPanel title="Audit Trail">
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <Input
                                    value={signingRequestId}
                                    onChange={e => setSigningRequestId(e.target.value)}
                                    placeholder="Signing Request ID"
                                    className="flex-1 bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                                <Button onClick={() => loadAuditTrail(signingRequestId)} className="font-mono text-xs">
                                    Load Audit
                                </Button>
                            </div>

                            {auditTrail.length > 0 ? (
                                <div className="space-y-1">
                                    {auditTrail.map((event, i) => (
                                        <div key={event.eventId} className="p-2 bg-zinc-900/50 border border-zinc-800">
                                            <div className="flex items-center gap-2">
                                                <span className="text-zinc-600 font-mono text-[10px]">{i + 1}</span>
                                                <span className="font-mono text-xs text-amber-500">{event.eventType}</span>
                                                <span className="font-mono text-[10px] text-zinc-500 ml-auto">
                                                    {new Date(event.timestampUtc).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="font-mono text-[10px] text-zinc-500 mt-1">
                                                Actor: {event.actorType} | IP: {event.ipAddress || 'N/A'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-zinc-500 font-mono text-xs">
                                    Enter a signing request ID and click &quot;Load Audit&quot;
                                </div>
                            )}
                        </div>
                    </TerminalPanel>
                )}

                {/* Right Column - Status & Help */}
                <TerminalPanel title="E-Sign System Status">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="font-mono text-xs text-green-400">System Operational</span>
                        </div>

                        <div className="space-y-2 font-mono text-[10px] text-zinc-500">
                            <div className="flex justify-between">
                                <span>Cryptography</span>
                                <span className="text-green-400">ECDSA P-256</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Document Hash</span>
                                <span className="text-green-400">SHA-256</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Timestamp Authority</span>
                                <span className="text-green-400">Internal TSA</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Key Storage</span>
                                <span className="text-yellow-400">Local (Dev Mode)</span>
                            </div>
                        </div>

                        <div className="border-t border-zinc-800 pt-4">
                            <h4 className="font-mono text-xs text-zinc-400 mb-2">Quick Test Flow:</h4>
                            <ol className="font-mono text-[10px] text-zinc-500 space-y-1 list-decimal list-inside">
                                <li>Create a new signing request</li>
                                <li>Copy the request ID</li>
                                <li>Go to &quot;Sign Document&quot; tab</li>
                                <li>Paste ID and select signee</li>
                                <li>Choose signature method</li>
                                <li>Check consent and sign</li>
                                <li>View audit trail</li>
                            </ol>
                        </div>
                    </div>
                </TerminalPanel>
            </div>
        </div>
    )
}
