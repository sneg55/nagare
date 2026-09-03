'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useWallet } from '@/components/WalletProvider'
import { useAction, ActionStatus } from '@/components/ActionRunner'
import { createActions } from '@/lib/nagare/actions'
import { generateKeypair, saveKey } from '@/lib/nagare/keys'
import { keyForSchedule } from '@/lib/nagare/derive'
import { streamCount } from '@/lib/nagare/read'
import { parseStrk, toStrk } from '@/lib/nagare/format'
import { POOL_FEE } from '@/lib/nagare/config'
import { watch } from '@/lib/nagare/watch'
import { claimLink } from '@/lib/nagare/claim'
import { VestingChart } from '@/components/VestingChart'

export default function CreatePage() {
  const { shielded, conn, unlock } = useWallet()
  const router = useRouter()
  const [amount, setAmount] = useState('100')
  const [cliffDays, setCliffDays] = useState('90')
  const [endDays, setEndDays] = useState('365')
  const [recipientKey, setRecipientKey] = useState('')
  const [mode, setMode] = useState<'link' | 'key'>('link')
  const [link, setLink] = useState<string | null>(null)
  const { phase, run, reset } = useAction('Create')

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
      const nextId = (await streamCount()) + 1
      const seed = await unlock()
      const sender = keyForSchedule(seed, 'sender', nextId)
      saveKey(`stream:${nextId}:sender`, sender)

      let recipientPk = recipientKey.trim()
      if (mode === 'link') {
        const recipient = generateKeypair()
        saveKey(`stream:${nextId}:recipient`, recipient)
        recipientPk = recipient.publicKey
        setLink(claimLink(nextId, recipient.privateKey))
      } else if (!/^0x[0-9a-fA-F]{1,63}$/.test(recipientPk)) {
        throw new Error('That does not look like a Nagare key. It starts with 0x.')
      }

      watch(nextId)
      return {
        streamId: String(nextId),
        actions: createActions({
          total,
          start: now,
          cliff: now + cliffD * 86400,
          end: now + endD * 86400,
          senderPk: sender.publicKey,
          recipientPk,
        }),
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
            the schedule you set. You can cancel anything that has not vested.
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
            {mode === 'link'
              ? 'Your sender key comes from your wallet, so you can rebuild it there. The recipient\u2019s key is made in this browser and rides in the link, and whoever holds that link holds the schedule until they re-key.'
              : 'Your sender key comes from your wallet, so you can rebuild it there. The recipient already holds their own key.'}{' '}
            Funding asks for one signature to derive the key, then the transaction itself.
          </p>

          <div>
            <button className="btn btn-primary" onClick={submit} disabled={busy || !conn}>
              {conn ? 'Fund this schedule' : 'Connect a wallet to fund'}
            </button>
          </div>
        </div>

        <ActionStatus phase={phase} op="Create" reset={reset} />

        {link ? (
          <div className="card card-outlined stack-tight">
            <h3>Claim link for the recipient</h3>
            <p className="muted">
              Copy this now. It is not stored anywhere and this page will not show it
              again.
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
