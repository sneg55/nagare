'use client'

import { useWallet } from './WalletProvider'
import { toStrk, shortHex } from '@/lib/nagare/format'
import { POOL_FEE } from '@/lib/nagare/config'

export function WalletBar() {
  const { conn, registration, shielded, connect, refresh, busy } = useWallet()

  const line = () => {
    if (!conn) return null
    if (registration === 'unregistered') {
      return 'Private balances are off in your wallet. Turn them on in Ready to move anything.'
    }
    if (shielded !== null && shielded < POOL_FEE) {
      return `${toStrk(shielded)} STRK shielded, below the ${toStrk(POOL_FEE)} STRK the pool charges per transaction. Shield more in Ready.`
    }
    return null
  }

  const warning = line()

  return (
    <div
      style={{
        borderBottom: '1px solid var(--fog)',
        background: warning ? 'var(--cream)' : 'transparent',
      }}
    >
      <div
        className="wrap"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s3)',
          padding: '12px var(--s5)',
          flexWrap: 'wrap',
        }}
      >
        <span className="muted">
          {conn
            ? warning ?? `${shortHex(conn.address)} · ${shielded !== null ? toStrk(shielded) : '—'} STRK shielded`
            : 'Browsing read-only. Connect a wallet to open or move a stream.'}
        </span>
        <button
          className="btn btn-quiet"
          onClick={() => void (conn ? refresh() : connect())}
          disabled={busy}
        >
          {busy ? 'Waiting for your wallet' : conn ? 'Refresh balance' : 'Connect wallet'}
        </button>
      </div>
    </div>
  )
}
