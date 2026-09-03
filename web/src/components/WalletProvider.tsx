'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { WALLET_API } from '@starknet-io/types-js'
import { connectWallet, discoverWallets, type Connected } from '@/lib/nagare/wallet'
import { readInFlight, writeInFlight, clearInFlight, type InFlight } from '@/lib/nagare/keys'
import { deriveSeed } from '@/lib/nagare/derive'

type Registration = 'unknown' | 'none' | 'unregistered' | 'registered'

type Ctx = {
  conn: Connected | null
  registration: Registration
  shielded: bigint | null
  connect: () => Promise<void>
  unlock: () => Promise<string>
  refresh: () => Promise<void>
  submit: (op: string, streamId: string, actions: WALLET_API.STRK20_ACTION[]) => Promise<string>
  prepare: (actions: WALLET_API.STRK20_ACTION[]) => Promise<string[]>
  pending: InFlight | null
  clearPending: () => void
  busy: boolean
}

const WalletCtx = createContext<Ctx | null>(null)

export function useWallet(): Ctx {
  const c = useContext(WalletCtx)
  if (!c) throw new Error('useWallet must be used inside WalletProvider')
  return c
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [conn, setConn] = useState<Connected | null>(null)
  const [registration, setRegistration] = useState<Registration>('unknown')
  const [shielded, setShielded] = useState<bigint | null>(null)
  const [pending, setPending] = useState<InFlight | null>(null)
  const [busy, setBusy] = useState(false)
  const seed = useRef<string | null>(null)

  const readBalances = useCallback(async (c: Connected) => {
    try {
      const balances = await c.wallet.strk20Balances([])
      setRegistration('registered')
      const strk = balances[0]
      setShielded(strk ? BigInt(strk.balance) : 0n)
    } catch (e) {
      if (/NOT_REGISTERED/.test((e as Error).message ?? '')) {
        setRegistration('unregistered')
        setShielded(null)
      } else {
        throw e
      }
    }
  }, [])

  const connect = useCallback(async () => {
    setBusy(true)
    try {
      const found = await discoverWallets()
      if (found.length === 0) {
        setRegistration('none')
        return
      }
      const c = await connectWallet(found[0])
      setConn(c)
      await readBalances(c)
    } finally {
      setBusy(false)
    }
  }, [readBalances])

  const unlock = useCallback(async () => {
    if (seed.current) return seed.current
    if (!conn) throw new Error('Connect a wallet first.')
    seed.current = await deriveSeed((message) => conn.wallet.signMessage(message as never))
    return seed.current
  }, [conn])

  const refresh = useCallback(async () => {
    if (conn) await readBalances(conn)
  }, [conn, readBalances])

  const prepare = useCallback(
    async (actions: WALLET_API.STRK20_ACTION[]) => {
      if (!conn) throw new Error('connect a wallet first')
      const r = await conn.wallet.strk20PrepareInvoke(actions, true)
      return r.call.calldata as string[]
    },
    [conn],
  )

  const submit = useCallback(
    async (op: string, streamId: string, actions: WALLET_API.STRK20_ACTION[]) => {
      if (!conn) throw new Error('connect a wallet first')
      const held = readInFlight()
      if (held && held.op === op && held.streamId === streamId) {
        const age = Math.round((Date.now() - held.at) / 1000)
        throw new Error(
          `${op} for this schedule went to your wallet ${age}s ago and has not come back. Approve or reject it there, then try again. Nothing new was sent.`,
        )
      }
      writeInFlight({ op, streamId, at: Date.now() })
      setPending(readInFlight())
      try {
        const r = await conn.wallet.strk20InvokeTransaction(actions)
        return r.transaction_hash
      } finally {
        clearInFlight()
        setPending(null)
      }
    },
    [conn],
  )

  const clearPending = useCallback(() => {
    clearInFlight()
    setPending(null)
  }, [])

  const value = useMemo(
    () => ({ conn, registration, shielded, connect, unlock, refresh, submit, prepare, pending, clearPending, busy }),
    [conn, registration, shielded, connect, unlock, refresh, submit, prepare, pending, clearPending, busy],
  )

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>
}
