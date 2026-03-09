'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
}

/**
 * Reusable pagination controls matching the dark terminal design system.
 *
 * Usage:
 *   <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} />
 */
export function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800">
      <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border border-zinc-800 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3 w-3" />
          Prev
        </button>
        <span className="px-2 text-[10px] font-mono text-zinc-600">
          {page}/{totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border border-zinc-800 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
