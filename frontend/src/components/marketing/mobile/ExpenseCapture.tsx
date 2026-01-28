'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useOnlineStatus } from '@/hooks/useServiceWorker'
import { saveExpenseOffline } from '@/lib/offline-sync'
import { BottomNavigation } from './MobileDashboard'
import {
  ArrowLeft,
  Camera,
  Receipt,
  DollarSign,
  MapPin,
  Calendar,
  Save,
  Loader2,
  CheckCircle,
  X,
  WifiOff,
  Building2,
  FileText,
  Tag,
  User,
  Plus,
  Trash2,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface ExpenseFormData {
  projectId: string
  description: string
  amount: number
  currency: string
  expenseType: string
  expenseDate: string
  vendorName: string
  notes: string
  receiptDataUrl?: string
  location?: { latitude: number; longitude: number }
}

interface Project {
  id: string
  name: string
}

// Expense type options
const expenseTypes = [
  { value: 'materials', label: 'Materials', icon: '🧱' },
  { value: 'labor', label: 'Labor', icon: '👷' },
  { value: 'equipment', label: 'Equipment', icon: '🚜' },
  { value: 'transport', label: 'Transport', icon: '🚛' },
  { value: 'utilities', label: 'Utilities', icon: '⚡' },
  { value: 'permits', label: 'Permits', icon: '📄' },
  { value: 'professional', label: 'Professional', icon: '💼' },
  { value: 'other', label: 'Other', icon: '📦' },
]

// Currency options
const currencies = [
  { value: 'GHS', label: 'GH₵', name: 'Ghana Cedi' },
  { value: 'USD', label: '$', name: 'US Dollar' },
  { value: 'EUR', label: '€', name: 'Euro' },
  { value: 'GBP', label: '£', name: 'British Pound' },
]

// =====================================================
// EXPENSE CAPTURE COMPONENT
// =====================================================

export function ExpenseCapture() {
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [projects, setProjects] = useState<Project[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [showExpenseTypes, setShowExpenseTypes] = useState(false)

  const [formData, setFormData] = useState<ExpenseFormData>({
    projectId: '',
    description: '',
    amount: 0,
    currency: 'GHS',
    expenseType: 'materials',
    expenseDate: new Date().toISOString().split('T')[0],
    vendorName: '',
    notes: '',
    receiptDataUrl: undefined,
    location: undefined,
  })

  // Fetch projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects?status=active')
        if (response.ok) {
          const data = await response.json()
          setProjects(data.projects || [])
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err)
      }
    }
    fetchProjects()
  }, [])

  // Get current location
  const getLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported')
      return
    }

    setGettingLocation(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      setFormData(prev => ({
        ...prev,
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      }))
    } catch (err) {
      console.warn('Failed to get location:', err)
    } finally {
      setGettingLocation(false)
    }
  }, [])

  // Open camera for receipt capture
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      setCameraStream(stream)
      setShowCamera(true)
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (err) {
      console.error('Failed to access camera:', err)
      setError('Failed to access camera')
    }
  }

  // Close camera
  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }
    setShowCamera(false)
  }

  // Capture receipt photo
  const captureReceipt = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      setFormData(prev => ({ ...prev, receiptDataUrl: dataUrl }))
    }

    closeCamera()
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      setFormData(prev => ({ ...prev, receiptDataUrl: dataUrl }))
    }
    reader.readAsDataURL(file)
  }

  // Remove receipt
  const removeReceipt = () => {
    setFormData(prev => ({ ...prev, receiptDataUrl: undefined }))
  }

  // Handle form input
  const handleInput = (field: keyof ExpenseFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  // Format currency display
  const formatCurrency = (amount: number, currency: string): string => {
    const curr = currencies.find(c => c.value === currency)
    return `${curr?.label || ''}${amount.toLocaleString()}`
  }

  // Submit form
  const handleSubmit = async () => {
    // Validation
    if (!formData.projectId) {
      setError('Please select a project')
      return
    }
    if (!formData.description.trim()) {
      setError('Please enter a description')
      return
    }
    if (formData.amount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (isOnline) {
        // Online: Submit directly
        const response = await fetch('/api/budget/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          throw new Error('Failed to save expense')
        }
      } else {
        // Offline: Save to IndexedDB
        await saveExpenseOffline({
          projectId: formData.projectId,
          offlineId: `offline-${Date.now()}`,
          data: {
            description: formData.description,
            amount: formData.amount,
            currency: formData.currency,
            expenseType: formData.expenseType,
            expenseDate: formData.expenseDate,
            vendorName: formData.vendorName,
            notes: formData.notes,
            receiptDataUrl: formData.receiptDataUrl,
            location: formData.location,
          },
        })
      }

      setSaved(true)
      setTimeout(() => {
        router.push('/mobile')
      }, 1500)
    } catch (err) {
      console.error('Failed to save expense:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Quick amount buttons
  const quickAmounts = [100, 500, 1000, 5000]

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => router.back()} className="p-2 -ml-2 mr-2">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Log Expense</h1>
          </div>
          {!isOnline && (
            <div className="flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs">
              <WifiOff className="h-3 w-3 mr-1" />
              Offline
            </div>
          )}
        </div>
      </header>

      {/* Success overlay */}
      {saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-8 mx-4 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Expense Saved!</h2>
            <p className="text-gray-500">
              {isOnline ? 'Expense has been recorded.' : 'Will sync when online.'}
            </p>
          </div>
        </div>
      )}

      {/* Camera overlay */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 absolute top-0 left-0 right-0 z-10">
            <button onClick={closeCamera} className="p-2 bg-black/50 rounded-full">
              <X className="h-6 w-6 text-white" />
            </button>
            <span className="text-white text-sm bg-black/50 px-3 py-1 rounded-full">
              Capture Receipt
            </span>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="flex-1 object-cover"
          />
          <div className="p-6 flex justify-center bg-black">
            <button
              onClick={captureReceipt}
              className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 active:scale-95 flex items-center justify-center"
            >
              <Camera className="h-8 w-8 text-gray-700" />
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Form */}
      <main className="p-4 space-y-5">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Receipt Capture - Featured at top */}
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Receipt
          </label>
          {formData.receiptDataUrl ? (
            <div className="relative">
              <img
                src={formData.receiptDataUrl}
                alt="Receipt"
                className="w-full h-48 object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={removeReceipt}
                className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
              >
                <Trash2 className="h-4 w-4 text-white" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={openCamera}
                className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-amber-500 hover:text-amber-500 transition-colors"
              >
                <Camera className="h-8 w-8 mb-1" />
                <span className="text-sm">Take Photo</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-amber-500 hover:text-amber-500 transition-colors"
              >
                <Receipt className="h-8 w-8 mb-1" />
                <span className="text-sm">Upload File</span>
              </button>
            </div>
          )}
        </div>

        {/* Amount Input - Large and prominent */}
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount *
          </label>
          <div className="flex items-center">
            <select
              value={formData.currency}
              onChange={(e) => handleInput('currency', e.target.value)}
              className="px-3 py-4 border border-gray-300 rounded-l-lg bg-gray-50 text-gray-900 font-medium"
            >
              {currencies.map((curr) => (
                <option key={curr.value} value={curr.value}>
                  {curr.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => handleInput('amount', Number(e.target.value) || 0)}
              placeholder="0.00"
              className="flex-1 px-4 py-4 border-y border-r border-gray-300 rounded-r-lg text-2xl font-bold text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          {/* Quick amount buttons */}
          <div className="flex gap-2 mt-3">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => handleInput('amount', formData.amount + amount)}
                className="flex-1 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              >
                +{amount}
              </button>
            ))}
          </div>
        </div>

        {/* Project Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            <Building2 className="h-4 w-4 inline-block mr-1" />
            Project *
          </label>
          <select
            value={formData.projectId}
            onChange={(e) => handleInput('projectId', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {/* Expense Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Tag className="h-4 w-4 inline-block mr-1" />
            Expense Type
          </label>
          <div className="grid grid-cols-4 gap-2">
            {expenseTypes.map((type) => {
              const isSelected = formData.expenseType === type.value
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleInput('expenseType', type.value)}
                  className={`flex flex-col items-center px-2 py-3 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="text-xl">{type.icon}</span>
                  <span className={`text-[10px] mt-1 ${isSelected ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                    {type.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            <FileText className="h-4 w-4 inline-block mr-1" />
            Description *
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => handleInput('description', e.target.value)}
            placeholder="What was this expense for?"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        {/* Date and Vendor */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Calendar className="h-4 w-4 inline-block mr-1" />
              Date
            </label>
            <input
              type="date"
              value={formData.expenseDate}
              onChange={(e) => handleInput('expenseDate', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <User className="h-4 w-4 inline-block mr-1" />
              Vendor
            </label>
            <input
              type="text"
              value={formData.vendorName}
              onChange={(e) => handleInput('vendorName', e.target.value)}
              placeholder="Vendor name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => handleInput('notes', e.target.value)}
            rows={2}
            placeholder="Additional notes..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Location */}
        <div>
          <button
            type="button"
            onClick={getLocation}
            disabled={gettingLocation}
            className="flex items-center px-4 py-3 bg-gray-100 rounded-lg text-gray-700 w-full"
          >
            {gettingLocation ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <MapPin className="h-5 w-5 mr-2" />
            )}
            {formData.location ? (
              <span className="text-sm">
                📍 Location captured
              </span>
            ) : (
              <span className="text-sm">Add location (optional)</span>
            )}
          </button>
        </div>

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full py-4 bg-amber-500 text-white font-semibold rounded-lg flex items-center justify-center disabled:opacity-50 active:bg-amber-600 transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-5 w-5 mr-2" />
              Save Expense {formData.amount > 0 && `(${formatCurrency(formData.amount, formData.currency)})`}
            </>
          )}
        </button>
      </main>

      <BottomNavigation />
    </div>
  )
}

export default ExpenseCapture
