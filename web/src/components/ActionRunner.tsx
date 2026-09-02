'use client'

import { useCallback, useState } from 'react'
import type { WALLET_API } from '@starknet-io/types-js'
import { useWallet } from './WalletProvider'
import { VOYAGER } from '@/lib/nagare/config'
import { revealFor } from '@/lib/nagare/reveal'
import { POOL_FEE } from '@/lib/nagare/config'
import { toStrk } from '@/lib/nagare/format'
import type { OpName } from '@/lib/nagare/actions'

export type Phase =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'signing' }
  | { kind: 'proving' }
  | { kind: 'confirmed'; hash: string }
  | { kind: 'failed'; message: string; retryable: boolean }

export type Build = () => Promise<{ actions: WALLET_API.STRK20_ACTION[]; streamId: string }>

const RETRYABLE = [
  /USER_REFUSED_OP/,
  /note/i,
  /insufficient/i,
  /nonce/i,
  /timeout/i,
  /network|fetch|rpc/i,
]

function humanize(raw: string): { message: string; retryable: boolean } {
  if (/USER_REFUSED_OP/.test(raw)) {
    return {
      message:
        'Your wallet did not approve this. If it said there were not enough funds for the fee, shield more STRK and try again.',
      retryable: true,
    }
  }
  if (/INVALID_REQUEST_PAYLOAD/.test(raw)) {
    return { message: 'The wallet rejected the shape of this transaction.', retryable: false }
  }
  if (/note the wallet would pay into|note id/i.test(raw)) {
    return {
      message:
        'The wallet changed the note it would pay into. Nothing was sent. Try again.',
      retryable: true,
    }
  }
  return { message: raw, retryable: RETRYABLE.some((r) => r.test(raw)) }
}

export function useAction(op: OpName, onDone?: () => void) {
  const { submit, conn, registration, shielded } = useWallet()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const run = useCallback(
    async (build: Build) => {
      setPhase({ kind: 'preparing' })
      try {
        if (!conn) throw new Error('Connect a wallet to do this.')
        if (registration === 'unregistered') {
          throw new Error('Turn on private balances in Ready first.')
        }
        if (shielded !== null && shielded < POOL_FEE) {
          throw new Error(
            `The pool charges ${toStrk(POOL_FEE)} STRK per transaction and you have ${toStrk(shielded)} shielded. Shield more in Ready.`,
          )
        }
        const { actions, streamId } = await build()
        setPhase({ kind: 'proving' })
        const hash = await submit(op, streamId, actions)
        setPhase({ kind: 'confirmed', hash })
        onDone?.()
      } catch (e) {
        setPhase({ kind: 'failed', ...humanize((e as Error).message ?? String(e)) })
      }
    },
    [op, submit, onDone, conn, registration, shielded],
  )

  const reset = useCallback(() => setPhase({ kind: 'idle' }), [])

  return { phase, run, reset }
}

export function ActionStatus({ phase, op, reset }: { phase: Phase; op: OpName; reset: () => void }) {
  if (phase.kind === 'idle') return null

  if (phase.kind === 'confirmed') {
    return (
      <div className="card card-outlined stack-tight" role="status">
        <h3>{op} confirmed</h3>
        <p className="muted">{revealFor(op)}</p>
        <p>
          <a href={`${VOYAGER}/tx/${phase.hash}`} target="_blank" rel="noreferrer">
            View on Voyager
          </a>
        </p>
        <div>
          <button className="btn btn-quiet" onClick={reset}>
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  if (phase.kind === 'failed') {
    return (
      <div className="card card-outlined stack-tight" role="alert">
        <h3>{op} did not go through</h3>
        <p className="muted">{phase.message}</p>
        <p className="muted">Nothing was sent, and nothing moved.</p>
        <div>
          <button className="btn btn-quiet" onClick={reset}>
            {phase.retryable ? 'Try again' : 'Dismiss'}
          </button>
        </div>
      </div>
    )
  }

  const step =
    phase.kind === 'preparing'
      ? 'Working out where the payment lands'
      : phase.kind === 'signing'
        ? 'Signing with your stream key'
        : 'Your wallet is building the privacy proof. This takes about 30 seconds.'

  return (
    <div className="card card-outlined stack-tight" role="status" aria-live="polite">
      <h3>{op} in progress</h3>
      <p className="muted">{step}</p>
    </div>
  )
}
