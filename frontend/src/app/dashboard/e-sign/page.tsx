'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'

/**
 * E-Sign Dashboard Page
 * Embeds the E-Sign UI (port 3001) with PropMetrik JWT authentication
 */
export default function ESignPage() {
  const { token, user, loading } = useAuth()
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // E-Sign UI URL with token
  const esignBaseUrl = process.env.NEXT_PUBLIC_ESIGN_UI_URL || 'http://localhost:3001'
  // Pass token in URL if available
  const esignUrl = token ? `${esignBaseUrl}?token=${encodeURIComponent(token)}` : esignBaseUrl

  useEffect(() => {
    // Listen for messages from E-Sign iframe
    const handleMessage = (event: MessageEvent) => {
      // Handle messages from E-Sign UI
      if (event.data?.type === 'REQUEST_AUTH_TOKEN' && token) {
        // Send token to iframe
        const iframe = document.getElementById('esign-iframe') as HTMLIFrameElement
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'AUTH_TOKEN', token }, '*')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [token])

  // Show loading only during initial auth check
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading authentication...</p>
        </div>
      </div>
    )
  }

  // If not logged in, show message
  if (!user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <p className="text-muted-foreground">Please log in to access E-Sign</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-120px)] w-full relative">
      {!iframeLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading E-Sign...</p>
          </div>
        </div>
      )}
      <iframe
        id="esign-iframe"
        src={esignUrl}
        className="w-full h-full border-0"
        onLoad={() => setIframeLoaded(true)}
        allow="clipboard-write"
      />
    </div>
  )
}
