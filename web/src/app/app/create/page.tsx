'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useWallet } from '@/components/WalletProvider'
import { useAction, ActionStatus } from '@/components/ActionRunner'
import { createActions } from '@/lib/nagare/actions'
import { generateKeypair, loadKey, saveKey, deleteKey } from '@/lib/nagare/keys'
import { freeSenderSlot, senderSlots } from '@/lib/nagare/derive'
import { findCreated, usedSenderKeys } from '@/lib/nagare/recover'
import { NO_CANCEL_KEY } from '@/lib/nagare/cancelable'
import { streamCount } from '@/lib/nagare/read'
import { parseStrk, toStrk } from '@/lib/nagare/format'
import { POOL_FEE } from '@/lib/nagare/config'
import { markOpened, unmarkOpened, unwatch, watch } from '@/lib/nagare/watch'
import { claimLink } from '@/lib/nagare/claim'
import { VestingChart } from '@/components/VestingChart'

export default function CreatePage() {
  const { shielded, unlock } = useWallet()
  const router = useRouter()
  const [amount, setAmount] = useState('100')
  const [cliffDays, setCliffDays] = useState('90')
  const [endDays, setEndDays] = useState('365')
  const [recipientKey, setRecipientKey] = useState('')
  const [mode, setMode] = useState<'link' | 'key'>('link')
  const [link, setLink] = useState<string | null>(null)
  const [cancelable, setCancelable] = useState(true)
  const opened = useRef<{
    guessedId: number
    countBefore: number
    senderPk: string
    recipientPk: string
    recipientPrivateKey: string | null
  } | null>(null)

  const place = async () => {
    const it = opened.current
    if (!it) return
    const id =
      (await findCreated(it.countBefore, it.senderPk, it.recipientPk)) ?? it.guessedId
    if (id !== it.guessedId) {
      for (const role of ['sender', 'recipient'] as const) {
        const held = loadKey(`stream:${it.guessedId}:${role}`)
        if (held) {
          saveKey(`stream:${id}:${role}`, held)
          deleteKey(`stream:${it.guessedId}:${role}`)
        }
      }
      unwatch(it.guessedId)
      unmarkOpened(it.guessedId)
      watch(id)
      markOpened(id)
    }
    if (it.recipientPrivateKey) setLink(claimLink(id, it.recipientPrivateKey))
  }

  const { phase, run, reset } = useAction('Create', () => void place())

  const totalCost = (() => {
    try {
      return toStrk(parseStrk(amount || '0') + POOL_FEE)
    } catch {
      return '—'
    }
  })()

  const submit = () => {
    setLink(null)
    void run(async () => {
      const total = parseStrk(amount)
      if (total <= 0n) throw new Error('Enter how much STRK to vest.')
      if (shielded !== null && total + POOL_FEE > shielded) {
        throw new Error(
          `You have ${toStrk(shielded)} STRK shielded. This schedule needs ${toStrk(total)} plus a ${toStrk(POOL_FEE)} STRK pool fee.`,
        )
      }
      const cliffD = Number(cliffDays)
      const endD = Number(endDays)
      if (!(cliffD >= 0 && endD > cliffD)) {
        throw new Error('The schedule has to end after its cliff.')
      }

      const now = Math.floor(Date.now() / 1000)
      const countBefore = await streamCount()
      const guessedId = countBefore + 1

      let senderPk = NO_CANCEL_KEY
      if (cancelable) {
        const seed = await unlock()
        const sender = freeSenderSlot(senderSlots(seed), await usedSenderKeys())
        saveKey(`stream:${guessedId}:sender`, sender)
        senderPk = sender.publicKey
      }

      let recipientPk = recipientKey.trim()
      let recipientPrivateKey: string | null = null
      if (mode === 'link') {
        const recipient = generateKeypair()
        saveKey(`stream:${guessedId}:recipient`, recipient)
        recipientPk = recipient.publicKey
        recipientPrivateKey = recipient.privateKey
      } else if (!/^0x[0-9a-fA-F]{1,63}$/.test(recipientPk)) {
        throw new Error('That does not look like a Nagare key. It starts with 0x.')
      }

      watch(guessedId)
      markOpened(guessedId)
      opened.current = { guessedId, countBefore, senderPk, recipientPk, recipientPrivateKey }
      return {
        streamId: String(guessedId),
        actions: createActions({
          total,
          start: now,
          cliff: now + cliffD * 86400,
          end: now + endD * 86400,
          senderPk,
          recipientPk,
        }),
        settled: async () => (await findCreated(countBefore, senderPk, recipientPk)) !== null,
      }
    })
  }

  const busy = phase.kind !== 'idle' && phase.kind !== 'failed' && phase.kind !== 'confirmed'

  return (
    <section className="band">
      <div className="narrow stack stack-lg">
        <div className="stack-tight">
          <h1>Open a schedule</h1>
          <p className="lead">
            The amount leaves your shielded balance now and unlocks to the recipient on
            the schedule you set.{' '}
            {cancelable
              ? 'You can cancel anything that has not vested.'
              : 'Once it is funded you will not be able to take any of it back.'}
          </p>
        </div>

        <div className="stack">
          <label className="field">
            <span>Amount in STRK</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </label>

          <div className="two-up">
            <label className="field">
              <span>Cliff, in days from now</span>
              <input value={cliffDays} onChange={(e) => setCliffDays(e.target.value)} inputMode="numeric" />
            </label>
            <label className="field">
              <span>Fully vested, in days</span>
              <input value={endDays} onChange={(e) => setEndDays(e.target.value)} inputMode="numeric" />
            </label>
          </div>

          <VestingChart
            total={Number.isFinite(Number(amount)) && Number(amount) >= 0 ? Number(amount) : null}
            cliffDays={Number.isFinite(Number(cliffDays)) ? Number(cliffDays) : 0}
            endDays={Number.isFinite(Number(endDays)) ? Number(endDays) : 1}
            onCliffDays={(d) => setCliffDays(String(d))}
            onEndDays={(d) => setEndDays(String(d))}
          />

          <div className="switch-row">
            <div className="stack-tight">
              <strong id="cancelable">You can cancel this</strong>
              <p className="muted">
                {cancelable
                  ? 'Until it fully vests you can cancel and take back whatever has not vested. Before the cliff that is the whole amount, so the recipient is trusting you not to.'
                  : 'Nobody can cancel it, you included. Nagare records a sender key that has no private key, and the recipient can check that on the contract for themselves.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              className="switch"
              aria-checked={cancelable}
              aria-labelledby="cancelable"
              onClick={() => setCancelable((v) => !v)}
              disabled={busy}
            >
              <span className="switch-knob" />
            </button>
          </div>

          <div className="stack-tight">
            <span className="muted">Who receives it</span>
            <div className="row-actions" role="group" aria-label="Who receives it">
              <button
                className={mode === 'link' ? 'btn btn-selected' : 'btn'}
                onClick={() => setMode('link')}
                aria-pressed={mode === 'link'}
              >
                Send them a claim link
              </button>
              <button
                className={mode === 'key' ? 'btn btn-selected' : 'btn'}
                onClick={() => setMode('key')}
                aria-pressed={mode === 'key'}
              >
                They gave me a key
              </button>
            </div>
            {mode === 'key' ? (
              <label className="field">
                <span>Their Nagare key</span>
                <input
                  value={recipientKey}
                  onChange={(e) => setRecipientKey(e.target.value)}
                  placeholder="0x…"
                />
              </label>
            ) : (
              <p className="muted">
                We will make the recipient&rsquo;s key here and give you a link that carries
                it. Send that link over a channel you trust: anyone holding it controls
                the schedule until the recipient re-keys.
              </p>
            )}
          </div>

          <dl className="rows">
            <div className="row">
              <dt>Vested to the recipient</dt>
              <dd>{amount || '0'} STRK</dd>
            </div>
            <div className="row">
              <dt>Pool fee, charged by STRK20 on every private transaction</dt>
              <dd>{toStrk(POOL_FEE)} STRK</dd>
            </div>
            <div className="row">
              <dt>Leaves your shielded balance</dt>
              <dd>{totalCost} STRK</dd>
            </div>
            {shielded !== null ? (
              <div className="row">
                <dt>You have shielded</dt>
                <dd>{toStrk(shielded)} STRK</dd>
              </div>
            ) : null}
          </dl>

          <p className="muted">
            {cancelable
              ? 'Your sender key comes from your wallet, so you can rebuild it there. Funding asks for one signature to derive it, then the transaction itself.'
              : 'There is no sender key to keep, so funding is the transaction alone.'}{' '}
            {mode === 'link'
              ? 'The recipient\u2019s key is made in this browser and rides in the link, and whoever holds that link holds the schedule until they re-key.'
              : 'The recipient already holds their own key.'}
          </p>

          <div>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              Fund this schedule
            </button>
          </div>
        </div>

        <ActionStatus phase={phase} op="Create" reset={reset} />

        {link ? (
          <div className="card card-outlined stack-tight">
            <h3>Claim link for the recipient</h3>
            <p className="muted">
              Send it over a channel you trust. This browser keeps the recipient&rsquo;s
              key, so the schedule&rsquo;s own page can rebuild this link, and can forget
              the key when you want to give up your hold on it.
            </p>
            <label className="field">
              <span className="visually-hidden">Claim link</span>
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <div className="row-actions">
              <button className="btn" onClick={() => void navigator.clipboard.writeText(link)}>
                Copy link
              </button>
              <button className="btn btn-quiet" onClick={() => router.push('/app/schedules')}>
                Go to your schedules
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
