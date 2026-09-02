'use client'

import { useEffect, useState } from 'react'
import { liability, streamCount } from '@/lib/nagare/read'
import { toStrk } from '@/lib/nagare/format'

export function PoolStats() {
  const [stats, setStats] = useState<{ streams: number; locked: bigint } | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([streamCount(), liability()])
      .then(([streams, locked]) => {
        if (live) setStats({ streams, locked })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!stats) return null

  return (
    <p className="muted">
      {stats.streams} {stats.streams === 1 ? 'stream' : 'streams'} opened, holding{' '}
      {toStrk(stats.locked, 2)} STRK on mainnet right now.
    </p>
  )
}
