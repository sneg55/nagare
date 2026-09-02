'use client'

import { useCallback, useState } from 'react'
import { num } from 'starknet'
import type { WALLET_API } from '@starknet-io/types-js'
import { NAGARE, POOL, STRK, VOYAGER } from '@/lib/nagare/config'
import { generateKeypair, saveKey, loadKey, exportKeys } from '@/lib/nagare/keys'
import {
  createActions,
  invokeCalldata,
  payoutActions,
  resolveNoteId,
  signPayout,
  OPEN_NOTE_PLACEHOLDER,
  type PayoutParams,
} from '@/lib/nagare/actions'
import { getStream, streamCount, withdrawable, liability } from '@/lib/nagare/read'
import { connectWallet, discoverWallets, type Connected } from '@/lib/nagare/wallet'

type Line = { at: string; text: string; hash?: string }

const ONE_STRK = 10n ** 18n

export default function Harness() {
  const [wallets, setWallets] = useState<{ name: string; raw: unknown }[]>([])
  const [conn, setConn] = useState<Connected | null>(null)
  const [log, setLog] = useState<Line[]>([])
  const [amount, setAmount] = useState('1')
  const [cliffMinutes, setCliffMinutes] = useState('1')
  const [endMinutes, setEndMinutes] = useState('120')
  const [streamId, setStreamId] = useState('1')
  const [busy, setBusy] = useState(false)
  const [registered, setRegistered] = useState<boolean | null>(null)

  const say = useCallback((text: string, hash?: string) => {
    const at = new Date().toISOString().slice(11, 19)
    setLog((l) => [...l, { at, text, hash }])
    void fetch('http://localhost:3031', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ line: `${at} ${text}${hash ? ' ' + hash : ''}` }),
    }).catch(() => {})
  }, [])

  const guard = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true)
      say(`${label}: start`)
      try {
        await fn()
      } catch (e) {
        say(`${label}: FAILED ${(e as Error).message ?? String(e)}`)
      } finally {
        setBusy(false)
      }
    },
    [say],
  )

  const find = () =>
    guard('discover', async () => {
      const found = await discoverWallets()
      setWallets(found.map((w: { name: string }) => ({ name: w.name, raw: w })))
      say(`found ${found.length} wallet(s): ${found.map((w: { name: string }) => w.name).join(', ')}`)
    })

  const connect = (raw: unknown) =>
    guard('connect', async () => {
      const c = await connectWallet(raw)
      setConn(c)
      say(`connected ${c.address}`)
      try {
        const balances = await c.wallet.strk20Balances([])
        setRegistered(true)
        if (balances.length === 0) {
          say('registered, but nothing shielded yet: shield some STRK inside Ready first')
        } else {
          say(`shielded balances: ${JSON.stringify(balances)}`)
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e)
        if (/NOT_REGISTERED/.test(msg)) {
          setRegistered(false)
          say('this wallet is connected but not registered for private balances')
          say('open Ready and enable private balances (STRK20), then press Recheck')
        } else {
          throw e
        }
      }
    })

  const recheck = () =>
    guard('recheck', async () => {
      if (!conn) throw new Error('connect first')
      const balances = await conn.wallet.strk20Balances([])
      setRegistered(true)
      say(`shielded balances: ${JSON.stringify(balances)}`)
    })

  const readState = () =>
    guard('read', async () => {
      say(`stream_count=${await streamCount()} liability=${(await liability()).toString()}`)
      const id = BigInt(streamId)
      const s = await getStream(id)
      if (!s.exists) {
        say(`stream ${id} does not exist`)
        return
      }
      say(
        `stream ${id}: total=${s.total} withdrawn=${s.withdrawn} refunded=${s.refunded} nonce=${s.nonce} canceled=${s.canceled} sellable=${s.sellable}`,
      )
      say(`withdrawable now: ${(await withdrawable(id)).toString()}`)
    })

  const create = () =>
    guard('create', async () => {
      if (!conn) throw new Error('connect first')
      const total = BigInt(Math.round(Number(amount) * 1e6)) * 10n ** 12n
      if (total <= 0n) throw new Error('amount must be greater than zero')
      const now = Math.floor(Date.now() / 1000)
      const start = now
      const cliff = now + Number(cliffMinutes) * 60
      const end = now + Number(endMinutes) * 60
      if (!(start <= cliff && cliff < end)) {
        throw new Error(
          `the schedule must run start <= cliff < end; the cliff is at +${cliffMinutes}m and the end at +${endMinutes}m, so the end must be later than the cliff`,
        )
      }

      const nextId = (await streamCount()) + 1
      const sender = generateKeypair()
      const recipient = generateKeypair()
      saveKey(`stream:${nextId}:sender`, sender)
      saveKey(`stream:${nextId}:recipient`, recipient)
      say(`keys for stream ${nextId} generated and saved; back them up with Export keys`)

      const actions = createActions({
        total,
        start,
        cliff,
        end,
        senderPk: sender.publicKey,
        recipientPk: recipient.publicKey,
      })
      say(`submitting Create: ${total} wei, cliff +${cliffMinutes}m, end +${endMinutes}m`)
      const r = await conn.wallet.strk20InvokeTransaction(actions)
      say(`Create submitted`, r.transaction_hash)
      setStreamId(String(nextId))
    })

  const diagnose = () =>
    guard('diagnose', async () => {
      if (!conn) throw new Error('connect first')
      const id = BigInt(streamId)

      const probes: { name: string; actions: WALLET_API.STRK20_ACTION[] }[] = [
        {
          name: 'A: deposit only, no invoke, no open note',
          actions: [{ type: 'deposit', token: STRK, amount: num.toHex(10n ** 15n) }],
        },
        {
          name: 'B: open note to self, nothing fills it',
          actions: [{ type: 'transfer', token: STRK, amount: 'OPEN', recipient: conn.address }],
        },
        {
          name: 'C: our Withdraw with a zero signature',
          actions: payoutActions({ op: 'Withdraw', streamId: id, recipientAddress: conn.address }),
        },
      ]

      for (const probe of probes) {
        try {
          const r = await conn.wallet.strk20PrepareInvoke(probe.actions, true)
          const cd = (r.call?.calldata as string[] | undefined) ?? []
          say(`${probe.name}: OK, ${cd.length} calldata felts`)
        } catch (e) {
          say(`${probe.name}: ${(e as Error).message ?? String(e)}`)
        }
      }
      say('reading: A tells us whether Ready supports prepare at all')
      say('B tells us whether prepare executes the actions (it should revert if so)')
      say('C is the shape Withdraw needs')
    })

  const runPayout = (op: 'Withdraw' | 'Cancel') =>
    guard(op.toLowerCase(), async () => {
      if (!conn) throw new Error('connect first')
      const id = BigInt(streamId)
      const s = await getStream(id)
      if (!s.exists) throw new Error(`stream ${id} does not exist`)

      const role = op === 'Withdraw' ? 'recipient' : 'sender'
      const key = loadKey(`stream:${id}:${role}`)
      if (!key) throw new Error(`no ${role} key stored for stream ${id}`)

      const now = Math.floor(Date.now() / 1000)
      if (op === 'Withdraw') {
        const due = await withdrawable(id)
        say(`withdrawable: ${due.toString()}`)
        if (due === 0n) throw new Error('nothing vested yet, wait for the cliff')
      } else {
        if (s.canceled) throw new Error('this stream is already canceled')
        if (now >= s.end) {
          throw new Error('this stream is fully vested, there is nothing unvested to refund')
        }
        const vested = now < s.cliff ? 0n : (s.total * BigInt(now - s.start)) / BigInt(s.end - s.start)
        say(`refund would be about ${(s.total - vested).toString()} wei, vested stays with the recipient`)
      }

      const params: PayoutParams = { op, streamId: id, recipientAddress: conn.address }
      const probeOf = (sig?: [string, string]) =>
        invokeCalldata({ op, streamId: id, noteId: OPEN_NOTE_PLACEHOLDER, sig })

      say('dry run 1: asking the wallet to resolve the open note id')
      const prepared = await conn.wallet.strk20PrepareInvoke(payoutActions(params), true)
      const noteId = resolveNoteId(prepared.call.calldata as string[], probeOf())
      say(`resolved note id ${noteId}`)

      const sig = signPayout(key.privateKey, {
        streamId: id,
        op,
        noteId,
        streamNonce: s.nonce,
      })
      say(`signed with the ${role} key over note ${noteId} and nonce ${s.nonce}`)

      const signed: WALLET_API.STRK20_ACTION[] = payoutActions({ ...params, sig })
      say('dry run 2: confirming the note id did not move')
      const recheck = await conn.wallet.strk20PrepareInvoke(signed, true)
      const noteAgain = resolveNoteId(recheck.call.calldata as string[], probeOf(sig))
      if (BigInt(noteAgain) !== BigInt(noteId)) {
        throw new Error(
          `the wallet changed the note it would pay into (${noteId} -> ${noteAgain}), nothing was sent, try again`,
        )
      }

      say(`submitting ${op}`)
      const r = await conn.wallet.strk20InvokeTransaction(signed)
      say(`${op} submitted`, r.transaction_hash)
    })

  const withdraw = () => runPayout('Withdraw')
  const cancel = () => runPayout('Cancel')

  return (
    <main style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 18, marginTop: 0 }}>Nagare mainnet harness</h1>
      <p style={{ color: '#4a4a4c' }}>
        No design here on purpose. This exists to put real Create and Withdraw transactions
        through the STRK20 pool and our contract before the product UI is built.
      </p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 16px' }}>
        <dt>contract</dt>
        <dd style={{ margin: 0 }}>
          <a href={`${VOYAGER}/contract/${NAGARE}`}>{NAGARE}</a>
        </dd>
        <dt>pool</dt>
        <dd style={{ margin: 0 }}>{POOL}</dd>
        <dt>token</dt>
        <dd style={{ margin: 0 }}>{STRK}</dd>
      </dl>

      <section style={{ marginTop: 24 }}>
        <button onClick={find} disabled={busy}>
          Discover wallets
        </button>
        {wallets.map((w) => (
          <button key={w.name} onClick={() => connect(w.raw)} disabled={busy} style={{ marginLeft: 8 }}>
            Connect {w.name}
          </button>
        ))}
        {conn ? (
          <>
            <button onClick={recheck} disabled={busy} style={{ marginLeft: 8 }}>
              Recheck registration
            </button>
            <span style={{ marginLeft: 12 }}>
              {conn.address.slice(0, 10)}…{' '}
              {registered === null ? '' : registered ? '(registered)' : '(not registered)'}
            </span>
          </>
        ) : null}
      </section>

      <section style={{ marginTop: 24, display: 'grid', gap: 8, maxWidth: 480 }}>
        <label>
          STRK{' '}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 80 }} />
        </label>
        <label>
          cliff in minutes{' '}
          <input value={cliffMinutes} onChange={(e) => setCliffMinutes(e.target.value)} style={{ width: 60 }} />
        </label>
        <label>
          end in minutes{' '}
          <input value={endMinutes} onChange={(e) => setEndMinutes(e.target.value)} style={{ width: 60 }} />
        </label>
        <div>
          <button onClick={create} disabled={busy || !conn}>
            Create stream
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24, display: 'grid', gap: 8, maxWidth: 480 }}>
        <label>
          stream id{' '}
          <input value={streamId} onChange={(e) => setStreamId(e.target.value)} style={{ width: 60 }} />
        </label>
        <div>
          <button onClick={readState} disabled={busy}>
            Read stream
          </button>
          <button onClick={withdraw} disabled={busy || !conn} style={{ marginLeft: 8 }}>
            Withdraw
          </button>
          <button onClick={cancel} disabled={busy || !conn} style={{ marginLeft: 8 }}>
            Cancel
          </button>
          <button onClick={diagnose} disabled={busy || !conn} style={{ marginLeft: 8 }}>
            Diagnose prepare
          </button>
          <button
            onClick={() => {
              say(exportKeys())
            }}
            style={{ marginLeft: 8 }}
          >
            Export keys
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Log</h2>
        <pre style={{ background: '#f3f1eb', padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {log.map((l, i) => (
            <div key={i}>
              {l.at} {l.text}
              {l.hash ? (
                <>
                  {' '}
                  <a href={`${VOYAGER}/tx/${l.hash}`} target="_blank" rel="noreferrer">
                    {l.hash}
                  </a>
                </>
              ) : null}
            </div>
          ))}
        </pre>
      </section>
      <p style={{ color: '#4a4a4c' }}>{num.toHex(ONE_STRK)} wei is 1 STRK.</p>
    </main>
  )
}
