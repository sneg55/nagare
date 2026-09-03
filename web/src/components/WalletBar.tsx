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

  const summary = () => {
    if (!conn) return 'Browsing read-only. Connect a wallet to open or move a schedule.'
    if (warning) return warning
    if (shielded === null) return shortHex(conn.address)
    return `${shortHex(conn.address)} · ${toStrk(shielded)} STRK shielded`
  }

  return (
    <div className={warning ? 'walletbar walletbar-warning' : 'walletbar'}>
      <div className="wrap split align-center walletbar-inner">
        <span className="muted">{summary()}</span>
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
