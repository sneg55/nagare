'use client'

import { useState } from 'react'
import { useWallet } from '@/components/WalletProvider'
import { recoverFromSeed } from '@/lib/nagare/recover'

export function KeyRecovery({ onDone }: { onDone: () => void }) {
  const { unlock } = useWallet()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [scanned, setScanned] = useState<[number, number] | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setNote(null)
    try {
      const seed = await unlock()
      const found = await recoverFromSeed(seed, (done, total) => setScanned([done, total]))
      if (found.length === 0) {
        setNote(
          'No schedule on the contract matches a key from this wallet. A schedule you were handed by a claim link is not in the wallet until you re-key it: open it in the browser that took the link, or ask the sender to send it again.',
        )
      } else {
        const ids = [...new Set(found.map((f) => f.id))].sort((a, b) => a - b)
        setNote(
          `Recovered ${ids.length} ${ids.length === 1 ? 'schedule' : 'schedules'}: ${ids.join(', ')}. Their keys are in this browser again.`,
        )
        onDone()
      }
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setRunning(false)
      setScanned(null)
    }
  }

  if (!open) {
    return (
      <div>
        <button className="btn btn-quiet" onClick={() => setOpen(true)}>
          Recover keys from your wallet
        </button>
      </div>
    )
  }

  return (
    <div className="card card-cream stack-tight">
      <h3>Recover from your wallet</h3>
      <p className="muted">
        Keys Nagare makes are derived from your wallet, so this browser is not the only
        place they exist. One signature rebuilds them. It moves no funds and Nagare then
        checks every schedule on the contract for a match.
      </p>
      <div className="row-actions">
        <button className="btn" onClick={() => void run()} disabled={running}>
          {running ? 'Looking for your schedules…' : 'Find my schedules'}
        </button>
        <button className="btn btn-quiet" onClick={() => setOpen(false)} disabled={running}>
          Close
        </button>
      </div>
      {scanned ? (
        <p className="muted" role="status">
          Read {scanned[0]} of {scanned[1]} schedules.
        </p>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </div>
  )
}
