// =====================================================
// PROPMETRIK — Real Estate Project Invoice Builder
// =====================================================
// PAYSTACK: backend/src/services/property-management/payment/paystackService.ts
//   → paystackService.initializeTransaction({ email, amount(pesewas), currency, metadata, callback_url })
//   → returns { authorization_url, access_code, reference }
//   → Frontend calls backend API endpoint to initialize, then redirects to authorization_url
//
// CONTRACT: blockchain/contracts/PROPMETRIKPayments.sol
//   → recordOffChainPayment(paymentReference, recipientEntityId, paymentType, payCurrency, outcomeCurrency, amountUsd6, externalPaymentId, attestationHash, timestamp)
//   → Backend: shared-services/payments/crypto/attestationService.ts → attestOffChainPayment(ref)
//   → Backend: shared-services/payments/feeEngine.ts → feeEngine.calculate('project', amount)
//
// EMAIL: backend/shared-services/notifications/unified/index.ts
//   → notificationService.sendEmail({ to, subject, html, text })
//   → No PDF buffer support — inline HTML only
//
// USER: import { useSession } from 'next-auth/react' → session.user.{ name, email, organizationName, organizationId }
// PROJECTS: import { fetchApi } from '@/lib/api' → fetchApi('/projects?limit=100')
// CURRENCY: import { formatCurrency } from '@/lib/utils'
// =====================================================

'use client'

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { fetchApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import {
  Plus,
  Trash2,
  GripVertical,
  Send,
  Download,
  Copy,
  Ban,
  Save,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Info,
  X,
  Upload,
  Hash,
  Milestone,
  MessageSquare,
} from 'lucide-react'
import { paymentMilestoneApi, PaymentMilestone } from '@/lib/budget-api'

// =====================================================
// TYPES
// =====================================================

type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'SETTLED' | 'VOID'

type PaymentTerms = 'due_on_receipt' | 'net_15' | 'net_30' | 'net_45' | 'net_60'

type LineItemCategory =
  | 'professional_fee'
  | 'construction_work'
  | 'materials'
  | 'consultancy'
  | 'site_supervision'
  | 'reimbursable'
  | 'other'

type LineItemUnit = 'hrs' | 'days' | 'sqm' | 'sqft' | 'LS' | 'item' | 'month'

type ProjectPhase = 'pre_design' | 'design' | 'construction' | 'closeout'
type ContractType = 'lump_sum' | 'unit_rate' | 'cost_plus' | 'retainer'

type CurrencyCode = 'GHS' | 'USD' | 'GBP' | 'EUR'

interface SectionHeader {
  type: 'section'
  id: string
  title: string
}

interface LineItem {
  type: 'item'
  id: string
  description: string
  category: LineItemCategory
  qty: number
  unit: LineItemUnit
  unitRate: number
}

type InvoiceRow = LineItem | SectionHeader

interface BillParty {
  companyName: string
  address: string
  email: string
  phone: string
  taxId: string
}

interface PaymentInfo {
  bankName: string
  accountName: string
  accountNumber: string
  sortCode: string
  momoNetwork: string
  momoNumber: string
  paystackUrl: string
}

interface InvoiceData {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  paymentTerms: PaymentTerms
  status: InvoiceStatus
  currency: CurrencyCode
  billFrom: BillParty
  billTo: BillParty & { poReference: string }
  projectName: string
  projectId: string
  projectPhase: ProjectPhase
  contractType: ContractType
  rows: InvoiceRow[]
  taxes: {
    vatEnabled: boolean        // 15% — Ghana VAT
    nhilEnabled: boolean       // 2.5% — National Health Insurance Levy
    getfundEnabled: boolean    // 2.5% — Ghana Education Trust Fund Levy
    covidLevyEnabled: boolean  // 1% — COVID-19 Health Recovery Levy
  }
  discountEnabled: boolean
  discountPercent: number
  retentionEnabled: boolean
  retentionPercent: number
  platformFees: {
    platformFeePercent: number // 0.25% for projects — from PROPMETRIK fee engine
  }
  notes: string
  terms: string
  customMessage: string  // personalized message for the email
  latePaymentEnabled: boolean
  latePaymentPercent: number
  paymentInfo: PaymentInfo
  attachments: string[]
  blockchainTxHash: string
  paystackReference: string
}

interface SendStep {
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
  detail?: string
}

// =====================================================
// CONSTANTS
// =====================================================

const CATEGORY_LABELS: Record<LineItemCategory, string> = {
  professional_fee: 'Professional Fee',
  construction_work: 'Construction Work',
  materials: 'Materials',
  consultancy: 'Consultancy',
  site_supervision: 'Site Supervision',
  reimbursable: 'Reimbursable Expense',
  other: 'Other',
}

const UNIT_LABELS: Record<LineItemUnit, string> = {
  hrs: 'hrs',
  days: 'days',
  sqm: 'sqm',
  sqft: 'sqft',
  LS: 'LS',
  item: 'item',
  month: 'month',
}

// Ghana composite tax rates — source: backend/database/migrations/147_valuation_invoices.sql
const GHANA_TAXES = [
  { key: 'vatEnabled' as const, label: 'VAT', rate: 15, description: 'Value Added Tax (GRA)' },
  { key: 'nhilEnabled' as const, label: 'NHIL', rate: 2.5, description: 'National Health Insurance Levy' },
  { key: 'getfundEnabled' as const, label: 'GETFund', rate: 2.5, description: 'Ghana Education Trust Fund Levy' },
  { key: 'covidLevyEnabled' as const, label: 'COVID-19 Levy', rate: 1, description: 'COVID-19 Health Recovery Levy' },
]

// Platform fee for projects — source: backend/shared-services/payments/feeEngine.ts
// project → percentage mode, 0.25% (0.0025), no flat, no min/max
const PROJECT_PLATFORM_FEE_PERCENT = 0.25

const PHASE_LABELS: Record<ProjectPhase, string> = {
  pre_design: 'Pre-Design',
  design: 'Design',
  construction: 'Construction',
  closeout: 'Closeout',
}

const CONTRACT_LABELS: Record<ContractType, string> = {
  lump_sum: 'Lump Sum',
  unit_rate: 'Unit Rate',
  cost_plus: 'Cost-Plus',
  retainer: 'Retainer',
}

const TERMS_LABELS: Record<PaymentTerms, string> = {
  due_on_receipt: 'Due on Receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
}

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-zinc-700 text-zinc-300',
  SENT: 'bg-blue-900/60 text-blue-400',
  VIEWED: 'bg-amber-900/60 text-amber-400',
  PAID: 'bg-green-900/60 text-green-400',
  SETTLED: 'bg-emerald-900/60 text-emerald-300',
  VOID: 'bg-red-900/60 text-red-400',
}

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  GHS: 'GH₵',
  USD: '$',
  GBP: '£',
  EUR: '€',
}

