'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 font-mono">
      <div className="bg-red-500/10 p-4 rounded-full mb-4 border border-red-500/20">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-sm text-zinc-200 uppercase tracking-wider mb-2">Something went wrong</h2>
      <p className="text-[10px] text-zinc-500 max-w-md text-center mb-1">
        An error occurred loading CRM data. Please try again.
      </p>
      {error.digest && (
        <p className="text-[9px] text-zinc-700 mb-4">Error ID: {error.digest}</p>
      )}
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={reset}
          className="px-4 py-1.5 text-[10px] uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors"
        >
          Retry
        </button>
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded hover:bg-zinc-800 transition-colors"
        >
          Dashboard
        </button>
      </div>
    </div>
  )
}
