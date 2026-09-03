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
  | { kind: 'settling'; hash?: string }
  | { kind: 'confirmed'; hash?: string; stale?: boolean }
  | { kind: 'failed'; message: string; retryable: boolean; detail?: string }

export type Build = () => Promise<{
  actions: WALLET_API.STRK20_ACTION[]
  streamId: string
  settled?: () => Promise<boolean>
}>

const SETTLE_EVERY = 5000
const SETTLE_TRIES = 36

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
        'The wallet changed the note it would pay into, so nothing was sent. Try again.',
      retryable: true,
    }
  }
  return { message: raw, retryable: RETRYABLE.some((r) => r.test(raw)) }
}

export function useAction(op: OpName, onDone?: () => void) {
  const { submit, requireWallet, clearPending } = useWallet()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const run = useCallback(
    async (build: Build) => {
      setPhase({ kind: 'preparing' })
      let built: Awaited<ReturnType<Build>> | null = null
      try {
        const wallet = await requireWallet()
        if (wallet.registration === 'unregistered') {
          throw new Error('Turn on private balances in Ready first, then try again.')
        }
        if (wallet.shielded !== null && wallet.shielded < POOL_FEE) {
          throw new Error(
            `The pool charges ${toStrk(POOL_FEE)} STRK per transaction and you have ${toStrk(wallet.shielded)} shielded. Shield more in Ready.`,
          )
        }
        built = await build()
        setPhase({ kind: 'proving' })
        const sent = built
        const onChain = sent.settled
        let seen = false
        const hash = await new Promise<string | undefined>((resolve, reject) => {
          let settledAlready = false
          const finish = (v: string | undefined) => {
            if (settledAlready) return
            settledAlready = true
            resolve(v)
          }
          submit(op, sent.streamId, sent.actions).then(finish, (e) => {
            if (!settledAlready) {
              settledAlready = true
              reject(e)
            }
          })
          if (!onChain) return
          void (async () => {
            for (let i = 0; i < SETTLE_TRIES && !settledAlready; i += 1) {
              await wait(SETTLE_EVERY)
              if (settledAlready) return
              try {
                if (await onChain()) {
                  seen = true
                  clearPending()
                  finish(undefined)
                  return
                }
              } catch {}
            }
          })()
        })
        if (onChain && !seen) {
          setPhase({ kind: 'settling', hash })
          for (let i = 0; i < SETTLE_TRIES && !seen; i += 1) {
            try {
              if (await onChain()) seen = true
            } catch {}
            if (!seen) await wait(SETTLE_EVERY)
          }
        }
        setPhase({ kind: 'confirmed', hash, stale: !!onChain && !seen })
        onDone?.()
      } catch (e) {
        const raw = (e as Error).message ?? String(e)
        console.error('[nagare]', op, 'failed', { raw, error: e, actions: built?.actions })
        setPhase({ kind: 'failed', ...humanize(raw), detail: raw })
      }
    },
    [op, submit, onDone, requireWallet, clearPending],
  )

  const reset = useCallback(() => setPhase({ kind: 'idle' }), [])

  return { phase, run, reset }
}

export function ActionStatus({ phase, op, reset }: { phase: Phase; op: OpName; reset: () => void }) {
  if (phase.kind === 'idle') return null

  if (phase.kind === 'confirmed') {
    return (
      <div className="card card-outlined stack-tight" role="status">
        <h3>{phase.stale ? `${op} sent` : `${op} confirmed`}</h3>
        <p className="muted">
          {phase.stale
            ? 'Your wallet accepted it, but the contract has not shown the change yet. Reload in a moment to see where it landed.'
            : revealFor(op)}
        </p>
        {phase.hash ? (
          <p>
            <a href={`${VOYAGER}/tx/${phase.hash}`} target="_blank" rel="noreferrer">
              View on Voyager
            </a>
          </p>
        ) : (
          <p className="muted">
            The contract already shows the change. Your wallet had not handed back a
            transaction hash yet, so there is no link to it here.
          </p>
        )}
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
        <p className="muted">No transaction reached the chain, and your balances are unchanged.</p>
        {phase.detail && phase.detail !== phase.message ? (
          <p className="muted">The wallet said: {phase.detail}</p>
        ) : null}
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
        ? 'Signing with your schedule key'
        : phase.kind === 'settling'
          ? 'Your wallet sent it. Waiting for the contract to show the change.'
          : 'Your wallet is building the privacy proof. This takes about 30 seconds.'

  return (
    <div className="card card-outlined stack-tight" role="status" aria-live="polite">
      <h3>{op} in progress</h3>
      <p className="muted">{step}</p>
    </div>
  )
}
