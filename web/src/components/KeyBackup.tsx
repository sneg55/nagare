'use client'

import { useState } from 'react'
import { exportKeys, importKeys, allKeys } from '@/lib/nagare/keys'

export function KeyBackup() {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const count = Object.keys(allKeys()).length

  const download = () => {
    const blob = new Blob([exportKeys()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nagare-keys-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setNote('Saved. Keep that file somewhere only you can read.')
  }

  const restore = () => {
    try {
      importKeys(importing)
      setNote(`Restored. This browser now holds ${Object.keys(allKeys()).length} keys.`)
      setImporting('')
    } catch {
      setNote('That is not a Nagare backup file. Paste the whole contents, braces included.')
    }
  }

  if (!open) {
    return (
      <button className="btn btn-quiet" onClick={() => setOpen(true)}>
        Back up your keys
      </button>
    )
  }

  return (
    <div className="card stack-tight" style={{ background: 'var(--cream)' }}>
      <h3>Your keys</h3>
      <p className="muted">
        {count === 0
          ? 'This browser holds no stream keys yet.'
          : `This browser holds ${count} ${count === 1 ? 'key' : 'keys'}. They exist nowhere else. Clearing your site data without a copy of this file makes every stream they control unreachable, by you or by anyone.`}
      </p>
      <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={download} disabled={count === 0}>
          Save a backup file
        </button>
        <button className="btn btn-quiet" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <h3 style={{ marginTop: 'var(--s2)' }}>Restore from a backup</h3>
      <p className="muted">
        Paste a backup file to add its keys to this browser. Keys already here are kept.
      </p>
      <textarea
        value={importing}
        onChange={(e) => setImporting(e.target.value)}
        rows={3}
        placeholder='{"stream:1:recipient":…}'
        style={{
          font: 'inherit',
          padding: 12,
          border: '1px solid var(--fog)',
          borderRadius: 'var(--r-ui)',
          resize: 'vertical',
        }}
      />
      <div>
        <button className="btn" onClick={restore} disabled={!importing.trim()}>
          Restore these keys
        </button>
      </div>
      {note ? <p role="status">{note}</p> : null}
    </div>
  )
}
