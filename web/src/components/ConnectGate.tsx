'use client'

import type { ReactNode } from 'react'
import { useWallet } from './WalletProvider'
import { toStrk } from '@/lib/nagare/format'
import { POOL_FEE } from '@/lib/nagare/config'

export function ConnectGate({
  children,
  requires = 'wallet',
}: {
  children: ReactNode
  requires?: 'wallet' | 'nothing'
}) {
  const { conn, registration, shielded, connect, refresh, busy } = useWallet()

  if (requires === 'nothing') return <>{children}</>

  if (!conn) {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>Connect a wallet to continue</h1>
          <p className="lead">
            Nagare runs entirely through the STRK20 privacy pool, which today means the
            Ready wallet. Your wallet signs the pool transaction; the schedule itself is
            controlled by keys this browser holds.
          </p>
          <div>
            <button className="btn btn-primary" onClick={() => void connect()} disabled={busy}>
              {busy ? 'Waiting for your wallet' : 'Connect wallet'}
            </button>
          </div>
          {registration === 'none' ? (
            <p className="muted">
              No Starknet wallet answered. Install{' '}
              <a href="https://ready.co" target="_blank" rel="noreferrer">
                Ready
              </a>{' '}
              and reload this page.
            </p>
          ) : null}
        </div>
      </section>
    )
  }

  if (registration === 'unregistered') {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>Turn on private balances</h1>
          <p className="lead">
            Your wallet is connected but has not joined the STRK20 pool yet. There is no
            way to do that from here: open Ready, enable private balances, then come back.
          </p>
          <div>
            <button className="btn" onClick={() => void refresh()} disabled={busy}>
              Check again
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (registration === 'registered' && shielded !== null && shielded < POOL_FEE) {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>Shield some STRK first</h1>
          <p className="lead">
            The pool charges {toStrk(POOL_FEE)} STRK for each private transaction, taken
            from your shielded balance. You have {toStrk(shielded)} STRK shielded, which
            will not cover one.
          </p>
          <p className="muted">
            Shield more inside Ready, then check again. Shielding is public: your address
            and the amount you move go on chain. What you do inside the pool afterwards
            does not name you.
          </p>
          <div>
            <button className="btn" onClick={() => void refresh()} disabled={busy}>
              Check again
            </button>
          </div>
        </div>
      </section>
    )
  }

  return <>{children}</>
}
