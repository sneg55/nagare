'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { WALLET_API } from '@starknet-io/types-js'
import { connectWallet, discoverWallets, type Connected } from '@/lib/nagare/wallet'
import { readInFlight, writeInFlight, clearInFlight, type InFlight } from '@/lib/nagare/keys'
import { deriveSeed } from '@/lib/nagare/derive'
import { keypairFor, roleEntry } from '@/lib/nagare/roles'
import type { Keypair } from '@/lib/nagare/keys'

type Registration = 'unknown' | 'none' | 'unregistered' | 'registered'

export type Wallet = { conn: Connected; registration: Registration; shielded: bigint | null }

type Ctx = {
  conn: Connected | null
  registration: Registration
  shielded: bigint | null
  connect: () => Promise<Connected | null>
  requireWallet: () => Promise<Wallet>
  unlock: () => Promise<string>
  keyFor: (storeId: string) => Promise<Keypair>
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
  const live = useRef<Connected | null>(null)
  const status = useRef<{ registration: Registration; shielded: bigint | null }>({
    registration: 'unknown',
    shielded: null,
  })

  const readBalances = useCallback(async (c: Connected) => {
    try {
      const balances = await c.wallet.strk20Balances([])
      const strk = balances[0]
      const amount = strk ? BigInt(strk.balance) : 0n
      status.current = { registration: 'registered', shielded: amount }
      setRegistration('registered')
      setShielded(amount)
    } catch (e) {
      if (/NOT_REGISTERED/.test((e as Error).message ?? '')) {
        status.current = { registration: 'unregistered', shielded: null }
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
        status.current = { ...status.current, registration: 'none' }
        setRegistration('none')
        return null
      }
      const c = await connectWallet(found[0])
      live.current = c
      setConn(c)
      await readBalances(c)
      return c
    } finally {
      setBusy(false)
    }
  }, [readBalances])

  const requireWallet = useCallback(async (): Promise<Wallet> => {
    const c = live.current ?? (await connect())
    if (!c) {
      throw new Error(
        'No Starknet wallet answered. Nagare needs Ready with private balances turned on.',
      )
    }
    return { conn: c, ...status.current }
  }, [connect])

  const unlock = useCallback(async () => {
    if (seed.current) return seed.current
    const { conn: c } = await requireWallet()
    seed.current = await deriveSeed((message) => c.wallet.signMessage(message as never))
    return seed.current
  }, [requireWallet])

  const keyFor = useCallback(
    async (storeId: string): Promise<Keypair> => {
      const entry = roleEntry(storeId)
      if (!entry) throw new Error('This browser holds no key for that.')
      if (entry.source.kind === 'stored') return keypairFor(storeId, entry, null)
      return keypairFor(storeId, entry, await unlock())
    },
    [unlock],
  )

  const refresh = useCallback(async () => {
    if (live.current) await readBalances(live.current)
  }, [readBalances])

  const prepare = useCallback(
    async (actions: WALLET_API.STRK20_ACTION[]) => {
      const { conn: c } = await requireWallet()
      const r = await c.wallet.strk20PrepareInvoke(actions, true)
      return r.call.calldata as string[]
    },
    [requireWallet],
  )

  const submit = useCallback(
    async (op: string, streamId: string, actions: WALLET_API.STRK20_ACTION[]) => {
      const { conn: c } = await requireWallet()
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
        const r = await c.wallet.strk20InvokeTransaction(actions)
        return r.transaction_hash
      } finally {
        clearInFlight()
        setPending(null)
      }
    },
    [requireWallet],
  )

  const clearPending = useCallback(() => {
    clearInFlight()
    setPending(null)
  }, [])

  const value = useMemo(
    () => ({ conn, registration, shielded, connect, requireWallet, unlock, keyFor, refresh, submit, prepare, pending, clearPending, busy }),
    [conn, registration, shielded, connect, requireWallet, unlock, keyFor, refresh, submit, prepare, pending, clearPending, busy],
  )

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>
}
