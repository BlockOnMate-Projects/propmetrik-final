'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of no
 * changes. Use this to gate expensive work (network requests, filtering) behind
 * a pause in typing.
 *
 * The canonical fix for the per-keystroke server-refetch storms flagged in the
 * audit: bind the fetch/query dependency to the DEBOUNCED value, not the raw
 * input value, so typing "accra" fires one request instead of five.
 *
 *   const [q, setQ] = useState('')
 *   const debouncedQ = useDebouncedValue(q, 300)
 *   useEffect(() => { fetchList(debouncedQ) }, [debouncedQ])  // 1 request, not N
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}

export default useDebouncedValue