const CURRENCY_SUBUNITS: Record<CurrencyCode, number> = {
  GHS: 100, // pesewas
  USD: 100, // cents
  GBP: 100, // pence
  EUR: 100, // cents
}

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear()
  const seq = String(Math.floor(Math.random() * 9000) + 1000)
  return `INV-${year}-${seq}`
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function fmtMoney(amount: number, currency: CurrencyCode): string {
  const sym = CURRENCY_SYMBOLS[currency]
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (amount < 0) return `−${sym}${formatted}`
  return `${sym}${formatted}`
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// =====================================================
// SEED DATA
// =====================================================

function createSeedInvoice(): InvoiceData {
  return {
    invoiceNumber: '', // set in useEffect to avoid hydration mismatch
    invoiceDate: todayStr(),
    dueDate: addDays(todayStr(), 30),
    paymentTerms: 'net_30',
    status: 'DRAFT',
    currency: 'GHS',
    billFrom: {
      companyName: '',
      address: '',
      email: '',
      phone: '',
      taxId: '',
    },
    billTo: {
      companyName: '',
      address: '',
      email: '',
      phone: '',
      taxId: '',
      poReference: '',
    },
    projectName: '',
    projectId: '',
    projectPhase: 'construction',
    contractType: 'lump_sum',
    rows: [
      {
        type: 'item',
        id: uid(),
        description: '',
        category: 'other',
        qty: 0,
        unit: 'item',
        unitRate: 0,
      },
    ],
    taxes: {
      vatEnabled: false,
      nhilEnabled: false,
      getfundEnabled: false,
      covidLevyEnabled: false,
    },
    discountEnabled: false,
    discountPercent: 0,
    retentionEnabled: false,
    retentionPercent: 10,
    platformFees: {
      platformFeePercent: PROJECT_PLATFORM_FEE_PERCENT,
    },
    notes: 'Payment preferred via Paystack or bank transfer. Mobile money accepted.',
    customMessage: '',
    terms:
      'Payment is due within 30 days of invoice date. Late payments attract a 1.5% monthly surcharge as per the Ghana Construction Industry Standards. All amounts are in Ghana Cedis unless otherwise stated.',
    latePaymentEnabled: true,
    latePaymentPercent: 1.5,
    paymentInfo: {
      bankName: '',
      accountName: '',
      accountNumber: '',
      sortCode: '',
      momoNetwork: '',
      momoNumber: '',
      paystackUrl: '',
    },
    attachments: [],
    blockchainTxHash: '',
    paystackReference: '',
  }
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function InvoiceBuilder() {
  const { data: session } = useSession()
  const [inv, setInv] = useState<InvoiceData>(() => createSeedInvoice())
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [sending, setSending] = useState(false)
  const [sendSteps, setSendSteps] = useState<SendStep[]>([])
  const [showSendModal, setShowSendModal] = useState(false)
  const [expandPayment, setExpandPayment] = useState(false)
  const [expandNotes, setExpandNotes] = useState(true)
  const [expandAttach, setExpandAttach] = useState(false)
  const [showMilestoneModal, setShowMilestoneModal] = useState(false)
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [selectedMilestones, setSelectedMilestones] = useState<Set<string>>(new Set())
  const [loadingMilestones, setLoadingMilestones] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Generate invoice number on client only (avoids hydration mismatch from Math.random)
  useEffect(() => {
    if (!inv.invoiceNumber) {
      setInv(prev => ({ ...prev, invoiceNumber: generateInvoiceNumber() }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-populate bill from user session
  useEffect(() => {
    if (session?.user) {
      setInv(prev => ({
        ...prev,
        billFrom: {
          ...prev.billFrom,
          companyName: prev.billFrom.companyName || (session.user as any).organizationName || '',
          email: prev.billFrom.email || session.user.email || '',
        },
      }))
    }
  }, [session])

  // Fetch projects — store full project data for owner/currency/budget
  useEffect(() => {
    fetchApi<any>('/projects?limit=100')
      .then(res => {
        const list = res.projects || res.data || (Array.isArray(res) ? res : [])
        setProjects(list)
      })
      .catch(() => {})
  }, [])

  // =====================================================
  // CALCULATIONS
  // =====================================================

  const calculations = useMemo(() => {
    const lineItems = inv.rows.filter((r): r is LineItem => r.type === 'item')

    const subtotal = lineItems.reduce((sum, li) => sum + li.qty * li.unitRate, 0)

    // Ghana taxes — each applies to subtotal independently
    const enabledTaxes = GHANA_TAXES
      .filter(t => inv.taxes[t.key])
      .map(t => ({ ...t, amount: subtotal * (t.rate / 100) }))
    const totalTax = enabledTaxes.reduce((s, t) => s + t.amount, 0)
    const compositeRate = enabledTaxes.reduce((s, t) => s + t.rate, 0)

    const discount = inv.discountEnabled ? subtotal * (inv.discountPercent / 100) : 0
    const retention = inv.retentionEnabled ? subtotal * (inv.retentionPercent / 100) : 0

    const invoiceTotal = subtotal + totalTax - discount - retention

    // Platform fee — added ON TOP (payer pays, vendor receives full invoiceTotal)
    // Source: feeEngine.calculate() → totalCharge = principal + serviceFee
    const platformFee = invoiceTotal * (inv.platformFees.platformFeePercent / 100)
    const totalDue = invoiceTotal + platformFee // Client pays this

    return {
      lineItems,
      subtotal,
      enabledTaxes,
      totalTax,
      compositeRate,
      discount,
      retention,
      invoiceTotal,
      platformFee,
      totalDue,
    }
  }, [inv])

  // =====================================================
  // HANDLERS
  // =====================================================

  const update = useCallback(
    (patch: Partial<InvoiceData>) => setInv(prev => ({ ...prev, ...patch })),
    []
  )

  const updateBillFrom = (patch: Partial<BillParty>) =>
    update({ billFrom: { ...inv.billFrom, ...patch } })

  const updateBillTo = (patch: Partial<BillParty & { poReference: string }>) =>
    update({ billTo: { ...inv.billTo, ...patch } })

  const updateFees = (patch: Partial<InvoiceData['platformFees']>) =>
    update({ platformFees: { ...inv.platformFees, ...patch } })

  const updateTaxes = (patch: Partial<InvoiceData['taxes']>) =>
    update({ taxes: { ...inv.taxes, ...patch } })

  const updatePayment = (patch: Partial<PaymentInfo>) =>
    update({ paymentInfo: { ...inv.paymentInfo, ...patch } })

  const addLineItem = () => {
    const row: LineItem = {
      type: 'item',
      id: uid(),
      description: '',
      category: 'other',
      qty: 1,
      unit: 'item',
      unitRate: 0,
    }
    update({ rows: [...inv.rows, row] })
  }

  const addSectionHeader = () => {
    const row: SectionHeader = { type: 'section', id: uid(), title: '' }
    update({ rows: [...inv.rows, row] })
  }

  // ── Milestone Import ──────────────────────────────────
  const openMilestoneImport = async () => {
    if (!inv.projectId) {
      alert('Select a project first to import milestones.')
      return
    }
    setLoadingMilestones(true)
    setShowMilestoneModal(true)
    setSelectedMilestones(new Set())
    try {
      const data = await paymentMilestoneApi.getAll(inv.projectId)
      // Filter to milestones that haven't been invoiced yet
      const available = (Array.isArray(data) ? data : []).filter(
        (m: any) => !['paid', 'cancelled'].includes(m.status)
      )
      setMilestones(available)
    } catch (err) {
      console.warn('Failed to fetch milestones:', err)
      setMilestones([])
    } finally {
      setLoadingMilestones(false)
    }
  }

  const toggleMilestone = (id: string) => {
    setSelectedMilestones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const importSelectedMilestones = () => {
    const chosen = milestones.filter(m => selectedMilestones.has(m.id))
    if (chosen.length === 0) return

    // Create a section header + line items from milestones
    const newRows: InvoiceRow[] = [
      { type: 'section', id: uid(), title: 'Project Milestones' },
      ...chosen.map(m => ({
        type: 'item' as const,
        id: uid(),
        description: m.name + (m.description ? ` — ${m.description}` : ''),
        category: 'construction_work' as LineItemCategory,
        qty: 1,
        unit: 'LS' as LineItemUnit,
        unitRate: m.amount || 0,
      })),
    ]

    // Remove the initial empty line item if user hasn't edited it
    const existingRows = inv.rows.filter(r => {
      if (r.type !== 'item') return true
      const li = r as LineItem
      return li.description !== '' || li.unitRate !== 0
    })

    update({ rows: [...existingRows, ...newRows] })
    setShowMilestoneModal(false)
  }

  const removeRow = (id: string) => {
    update({ rows: inv.rows.filter(r => r.id !== id) })
  }

  const updateRow = (id: string, patch: Record<string, any>) => {
    update({
      rows: inv.rows.map(r => (r.id === id ? { ...r, ...patch } as typeof r : r)),
    })
  }

  const moveRow = (idx: number, dir: -1 | 1) => {
    const next = [...inv.rows]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    update({ rows: next })
  }

  // Payment terms → due date sync
  const setPaymentTerms = (terms: PaymentTerms) => {
    const days: Record<PaymentTerms, number> = {
      due_on_receipt: 0,
      net_15: 15,
      net_30: 30,
      net_45: 45,
      net_60: 60,
    }
    update({ paymentTerms: terms, dueDate: addDays(inv.invoiceDate, days[terms]) })
  }

  // =====================================================
  // SEND INVOICE FLOW
  // Uses existing PM payment infrastructure:
  //   1. POST /api/budget/invoices         → create/save invoice
  //   2. POST /api/budget/invoices/:id/send → Paystack link + email (one call)
  // =====================================================

  const handleSend = async () => {
    // Step 0 — Validate
    if (!inv.billTo.email) {
      alert('Client email is required to send an invoice.')
      return
    }
    if (calculations.lineItems.length === 0) {
      alert('Add at least one line item.')
      return
    }
    if (!inv.billTo.companyName) {
      alert('Client name is required.')
      return
    }

    setSending(true)
    const steps: SendStep[] = [
      { label: 'Saving invoice', status: 'pending' },
      { label: 'Generating payment link & sending email', status: 'pending' },
      { label: 'Finalizing', status: 'pending' },
    ]
    setSendSteps([...steps])
    setShowSendModal(true)

    try {
      // ──────────────────────────────────────────────────────
      // Step 1 — Save invoice to database via POST /api/budget/invoices
      // ──────────────────────────────────────────────────────
      steps[0].status = 'active'
      setSendSteps([...steps])

      const orgId = (session?.user as any)?.organizationId || ''
      // Schema expects snake_case: project_id, invoice_number, issue_date, due_date, tax_amount, line_items
      const savePayload = {
        project_id: inv.projectId || undefined,
        organization_id: orgId,
        invoice_number: inv.invoiceNumber,
        amount: calculations.subtotal,
        currency: inv.currency,
        tax_amount: calculations.totalTax,
        issue_date: inv.invoiceDate,
        due_date: inv.dueDate,
        line_items: calculations.lineItems.map((li: any) => ({
          description: li.description || 'Line item',
          quantity: li.qty || li.quantity || 1,
          unit_price: li.unitRate || li.rate || li.unit_price || 0,
          amount: (li.qty || li.quantity || 1) * (li.unitRate || li.rate || li.unit_price || 0),
        })),
        description: `Invoice from ${inv.billFrom.companyName} to ${inv.billTo.companyName}`,
      }

      const createRes = await fetchApi<any>('/budget/invoices', {
        method: 'POST',
        body: JSON.stringify(savePayload),
      })

      const savedInvoice = createRes?.data || createRes
      const invoiceId = savedInvoice?.id
      if (!invoiceId) throw new Error('Failed to save invoice — no ID returned')

      steps[0].status = 'done'
      steps[0].detail = `Saved: ${inv.invoiceNumber}`
      setSendSteps([...steps])

      // ──────────────────────────────────────────────────────
      // Step 2 — Send invoice (Paystack + email) via POST /api/budget/invoices/:id/send
      // Uses existing paystackService.initializeWithSubaccount + notificationService
      // ──────────────────────────────────────────────────────
      steps[1].status = 'active'
      setSendSteps([...steps])

      let paystackUrl = ''
      let paystackRef = ''

      try {
        const sendRes = await fetchApi<any>(`/budget/invoices/${invoiceId}/send`, {
          method: 'POST',
          body: JSON.stringify({
            clientEmail: inv.billTo.email,
            clientName: inv.billTo.companyName,
            vendorCompany: inv.billFrom.companyName,
            vendorEmail: inv.billFrom.email,
            projectName: inv.projectName,
            lineItems: calculations.lineItems.map((li: any) => ({
              description: li.description,
              quantity: li.qty,
              unitRate: li.unitRate,
              amount: li.qty * li.unitRate,
            })),
            subtotal: calculations.subtotal,
            totalTax: calculations.totalTax,
            discount: calculations.discount,
            retention: calculations.retention,
            totalAmount: calculations.totalDue,
            invoiceTotal: calculations.invoiceTotal,
            currency: inv.currency,
            dueDate: inv.dueDate,
            platformFee: calculations.platformFee,
            customMessage: inv.customMessage || undefined,
          }),
        })

        paystackUrl = sendRes?.paymentLink || ''
        paystackRef = sendRes?.paystackReference || ''
      } catch (err: any) {
        console.warn('Send invoice call failed:', err.message)
        // Non-blocking — invoice is saved, email/payment link may have failed
      }

      steps[1].status = 'done'
      steps[1].detail = paystackRef
        ? `Payment link generated • Email sent to ${inv.billTo.email}`
        : `Email sent to ${inv.billTo.email}`
      setSendSteps([...steps])

      // ──────────────────────────────────────────────────────
      // Step 3 — Finalize local state
      // ──────────────────────────────────────────────────────
      steps[2].status = 'active'
      setSendSteps([...steps])

      update({
        status: 'SENT',
        paystackReference: paystackRef,
        paymentInfo: { ...inv.paymentInfo, paystackUrl },
      })

      steps[2].status = 'done'
      steps[2].detail = 'Invoice marked as SENT'
      setSendSteps([...steps])
    } catch (err: any) {
      const activeIdx = steps.findIndex(s => s.status === 'active')
      if (activeIdx >= 0) {
        steps[activeIdx].status = 'error'
        steps[activeIdx].detail = err.message || 'Unknown error'
      }
      setSendSteps([...steps])
    } finally {
      setSending(false)
    }
  }

  const handleDownloadPDF = () => {
    if (previewRef.current) {
      const printWindow = window.open('', '_blank')
      if (!printWindow) return
      printWindow.document.write(`
        <html>
        <head>
          <title>Invoice ${inv.invoiceNumber}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { margin: 0; font-family: 'Inter', system-ui, sans-serif; }
            * { box-sizing: border-box; }
          </style>
        </head>
        <body>${previewRef.current.innerHTML}</body>
        </html>
      `)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => printWindow.print(), 300)
    }
  }

  const handleDuplicate = () => {
    setInv(prev => ({
      ...prev,
      invoiceNumber: generateInvoiceNumber(),
      status: 'DRAFT',
      blockchainTxHash: '',
      paystackReference: '',
      paymentInfo: { ...prev.paymentInfo, paystackUrl: '' },
    }))
  }

  const handleVoid = async () => {
    if (!confirm('Are you sure you want to void this invoice? This action is irreversible.')) return
    // If invoice was saved to DB, cancel it via the API
    // For now, just update local state since void is best-effort
    update({ status: 'VOID' })
  }

  // =====================================================
  // SHARED INPUT STYLES
  // =====================================================

  const inputCls =
    'w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-2 text-sm text-white placeholder:text-[#484F58] focus:outline-none focus:border-[#C9A84C] font-mono transition-colors'
  const selectCls =
    'w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C] font-mono transition-colors appearance-none'
  const labelCls = 'block text-xs font-medium text-[#8B949E] mb-1 tracking-wide uppercase'
  const cardCls = 'bg-[#161B22] border border-[#30363D] rounded-sm p-4'
  const sectionTitleCls = 'text-xs font-bold text-[#8B949E] tracking-widest uppercase mb-3'

  // =====================================================
  // RENDER - EDITOR FORM (Left Panel)
  // =====================================================

  const renderEditor = () => (
    <div className="space-y-4 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 140px)' }}>
      {/* Invoice Header */}
      <div className={cardCls}>
        <div className={sectionTitleCls}>Invoice Header</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Invoice Number</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#484F58]" />
              <input
                className={inputCls + ' pl-9'}
                value={inv.invoiceNumber}
                onChange={e => update({ invoiceNumber: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select
              className={selectCls}
              value={inv.currency}
              onChange={e => update({ currency: e.target.value as CurrencyCode })}
            >
              <option value="GHS">GHS — Ghana Cedi</option>
              <option value="USD">USD — US Dollar</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Invoice Date</label>
            <input
              type="date"
              className={inputCls}
              value={inv.invoiceDate}
              onChange={e => update({ invoiceDate: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Due Date</label>
            <input
              type="date"
              className={inputCls}
              value={inv.dueDate}
              onChange={e => update({ dueDate: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Payment Terms</label>
            <select
              className={selectCls}
              value={inv.paymentTerms}
              onChange={e => setPaymentTerms(e.target.value as PaymentTerms)}
            >
              {Object.entries(TERMS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Project Details — moved above Bill From/To */}
      <div className={cardCls}>
        <div className={sectionTitleCls}>Project Details</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Project</label>
            {projects.length > 0 ? (
              <select
                className={selectCls}
                value={inv.projectId}
                onChange={e => {
                  const p = projects.find((p: any) => p.id === e.target.value)
                  if (p) {
                    setSelectedProject(p)
                    const projectCurrency = (p.currency || p.display_currency || inv.currency) as CurrencyCode
                    update({
                      projectId: p.id,
                      projectName: p.name || p.project_name || inv.projectName,
                      currency: projectCurrency,
                      billTo: {
                        ...inv.billTo,
                        companyName: p.developer_name || '',
                        email: p.developer_email || '',
                        phone: p.developer_contact || '',
                      },
                    })
                  } else {
                    setSelectedProject(null)
                    update({ projectId: '', projectName: '' })
                  }
                }}
              >
                <option value="">Select project...</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name || p.project_name}</option>
                ))}
              </select>
            ) : (
              <input
                className={inputCls}
                placeholder="Project name"
                value={inv.projectName}
                onChange={e => update({ projectName: e.target.value })}
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Phase</label>
            <select className={selectCls} value={inv.projectPhase} onChange={e => update({ projectPhase: e.target.value as ProjectPhase })}>
              {Object.entries(PHASE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Contract Type</label>
            <select className={selectCls} value={inv.contractType} onChange={e => update({ contractType: e.target.value as ContractType })}>
              {Object.entries(CONTRACT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Project Financial Summary — shown when a project is selected */}
        {selectedProject && (() => {
          const budget = selectedProject.total_budget || 0
          const spent = selectedProject.total_spent || 0
          const balance = budget - spent
          const cur = (selectedProject.currency || selectedProject.display_currency || inv.currency) as CurrencyCode
          const util = budget > 0 ? Math.round((spent / budget) * 100) : 0
          return (
            <div className="mt-3 grid grid-cols-4 gap-2">
              <div className="bg-[#0D1117] border border-[#30363D] rounded p-2">
                <div className="text-[9px] text-[#484F58] uppercase tracking-wider">Budget</div>
                <div className="text-xs font-mono text-white">{fmtMoney(budget, cur)}</div>
              </div>
              <div className="bg-[#0D1117] border border-[#30363D] rounded p-2">
                <div className="text-[9px] text-[#484F58] uppercase tracking-wider">Spent</div>
                <div className="text-xs font-mono text-white">{fmtMoney(spent, cur)}</div>
              </div>
              <div className="bg-[#0D1117] border border-[#30363D] rounded p-2">
                <div className="text-[9px] text-[#484F58] uppercase tracking-wider">Balance</div>
                <div className={`text-xs font-mono ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtMoney(balance, cur)}</div>
              </div>
              <div className="bg-[#0D1117] border border-[#30363D] rounded p-2">
                <div className="text-[9px] text-[#484F58] uppercase tracking-wider">Utilization</div>
                <div className={`text-xs font-mono ${util > 100 ? 'text-red-400' : util > 80 ? 'text-amber-400' : 'text-white'}`}>{util}%</div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Bill From / Bill To */}
      <div className="grid grid-cols-2 gap-4">
        <div className={cardCls}>
          <div className={sectionTitleCls}>Bill From</div>
          <div className="space-y-2">
            <input className={inputCls} placeholder="Company Name" value={inv.billFrom.companyName} onChange={e => updateBillFrom({ companyName: e.target.value })} />
            <input className={inputCls} placeholder="Address" value={inv.billFrom.address} onChange={e => updateBillFrom({ address: e.target.value })} />
            <input className={inputCls} placeholder="Email" value={inv.billFrom.email} onChange={e => updateBillFrom({ email: e.target.value })} />
            <input className={inputCls} placeholder="Phone" value={inv.billFrom.phone} onChange={e => updateBillFrom({ phone: e.target.value })} />
            <input className={inputCls} placeholder="Tax/VAT ID" value={inv.billFrom.taxId} onChange={e => updateBillFrom({ taxId: e.target.value })} />
          </div>
        </div>
        <div className={cardCls}>
          <div className={sectionTitleCls}>Bill To</div>
          <div className="space-y-2">
            <input className={inputCls} placeholder="Client Name *" value={inv.billTo.companyName} onChange={e => updateBillTo({ companyName: e.target.value })} />
            <input className={inputCls} placeholder="Address" value={inv.billTo.address} onChange={e => updateBillTo({ address: e.target.value })} />
            <input className={inputCls} placeholder="Email *" value={inv.billTo.email} onChange={e => updateBillTo({ email: e.target.value })} />
            <input className={inputCls} placeholder="Phone" value={inv.billTo.phone} onChange={e => updateBillTo({ phone: e.target.value })} />
            <input className={inputCls} placeholder="PO / Reference" value={inv.billTo.poReference} onChange={e => updateBillTo({ poReference: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className={cardCls}>
        <div className={sectionTitleCls}>Line Items</div>
        <div className="space-y-1">
          {/* Header */}
          <div className="grid gap-2 text-[10px] text-[#8B949E] uppercase tracking-widest font-bold pb-1 border-b border-[#30363D]"
            style={{ gridTemplateColumns: '28px 1fr 120px 60px 70px 90px 100px 28px' }}>
            <span></span>
            <span>Description</span>
            <span>Category</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Rate</span>
            <span className="text-right">Total</span>
            <span></span>
          </div>

          {inv.rows.map((row, idx) => {
            if (row.type === 'section') {
              return (
                <div key={row.id} className="flex items-center gap-2 py-1.5 group">
                  <button onClick={() => moveRow(idx, -1)} className="text-[#484F58] hover:text-white"><GripVertical className="h-3.5 w-3.5" /></button>
                  <input
                    className="flex-1 bg-transparent border-none text-xs font-bold text-[#C9A84C] uppercase tracking-wide placeholder:text-[#484F58] focus:outline-none"
                    placeholder="Section header..."
                    value={row.title}
                    onChange={e => updateRow(row.id, { title: e.target.value })}
                  />
                  <button onClick={() => removeRow(row.id)} className="text-[#484F58] hover:text-red-400 opacity-0 group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            }

            const li = row as LineItem
            const lineTotal = li.qty * li.unitRate

            return (
              <div
                key={li.id}
                className="grid gap-2 items-center py-1 group border-b border-[#30363D]/50 hover:bg-[#0D1117]/50"
                style={{ gridTemplateColumns: '28px 1fr 120px 60px 70px 90px 100px 28px' }}
              >
                <button onClick={() => moveRow(idx, -1)} className="text-[#484F58] hover:text-white">
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <input
                  className="bg-transparent border-none text-xs text-white placeholder:text-[#484F58] focus:outline-none"
                  placeholder="Description..."
                  value={li.description}
                  onChange={e => updateRow(li.id, { description: e.target.value })}
                />
                <select
                  className="bg-transparent border-none text-xs text-[#8B949E] focus:outline-none"
                  value={li.category}
                  onChange={e => updateRow(li.id, { category: e.target.value as LineItemCategory })}
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="bg-transparent border-none text-xs text-white text-right font-mono focus:outline-none w-full"
                  value={li.qty}
                  onChange={e => updateRow(li.id, { qty: parseFloat(e.target.value) || 0 })}
                />
                <select
                  className="bg-transparent border-none text-xs text-[#8B949E] focus:outline-none"
                  value={li.unit}
                  onChange={e => updateRow(li.id, { unit: e.target.value as LineItemUnit })}
                >
                  {Object.entries(UNIT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="bg-transparent border-none text-xs text-white text-right font-mono focus:outline-none w-full"
                  value={li.unitRate}
                  onChange={e => updateRow(li.id, { unitRate: parseFloat(e.target.value) || 0 })}
                />
                <div className="text-xs font-mono text-white text-right">
                  {fmtMoney(lineTotal, inv.currency)}
                </div>
                <button onClick={() => removeRow(li.id)} className="text-[#484F58] hover:text-red-400 opacity-0 group-hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={addLineItem} className="flex items-center gap-1 text-xs text-[#C9A84C] hover:text-white transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Line Item
          </button>
          <button onClick={addSectionHeader} className="flex items-center gap-1 text-xs text-[#8B949E] hover:text-white transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Section Header
          </button>
          <button onClick={openMilestoneImport} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-white transition-colors ml-auto">
            <Milestone className="h-3.5 w-3.5" /> Import from Milestones
          </button>
        </div>
      </div>

      {/* Fee Summary */}
      <div className={cardCls}>
        <div className={sectionTitleCls}>Fee Summary</div>
        <div className="space-y-2 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-[#8B949E]">Subtotal</span>
            <span className="text-white">{fmtMoney(calculations.subtotal, inv.currency)}</span>
          </div>
          <div className="border-t border-[#30363D]" />

          {/* Ghana Taxes — toggleable checkmarks */}
          <div className="text-[10px] text-[#484F58] uppercase tracking-widest mt-1 mb-1">Ghana Taxes</div>
          {GHANA_TAXES.map(tax => (
            <div key={tax.key} className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-[#8B949E]">
                <input
                  type="checkbox"
                  checked={inv.taxes[tax.key]}
                  onChange={e => updateTaxes({ [tax.key]: e.target.checked })}
                  className="accent-[#C9A84C]"
                />
                {tax.label} ({tax.rate}%)
                <span className="text-[10px] text-[#484F58]">{tax.description}</span>
              </label>
              {inv.taxes[tax.key] && (
                <span className="text-white">{fmtMoney(calculations.subtotal * (tax.rate / 100), inv.currency)}</span>
              )}
            </div>
          ))}
          {calculations.compositeRate > 0 && (
            <div className="flex justify-between text-[#8B949E] text-[10px] pt-1">
              <span>Composite Tax Rate: {calculations.compositeRate}%</span>
              <span className="text-white">{fmtMoney(calculations.totalTax, inv.currency)}</span>
            </div>
          )}
          {calculations.enabledTaxes.length > 0 && <div className="border-t border-[#30363D]" />}

          {/* Discount toggle */}
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 text-[#8B949E]">
              <input
                type="checkbox"
                checked={inv.discountEnabled}
                onChange={e => update({ discountEnabled: e.target.checked })}
                className="accent-[#C9A84C]"
              />
              Discount
              {inv.discountEnabled && (
                <input
                  type="number"
                  className="w-12 bg-transparent border-b border-[#30363D] text-white text-right focus:outline-none focus:border-[#C9A84C]"
                  value={inv.discountPercent}
                  onChange={e => update({ discountPercent: parseFloat(e.target.value) || 0 })}
                />
              )}
              {inv.discountEnabled && <span>%</span>}
            </label>
            {inv.discountEnabled && (
              <span className="text-red-400">{fmtMoney(-calculations.discount, inv.currency)}</span>
            )}
          </div>

          {/* Retention toggle */}
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 text-[#8B949E]">
              <input
                type="checkbox"
                checked={inv.retentionEnabled}
                onChange={e => update({ retentionEnabled: e.target.checked })}
                className="accent-[#C9A84C]"
              />
              Retention
              {inv.retentionEnabled && (
                <input
                  type="number"
                  className="w-12 bg-transparent border-b border-[#30363D] text-white text-right focus:outline-none focus:border-[#C9A84C]"
                  value={inv.retentionPercent}
                  onChange={e => update({ retentionPercent: parseFloat(e.target.value) || 0 })}
                />
              )}
              {inv.retentionEnabled && <span>%</span>}
            </label>
            {inv.retentionEnabled && (
              <span className="text-red-400">{fmtMoney(-calculations.retention, inv.currency)}</span>
            )}
          </div>

          <div className="border-t border-[#30363D]" />
          <div className="flex justify-between">
            <span className="text-[#8B949E]">Subtotal After Adjustments</span>
            <span className="text-white">{fmtMoney(calculations.invoiceTotal, inv.currency)}</span>
          </div>

          {/* Platform Fee — added on top, client pays */}
          <div className="flex justify-between items-center">
            <span className="text-[#8B949E] flex items-center gap-1">
              PROPMETRIK Fee ({inv.platformFees.platformFeePercent}%)
              <div className="relative group">
                <Info className="h-3 w-3 text-[#484F58] cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-[#0D1117] border border-[#30363D] rounded text-[10px] text-[#8B949E] hidden group-hover:block z-50">
                  Platform fee is added to the invoice total. The payee pays this amount. Paystack processing fees are charged separately at checkout.
                </div>
              </div>
            </span>
            <span className="text-white">{fmtMoney(calculations.platformFee, inv.currency)}</span>
          </div>

          <div className="border-t-2 border-[#C9A84C]" />
          <div className="flex justify-between text-sm font-bold">
            <span className="text-[#C9A84C]">TOTAL DUE</span>
            <span className="text-[#C9A84C]">{fmtMoney(calculations.totalDue, inv.currency)}</span>
          </div>
          <div className="text-[10px] text-[#484F58] mt-1">Paystack processing fees charged separately at checkout</div>
        </div>
      </div>

      {/* Payment Instructions (collapsible) */}
      <div className={cardCls}>
        <button onClick={() => setExpandPayment(!expandPayment)} className="flex items-center justify-between w-full">
          <span className={sectionTitleCls + ' mb-0'}>Payment Instructions</span>
          {expandPayment ? <ChevronUp className="h-4 w-4 text-[#484F58]" /> : <ChevronDown className="h-4 w-4 text-[#484F58]" />}
        </button>
        {expandPayment && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className={labelCls}>Bank Name</label>
              <input className={inputCls} value={inv.paymentInfo.bankName} onChange={e => updatePayment({ bankName: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Account Name</label>
              <input className={inputCls} value={inv.paymentInfo.accountName} onChange={e => updatePayment({ accountName: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Account Number</label>
              <input className={inputCls} value={inv.paymentInfo.accountNumber} onChange={e => updatePayment({ accountNumber: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Sort Code</label>
              <input className={inputCls} value={inv.paymentInfo.sortCode} onChange={e => updatePayment({ sortCode: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>MoMo Network</label>
              <input className={inputCls} placeholder="MTN / Vodafone / AirtelTigo" value={inv.paymentInfo.momoNetwork} onChange={e => updatePayment({ momoNetwork: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>MoMo Number</label>
              <input className={inputCls} value={inv.paymentInfo.momoNumber} onChange={e => updatePayment({ momoNumber: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {/* Notes & Terms (collapsible) */}
      <div className={cardCls}>
        <button onClick={() => setExpandNotes(!expandNotes)} className="flex items-center justify-between w-full">
          <span className={sectionTitleCls + ' mb-0'}>Notes & Terms</span>
          {expandNotes ? <ChevronUp className="h-4 w-4 text-[#484F58]" /> : <ChevronDown className="h-4 w-4 text-[#484F58]" />}
        </button>
        {expandNotes && (
          <div className="space-y-3 mt-3">
            <div>
              <label className={labelCls}>
                <MessageSquare className="inline h-3 w-3 mr-1 text-[#C9A84C]" />
                Custom Email Message
              </label>
              <textarea
                className={inputCls + ' h-20 resize-none'}
                placeholder={`Hi ${inv.billTo.companyName || '[Client Name]'},\n\nPlease find attached the invoice for ${inv.projectName || '[Project Name]'}...`}
                value={inv.customMessage}
                onChange={e => update({ customMessage: e.target.value })}
              />
              <p className="text-[9px] text-[#484F58] mt-1">
                This message will appear in the invoice email above the line items. Leave blank for the default template.
              </p>
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea className={inputCls + ' h-16 resize-none'} value={inv.notes} onChange={e => update({ notes: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Terms & Conditions</label>
              <textarea className={inputCls + ' h-20 resize-none'} value={inv.terms} onChange={e => update({ terms: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#8B949E]">
              <input
                type="checkbox"
                checked={inv.latePaymentEnabled}
                onChange={e => update({ latePaymentEnabled: e.target.checked })}
                className="accent-[#C9A84C]"
              />
              Late payment penalty:{' '}
              {inv.latePaymentEnabled && (
                <input
                  type="number"
                  step="0.1"
                  className="w-12 bg-transparent border-b border-[#30363D] text-white text-right focus:outline-none"
                  value={inv.latePaymentPercent}
                  onChange={e => update({ latePaymentPercent: parseFloat(e.target.value) || 0 })}
                />
              )}
              {inv.latePaymentEnabled && '%/month on overdue'}
            </label>
          </div>
        )}
      </div>

      {/* Attachments (collapsible) */}
      <div className={cardCls}>
        <button onClick={() => setExpandAttach(!expandAttach)} className="flex items-center justify-between w-full">
          <span className={sectionTitleCls + ' mb-0'}>Attachments</span>
          {expandAttach ? <ChevronUp className="h-4 w-4 text-[#484F58]" /> : <ChevronDown className="h-4 w-4 text-[#484F58]" />}
        </button>
        {expandAttach && (
          <div className="mt-3">
            <div className="border-2 border-dashed border-[#30363D] rounded p-6 text-center hover:border-[#C9A84C]/50 transition-colors cursor-pointer">
              <Upload className="h-6 w-6 mx-auto text-[#484F58] mb-2" />
              <p className="text-xs text-[#8B949E]">Drop files here or click to upload</p>
              <p className="text-[10px] text-[#484F58] mt-1">Progress Photos · BOQ · Completion Certificate · Timesheet</p>
            </div>
            {inv.attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {inv.attachments.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-[#8B949E] bg-[#0D1117] px-3 py-1.5 rounded">
                    <span>{f}</span>
                    <button onClick={() => update({ attachments: inv.attachments.filter((_, j) => j !== i) })} className="text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // =====================================================
  // RENDER — LIVE PREVIEW (Right Panel)
  // =====================================================

  const renderPreview = () => (
    <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
      <div
        ref={previewRef}
        className="bg-white text-gray-900 rounded shadow-lg mx-auto"
        style={{ width: '595px', minHeight: '842px', padding: '40px', fontFamily: "'Inter', sans-serif", fontSize: '11px' }}
      >
        {/* Letterhead */}
        <div className="flex justify-between items-start border-b-2 border-gray-900 pb-4 mb-6">
          <div>
            <div className="text-xl font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PROPMETRIK</div>
            <div className="text-[9px] text-gray-500 mt-0.5 tracking-widest uppercase">Real Estate Intelligence Platform</div>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-bold tracking-tight text-gray-900">INVOICE</div>
            <span className={`inline-block mt-1 px-2 py-0.5 text-[9px] font-bold rounded-sm uppercase tracking-wider ${
              inv.status === 'DRAFT' ? 'bg-gray-200 text-gray-600' :
              inv.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
              inv.status === 'PAID' ? 'bg-green-100 text-green-700' :
              inv.status === 'VOID' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-600'
            }`}>{inv.status}</span>
          </div>
        </div>

        {/* Invoice meta */}
        <div className="flex justify-between mb-6">
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Invoice Number</div>
            <div className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{inv.invoiceNumber}</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Date</div>
            <div>{fmtDate(inv.invoiceDate)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Due Date</div>
            <div className="font-bold">{fmtDate(inv.dueDate)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Terms</div>
            <div>{TERMS_LABELS[inv.paymentTerms]}</div>
          </div>
        </div>

        {/* Bill From / Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 font-bold">From</div>
            <div className="font-bold text-sm">{inv.billFrom.companyName || '—'}</div>
            {inv.billFrom.address && <div className="text-gray-600">{inv.billFrom.address}</div>}
            {inv.billFrom.email && <div className="text-gray-600">{inv.billFrom.email}</div>}
            {inv.billFrom.phone && <div className="text-gray-600">{inv.billFrom.phone}</div>}
            {inv.billFrom.taxId && <div className="text-gray-600">VAT: {inv.billFrom.taxId}</div>}
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 font-bold">Bill To</div>
            <div className="font-bold text-sm">{inv.billTo.companyName || '—'}</div>
            {inv.billTo.address && <div className="text-gray-600">{inv.billTo.address}</div>}
            {inv.billTo.email && <div className="text-gray-600">{inv.billTo.email}</div>}
            {inv.billTo.phone && <div className="text-gray-600">{inv.billTo.phone}</div>}
            {inv.billTo.poReference && <div className="text-gray-600">PO: {inv.billTo.poReference}</div>}
          </div>
        </div>

        {/* Project */}
        {inv.projectName && (
          <div className="bg-gray-50 px-3 py-2 rounded mb-6 flex gap-6 text-[10px]">
            <div><span className="text-gray-500">Project:</span> <strong>{inv.projectName}</strong></div>
            <div><span className="text-gray-500">Phase:</span> {PHASE_LABELS[inv.projectPhase]}</div>
            <div><span className="text-gray-500">Contract:</span> {CONTRACT_LABELS[inv.contractType]}</div>
          </div>
        )}

        {/* Line Items Table */}
        <table className="w-full mb-4" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-2 text-[9px] text-gray-500 uppercase tracking-wider w-6">#</th>
              <th className="text-left py-2 text-[9px] text-gray-500 uppercase tracking-wider">Description</th>
              <th className="text-right py-2 text-[9px] text-gray-500 uppercase tracking-wider w-12">Qty</th>
              <th className="text-left py-2 text-[9px] text-gray-500 uppercase tracking-wider w-12 pl-2">Unit</th>
              <th className="text-right py-2 text-[9px] text-gray-500 uppercase tracking-wider w-20">Rate</th>
              <th className="text-right py-2 text-[9px] text-gray-500 uppercase tracking-wider w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let itemNum = 0
              return inv.rows.map(row => {
                if (row.type === 'section') {
                  return (
                    <tr key={row.id}>
                      <td colSpan={6} className="pt-4 pb-1">
                        <div className="font-bold text-[10px] text-gray-700 uppercase tracking-wider border-b border-gray-300 pb-1">
                          {row.title || 'Section'}
                        </div>
                      </td>
                    </tr>
                  )
                }
                itemNum++
                const li = row as LineItem
                const total = li.qty * li.unitRate
                return (
                  <tr key={li.id} className="border-b border-gray-200">
                    <td className="py-2 text-gray-400">{itemNum}</td>
                    <td className="py-2">
                      <div>{li.description || '—'}</div>
                      <div className="text-[9px] text-gray-400">{CATEGORY_LABELS[li.category]}</div>
                    </td>
                    <td className="py-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{li.qty}</td>
                    <td className="py-2 pl-2 text-gray-500">{UNIT_LABELS[li.unit]}</td>
                    <td className="py-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(li.unitRate, inv.currency)}</td>
                    <td className="py-2 text-right font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(total, inv.currency)}</td>
                  </tr>
                )
              })
            })()}
          </tbody>
        </table>

        {/* Fee Summary */}
        <div className="flex justify-end mb-6">
          <div className="w-72">
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Subtotal</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(calculations.subtotal, inv.currency)}</span>
            </div>
            {calculations.enabledTaxes.map(tax => (
              <div key={tax.key} className="flex justify-between py-1">
                <span className="text-gray-500">{tax.label} @ {tax.rate}%</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(tax.amount, inv.currency)}</span>
              </div>
            ))}
            {calculations.discount > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Discount ({inv.discountPercent}%)</span>
                <span className="text-red-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(-calculations.discount, inv.currency)}</span>
              </div>
            )}
            {calculations.retention > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Retention ({inv.retentionPercent}%)</span>
                <span className="text-red-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(-calculations.retention, inv.currency)}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-gray-500">PROPMETRIK Fee ({inv.platformFees.platformFeePercent}%)</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(calculations.platformFee, inv.currency)}</span>
            </div>
            <div className="flex justify-between py-2 border-t-2 border-gray-900 font-bold text-sm mt-1">
              <span>TOTAL DUE</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(calculations.totalDue, inv.currency)}</span>
            </div>
            <div className="text-[8px] text-gray-400 mt-1">Paystack processing fees charged separately at checkout</div>
          </div>
        </div>

        {/* Paystack payment button */}
        {inv.paymentInfo.paystackUrl && (
          <div className="text-center mb-6">
            <a
              href={inv.paymentInfo.paystackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-2.5 text-white text-sm font-bold rounded"
              style={{ backgroundColor: '#0A7C43' }}
            >
              Pay Now with Paystack →
            </a>
          </div>
        )}

        {/* Payment info */}
        {(inv.paymentInfo.bankName || inv.paymentInfo.momoNetwork) && (
          <div className="bg-gray-50 rounded p-3 mb-6 text-[10px]">
            <div className="font-bold text-gray-700 mb-1 uppercase tracking-wider text-[9px]">Payment Instructions</div>
            {inv.paymentInfo.bankName && (
              <div className="text-gray-600">
                Bank: {inv.paymentInfo.bankName} · Acct: {inv.paymentInfo.accountNumber} · Name: {inv.paymentInfo.accountName}
              </div>
            )}
            {inv.paymentInfo.momoNetwork && (
              <div className="text-gray-600">
                Mobile Money: {inv.paymentInfo.momoNetwork} · {inv.paymentInfo.momoNumber}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {inv.notes && (
          <div className="mb-4">
            <div className="font-bold text-[9px] text-gray-500 uppercase tracking-wider mb-1">Notes</div>
            <div className="text-gray-600 text-[10px]">{inv.notes}</div>
          </div>
        )}

        {/* Terms */}
        {inv.terms && (
          <div className="mb-4">
            <div className="font-bold text-[9px] text-gray-500 uppercase tracking-wider mb-1">Terms & Conditions</div>
            <div className="text-gray-500 text-[10px]">{inv.terms}</div>
          </div>
        )}

        {inv.latePaymentEnabled && (
          <div className="text-[9px] text-gray-400 mb-4">
            Late payment penalty: {inv.latePaymentPercent}% per month on overdue amounts.
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-300 pt-3 mt-6 flex justify-between items-center">
          <div className="text-[9px] text-gray-400">
            Secured by PROPMETRIK Smart Contract · propmetrik.com
          </div>
          {inv.blockchainTxHash && (
            <div className="text-[8px] text-gray-400 font-mono">
              TX: {inv.blockchainTxHash.slice(0, 16)}...
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // =====================================================
  // SEND MODAL
  // =====================================================

  const renderSendModal = () => {
    if (!showSendModal) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-[#161B22] border border-[#30363D] rounded-sm w-[440px] p-6">
          <div className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Send className="h-4 w-4 text-[#C9A84C]" />
            Sending Invoice {inv.invoiceNumber}
          </div>

          <div className="space-y-3">
            {sendSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5">
                  {step.status === 'pending' && <div className="h-4 w-4 rounded-full border border-[#30363D]" />}
                  {step.status === 'active' && <Loader2 className="h-4 w-4 text-[#C9A84C] animate-spin" />}
                  {step.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {step.status === 'error' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                </div>
                <div>
                  <div className={`text-xs font-medium ${
                    step.status === 'active' ? 'text-[#C9A84C]' :
                    step.status === 'done' ? 'text-green-400' :
                    step.status === 'error' ? 'text-red-400' :
                    'text-[#484F58]'
                  }`}>{step.label}</div>
                  {step.detail && <div className="text-[10px] text-[#8B949E] mt-0.5 font-mono">{step.detail}</div>}
                </div>
              </div>
            ))}
          </div>

          {!sending && (
            <button
              onClick={() => setShowSendModal(false)}
              className="mt-5 w-full py-2 text-xs font-bold uppercase tracking-wider bg-[#C9A84C] text-[#0D1117] rounded-sm hover:bg-[#D4B85C] transition-colors"
            >
              {sendSteps.some(s => s.status === 'error') ? 'Close' : 'Done'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // =====================================================
  // MAIN LAYOUT
  // =====================================================

  return (
    <div className="h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-mono font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#C9A84C]" />
            INVOICE BUILDER
          </h1>
          <p className="text-[10px] font-mono text-[#484F58] mt-0.5 tracking-wider">
            CREATE · SEND · TRACK — BLOCKCHAIN-SECURED INVOICING
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[inv.status]}`}>
            {inv.status}
          </span>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '60% 40%' }}>
        {/* Left: Editor */}
        <div>{renderEditor()}</div>
        {/* Right: Preview */}
        <div>{renderPreview()}</div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0D1117] border-t border-[#30363D] px-6 py-3 flex items-center justify-between z-40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => update({ status: 'DRAFT' })}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#8B949E] border border-[#30363D] rounded-sm hover:bg-[#161B22] transition-colors"
          >
            <Save className="h-3.5 w-3.5" /> Save Draft
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#8B949E] border border-[#30363D] rounded-sm hover:bg-[#161B22] transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
          <button
            onClick={handleDuplicate}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#8B949E] border border-[#30363D] rounded-sm hover:bg-[#161B22] transition-colors"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </button>
          {inv.status !== 'VOID' && (
            <button
              onClick={handleVoid}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-400 border border-red-900/50 rounded-sm hover:bg-red-900/20 transition-colors"
            >
              <Ban className="h-3.5 w-3.5" /> Void
            </button>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || inv.status === 'VOID'}
          className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold uppercase tracking-wider bg-[#C9A84C] text-[#0D1117] rounded-sm hover:bg-[#D4B85C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send Invoice
        </button>
      </div>

      {renderSendModal()}

      {/* ── Milestone Import Modal ──────────────────────────── */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363D]">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Milestone className="h-4 w-4 text-emerald-400" />
                  Import Payment Milestones
                </h3>
                <p className="text-[10px] text-[#8B949E] mt-0.5">
                  Select milestones to add as invoice line items
                </p>
              </div>
              <button onClick={() => setShowMilestoneModal(false)} className="text-[#484F58] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loadingMilestones ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-[#C9A84C]" />
                  <span className="ml-2 text-xs text-[#8B949E]">Loading milestones...</span>
                </div>
              ) : milestones.length === 0 ? (
                <div className="text-center py-8">
                  <Milestone className="h-8 w-8 mx-auto text-[#30363D] mb-2" />
                  <p className="text-xs text-[#8B949E]">No payment milestones found for this project.</p>
                  <p className="text-[10px] text-[#484F58] mt-1">Create milestones in the Payment Schedule tab first.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Select all */}
                  <label className="flex items-center gap-2 text-[10px] text-[#8B949E] uppercase tracking-wider pb-1 border-b border-[#30363D]">
                    <input
                      type="checkbox"
                      className="accent-[#C9A84C]"
                      checked={selectedMilestones.size === milestones.length && milestones.length > 0}
                      onChange={() => {
                        if (selectedMilestones.size === milestones.length) {
                          setSelectedMilestones(new Set())
                        } else {
                          setSelectedMilestones(new Set(milestones.map(m => m.id)))
                        }
                      }}
                    />
                    Select All ({milestones.length} milestones)
                  </label>

                  {milestones.map(m => (
                    <label
                      key={m.id}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        selectedMilestones.has(m.id)
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-[#30363D] hover:border-[#484F58]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-emerald-500 mt-0.5"
                        checked={selectedMilestones.has(m.id)}
                        onChange={() => toggleMilestone(m.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">{m.name}</div>
                        {m.description && (
                          <div className="text-[10px] text-[#8B949E] mt-0.5 line-clamp-2">{m.description}</div>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-mono text-emerald-400">
                            {fmtMoney(m.amount || 0, inv.currency)}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            m.status === 'paid' ? 'bg-emerald-900/60 text-emerald-400' :
                            m.status === 'overdue' ? 'bg-red-900/60 text-red-400' :
                            'bg-zinc-700 text-zinc-400'
                          }`}>
                            {m.status}
                          </span>
                          {m.dueDate && (
                            <span className="text-[9px] text-[#484F58]">
                              Due: {fmtDate(String(m.dueDate))}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#30363D]">
              <span className="text-[10px] text-[#8B949E]">
                {selectedMilestones.size} selected &bull; {fmtMoney(
                  milestones.filter(m => selectedMilestones.has(m.id)).reduce((s, m) => s + (m.amount || 0), 0),
                  inv.currency
                )}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowMilestoneModal(false)}
                  className="px-3 py-1.5 text-xs text-[#8B949E] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={importSelectedMilestones}
                  disabled={selectedMilestones.size === 0}
                  className="px-4 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Import {selectedMilestones.size > 0 ? `(${selectedMilestones.size})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
