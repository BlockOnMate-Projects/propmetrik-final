'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useOnlineStatus } from '@/hooks/useServiceWorker'
import { saveDailyLogOffline, CachedDailyLog } from '@/lib/offline-sync'
import { BottomNavigation } from './MobileDashboard'
import { authedFetch } from '@/lib/authed-fetch'
import {
  ArrowLeft,
  Camera,
  Mic,
  MicOff,
  MapPin,
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  Wind,
  Thermometer,
  Users,
  Save,
  Loader2,
  CheckCircle,
  X,
  Image as ImageIcon,
  Plus,
  Trash2,
  WifiOff,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface DailyLogFormData {
  projectId: string
  logDate: string
  weather: string
  temperature?: number
  workersOnSite: number
  workDescription: string
  materialsUsed?: string
  issues?: string
  safetyObservations?: string
  photos: PhotoCapture[]
  voiceNoteUrl?: string
  location?: { latitude: number; longitude: number }
}

interface PhotoCapture {
  id: string
  dataUrl: string
  caption?: string
  timestamp: number
}

interface Project {
  id: string
  name: string
}

// Weather options
const weatherOptions = [
  { value: 'sunny', label: 'Sunny', icon: Sun },
  { value: 'cloudy', label: 'Cloudy', icon: Cloud },
  { value: 'rainy', label: 'Rainy', icon: CloudRain },
  { value: 'windy', label: 'Windy', icon: Wind },
  { value: 'stormy', label: 'Stormy', icon: CloudSnow },
]

// =====================================================
// DAILY LOG CAPTURE COMPONENT
// =====================================================

export function DailyLogCapture() {
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  const [projects, setProjects] = useState<Project[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioChunks, setAudioChunks] = useState<Blob[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)

  const [formData, setFormData] = useState<DailyLogFormData>({
    projectId: '',
    logDate: new Date().toISOString().split('T')[0],
    weather: 'sunny',
    temperature: undefined,
    workersOnSite: 0,
    workDescription: '',
    materialsUsed: '',
    issues: '',
    safetyObservations: '',
    photos: [],
    voiceNoteUrl: undefined,
    location: undefined,
  })

  // Fetch projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await authedFetch('/api/projects?status=active')
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

  // Auto-detect location on mount
  useEffect(() => {
    getLocation()
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

  // Open camera
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

  // Capture photo
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      
      const photo: PhotoCapture = {
        id: `photo-${Date.now()}`,
        dataUrl,
        timestamp: Date.now(),
      }

      setFormData(prev => ({
        ...prev,
        photos: [...prev.photos, photo],
      }))
    }

    closeCamera()
  }

  // Remove photo
  const removePhoto = (photoId: string) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter(p => p.id !== photoId),
    }))
  }

  // Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      
      const chunks: Blob[] = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setFormData(prev => ({ ...prev, voiceNoteUrl: url }))
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Failed to access microphone')
    }
  }

  // Stop voice recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  // Handle form input
  const handleInput = (field: keyof DailyLogFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  // Submit form
  const handleSubmit = async () => {
    // Validation
    if (!formData.projectId) {
      setError('Please select a project')
      return
    }
    if (!formData.workDescription.trim()) {
      setError('Please describe the work done today')
      return
    }
    if (formData.workersOnSite < 0) {
      setError('Workers on site cannot be negative')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (isOnline) {
        // Online: Submit directly
        const response = await authedFetch('/api/projects/daily-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            photos: formData.photos.map(p => p.dataUrl),
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to save daily log')
        }
      } else {
        // Offline: Save to IndexedDB
        await saveDailyLogOffline({
          projectId: formData.projectId,
          offlineId: `offline-${Date.now()}`,
          data: {
            logDate: formData.logDate,
            weather: formData.weather,
            temperature: formData.temperature,
            workersOnSite: formData.workersOnSite,
            workDescription: formData.workDescription,
            materialsUsed: formData.materialsUsed,
            issues: formData.issues,
            safetyObservations: formData.safetyObservations,
            photos: formData.photos.map(p => p.dataUrl),
            voiceNoteUrl: formData.voiceNoteUrl,
            location: formData.location,
          },
        })
      }

      setSaved(true)
      setTimeout(() => {
        router.push('/mobile')
      }, 1500)
    } catch (err) {
      console.error('Failed to save daily log:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => router.back()} className="p-2 -ml-2 mr-2">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Daily Log</h1>
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
            <h2 className="text-xl font-bold text-gray-900 mb-2">Log Saved!</h2>
            <p className="text-gray-500">
              {isOnline ? 'Daily log has been submitted.' : 'Will sync when online.'}
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
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="flex-1 object-cover"
          />
          <div className="p-6 flex justify-center bg-black">
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 active:scale-95"
            />
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Form */}
      <main className="p-4 space-y-6">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Project Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
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

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Date *
          </label>
          <input
            type="date"
            value={formData.logDate}
            onChange={(e) => handleInput('logDate', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        {/* Weather Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Weather
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {weatherOptions.map((option) => {
              const Icon = option.icon
              const isSelected = formData.weather === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleInput('weather', option.value)}
                  className={`flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <Icon className={`h-6 w-6 ${isSelected ? 'text-amber-600' : 'text-gray-400'}`} />
                  <span className={`text-xs mt-1 ${isSelected ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Temperature & Workers */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Thermometer className="h-4 w-4 inline-block mr-1" />
              Temp (°C)
            </label>
            <input
              type="number"
              value={formData.temperature || ''}
              onChange={(e) => handleInput('temperature', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="28"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Users className="h-4 w-4 inline-block mr-1" />
              Workers
            </label>
            <input
              type="number"
              value={formData.workersOnSite}
              onChange={(e) => handleInput('workersOnSite', Number(e.target.value) || 0)}
              min="0"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Work Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Work Description *
          </label>
          <textarea
            value={formData.workDescription}
            onChange={(e) => handleInput('workDescription', e.target.value)}
            rows={4}
            placeholder="Describe the work completed today..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Materials Used */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Materials Used
          </label>
          <textarea
            value={formData.materialsUsed}
            onChange={(e) => handleInput('materialsUsed', e.target.value)}
            rows={2}
            placeholder="List materials used today..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Issues & Safety */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Issues / Delays
            </label>
            <textarea
              value={formData.issues}
              onChange={(e) => handleInput('issues', e.target.value)}
              rows={2}
              placeholder="Any issues or delays..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Safety Observations
            </label>
            <textarea
              value={formData.safetyObservations}
              onChange={(e) => handleInput('safetyObservations', e.target.value)}
              rows={2}
              placeholder="Safety notes..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Photo Capture */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Photos
          </label>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {/* Add photo button */}
            <button
              type="button"
              onClick={openCamera}
              className="flex-shrink-0 w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-amber-500 hover:text-amber-500 transition-colors"
            >
              <Camera className="h-6 w-6" />
              <span className="text-xs mt-1">Add Photo</span>
            </button>

            {/* Photo previews */}
            {formData.photos.map((photo) => (
              <div key={photo.id} className="relative flex-shrink-0">
                <img
                  src={photo.dataUrl}
                  alt="Captured"
                  className="w-24 h-24 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Voice Note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Voice Note
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex items-center px-4 py-3 rounded-lg font-medium ${
                isRecording
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {isRecording ? (
                <>
                  <MicOff className="h-5 w-5 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 mr-2" />
                  Record Note
                </>
              )}
            </button>
            {formData.voiceNoteUrl && (
              <audio
                src={formData.voiceNoteUrl}
                controls
                className="flex-1 h-10"
              />
            )}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Location
          </label>
          <button
            type="button"
            onClick={getLocation}
            disabled={gettingLocation}
            className="flex items-center px-4 py-3 bg-gray-100 rounded-lg text-gray-700"
          >
            {gettingLocation ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <MapPin className="h-5 w-5 mr-2" />
            )}
            {formData.location ? (
              <span className="text-sm">
                {formData.location.latitude.toFixed(6)}, {formData.location.longitude.toFixed(6)}
              </span>
            ) : (
              <span className="text-sm">Get current location</span>
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
              Save Daily Log
            </>
          )}
        </button>
      </main>

      <BottomNavigation />
    </div>
  )
}

export default DailyLogCapture
