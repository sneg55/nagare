'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getStream, getOffer, type Stream, type Offer } from '@/lib/nagare/read'
import { loadKey, publicKeyOf, saveKey, deleteKey } from '@/lib/nagare/keys'
import { claimLink } from '@/lib/nagare/claim'
import { isUncancelable } from '@/lib/nagare/cancelable'
import { openedHere } from '@/lib/nagare/watch'
import { buildPayout } from '@/lib/nagare/flow'
import { keyedActions, signKeyed } from '@/lib/nagare/actions'
import {
  statusOf,
  STATUS_LABEL,
  progress,
  claimableFraction,
  canList,
  withdrawableAt,
  refundIfCanceledNow,
  canCancel,
  canTransfer,
  offerStatusOf,
} from '@/lib/nagare/status'
import { toStrk, when, until, shortHex } from '@/lib/nagare/format'
import { NAGARE_PADDED, VOYAGER } from '@/lib/nagare/config'
import { Meter } from './Meter'
import { useWallet } from './WalletProvider'
import { useAction, ActionStatus } from './ActionRunner'
import { watch } from '@/lib/nagare/watch'
import { SalePanel } from './SalePanel'

export function StreamDetail({ id }: { id: number }) {
  const { requireWallet, prepare } = useWallet()
  const valid = Number.isInteger(id) && id > 0
  const [schedule, setSchedule] = useState<Stream | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [newKey, setNewKey] = useState('')
  const [rekeyPending, setRekeyPending] = useState<{ privateKey: string; publicKey: string } | null>(null)
  const [confirmForget, setConfirmForget] = useState(false)
  const [keyTick, setKeyTick] = useState(0)

  useEffect(() => {
    const held = loadKey(`stream:${id}:rekey-target`)
    if (held) {
      setRekeyPending(held)
      setNewKey(held.publicKey)
    }
  }, [id])

  const load = useCallback(async () => {
    if (!valid) return
    const [s, o] = await Promise.all([getStream(id), getOffer(id)])
    setSchedule(s)
    setOffer(o)
    if (s.exists) watch(id)
  }, [id, valid])

  useEffect(() => {
    void load()
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15000)
    return () => clearInterval(t)
  }, [load])

  const withdraw = useAction('Withdraw', load)
  const cancel = useAction('Cancel', load)
  const transfer = useAction('Transfer', load)
  const list = useAction('List', load)

  if (!valid) {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>That is not a schedule id</h1>
          <p className="lead">
            Stream ids are whole numbers counting up from 1. Check the link you followed,
            or find the schedule in your list.
          </p>
          <div>
            <Link href="/app/schedules" className="btn">
              Back to your schedules
            </Link>
          </div>
        </div>
      </section>
    )
  }

  if (!schedule) {
    return (
      <section className="band">
        <div className="wrap muted">Reading schedule {id} from the contract…</div>
      </section>
    )
  }

  if (!schedule.exists) {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>No schedule {id}</h1>
          <p className="lead">
            The contract has no schedule with that id. Check the number, or ask whoever sent
            it to you.
          </p>
          <Link href="/app/schedules" className="btn">
            Back to your schedules
          </Link>
        </div>
      </section>
    )
  }

  void keyTick
  const senderKey = loadKey(`stream:${id}:sender`)
  const recipientKey = loadKey(`stream:${id}:recipient`)
  const isRecipient =
    !!recipientKey && BigInt(publicKeyOf(recipientKey.privateKey)) === BigInt(schedule.recipientPk)
  const isSender = !!senderKey && BigInt(publicKeyOf(senderKey.privateKey)) === BigInt(schedule.senderPk)
  const movedOn = !!recipientKey && !isRecipient

  const status = statusOf(schedule, now)
  const due = withdrawableAt(schedule, now)
  const offerStatus = offer ? offerStatusOf(offer, now) : 'none'

  const runWithdraw = () =>
    void withdraw.run(async () => {
      if (!recipientKey) throw new Error('You do not hold the recipient key for this schedule.')
      const { conn } = await requireWallet()
      return {
        streamId: String(id),
        actions: await buildPayout('Withdraw', schedule, id, recipientKey.privateKey, conn.address, prepare),
        settled: nonceMoves,
      }
    })

  const runCancel = () =>
    void cancel.run(async () => {
      if (!senderKey) throw new Error('You do not hold the sender key for this schedule.')
      const { conn } = await requireWallet()
      return {
        streamId: String(id),
        actions: await buildPayout('Cancel', schedule, id, senderKey.privateKey, conn.address, prepare),
        settled: nonceMoves,
      }
    })

  const runTransfer = () =>
    void transfer.run(async () => {
      if (!recipientKey) throw new Error('You do not hold the recipient key for this schedule.')
      const { conn } = await requireWallet()
      const target = newKey.trim()
      if (!/^0x[0-9a-fA-F]{1,63}$/.test(target)) throw new Error('That does not look like a Nagare key.')
      if (rekeyPending && BigInt(target) === BigInt(rekeyPending.publicKey)) {
        saveKey(`stream:${id}:recipient`, rekeyPending)
        window.localStorage.removeItem('nagare.keys.v1.pending')
      }
      const sig = signKeyed(recipientKey.privateKey, {
        streamId: id,
        op: 'Transfer',
        arg: target,
        streamNonce: schedule.nonce,
      })
      return {
        streamId: String(id),
        actions: keyedActions('Transfer', id, target, conn.address, sig),
        settled: nonceMoves,
      }
    })

  const nonceMoves = async () => (await getStream(id)).nonce !== schedule.nonce

  const listBusy = list.phase.kind !== 'idle' && list.phase.kind !== 'failed' && list.phase.kind !== 'confirmed'

  const runList = (enable: boolean) =>
    void list.run(async () => {
      if (!recipientKey) throw new Error('You do not hold the recipient key for this schedule.')
      const { conn } = await requireWallet()
      const arg = enable ? 1 : 0
      const sig = signKeyed(recipientKey.privateKey, {
        streamId: id,
        op: 'List',
        arg,
        streamNonce: schedule.nonce,
      })
      return {
        streamId: String(id),
        actions: keyedActions('List', id, arg, conn.address, sig),
        settled: nonceMoves,
      }
    })

  return (
    <section className="band">
      <div className="wrap stack stack-lg">
        <div className="stack-tight">
          <Link href="/app/schedules" className="muted backlink">
            ← Your schedules
          </Link>
          <div className="row-actions align-center">
            <h1>Schedule {id}</h1>
            <span className={status === 'vesting' ? 'badge badge-live' : 'badge'}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        <div className="detail-grid">
          <div className="stack">
            <div className="card card-cream">
              <div className="stack">
                <div className="stack-tight">
                  <span className="muted">Available to withdraw now</span>
                  <p className="amount amount-lg">{toStrk(due)} STRK</p>
                </div>
                <Meter withdrawn={progress(schedule, now)} claimable={claimableFraction(schedule, now)} label="Vesting progress" />
                <dl className="rows">
                  <div className="row">
                    <dt>Total</dt>
                    <dd>{toStrk(schedule.total)} STRK</dd>
                  </div>
                  <div className="row">
                    <dt>Already withdrawn</dt>
                    <dd>{toStrk(schedule.withdrawn)} STRK</dd>
                  </div>
                  {schedule.canceled ? (
                    <div className="row">
                      <dt>Refunded on cancel</dt>
                      <dd>{toStrk(schedule.refunded)} STRK</dd>
                    </div>
                  ) : null}
                  <div className="row">
                    <dt>Cliff</dt>
                    <dd>
                      {when(schedule.cliff)} <span className="muted">({until(schedule.cliff, now)})</span>
                    </dd>
                  </div>
                  <div className="row">
                    <dt>Fully vested</dt>
                    <dd>
                      {when(schedule.end)} <span className="muted">({until(schedule.end, now)})</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <ActionStatus phase={withdraw.phase} op="Withdraw" reset={withdraw.reset} />
            <ActionStatus phase={cancel.phase} op="Cancel" reset={cancel.reset} />
            <ActionStatus phase={transfer.phase} op="Transfer" reset={transfer.reset} />
            <ActionStatus phase={list.phase} op="List" reset={list.reset} />

            {movedOn ? (
              <div className="card card-outlined stack-tight">
                <h3>This schedule moved to another key</h3>
                <p className="muted">
                  The key this browser holds no longer controls it. It is kept here for
                  your records.
                </p>
              </div>
            ) : null}

            {isRecipient ? (
              <div className="card card-outlined stack">
                <h3>You are the recipient</h3>
                {due > 0n ? (
                  <div className="stack-tight">
                    <p className="muted">
                      {toStrk(due)} STRK has vested and is yours to take. It lands in a
                      private note, not in a visible balance.
                    </p>
                    <div>
                      <button className="btn btn-primary" onClick={runWithdraw}>
                        Withdraw {toStrk(due)} STRK
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="muted">
                    {now < schedule.cliff
                      ? `Nothing has vested yet. The cliff is ${until(schedule.cliff, now)}.`
                      : 'You have withdrawn everything available so far.'}
                  </p>
                )}

                {canTransfer(schedule, now, offer!) || canList(schedule, now) ? (
                <div className="stack-tight">
                  <h3>{rekeyPending ? 'Take control with your own key' : 'Hand it to someone else'}</h3>
                  <p className="muted">
                    {rekeyPending
                      ? 'A key derived from your wallet is ready. Moving the schedule onto it means the person who sent you the claim link can no longer act as you, and your wallet can rebuild it on any device.'
                      : 'Re-key this schedule to a new holder. Your key stops working the moment it lands.'}
                  </p>
                  <label className="field">
                    <span className="visually-hidden">
                      {rekeyPending ? 'Your new Nagare key' : 'The new holder\u2019s Nagare key'}
                    </span>
                    <input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="Their Nagare key, 0x…"
                    />
                  </label>
                  <div className="row-actions">
                    <button
                      className={rekeyPending ? 'btn btn-primary' : 'btn'}
                      onClick={runTransfer}
                      disabled={!canTransfer(schedule, now, offer!)}
                    >
                      {rekeyPending ? 'Move it onto my key' : 'Transfer this schedule'}
                    </button>
                  </div>
                  {offerStatus === 'live' ? (
                    <p className="muted">
                      A live offer blocks a transfer. Accept it or wait for it to expire.
                    </p>
                  ) : null}

                  <div className="switch-row">
                    <div className="stack-tight">
                      <strong id={`sellable-${id}`}>Open to offers</strong>
                      <p className="muted">
                        {schedule.sellable
                          ? 'Anyone holding this schedule\u2019s id can escrow a price against it. Nothing moves until you accept.'
                          : 'Let anyone holding this schedule\u2019s id escrow a price against it. Nothing moves until you accept.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      className="switch"
                      aria-checked={schedule.sellable}
                      aria-labelledby={`sellable-${id}`}
                      onClick={() => runList(!schedule.sellable)}
                      disabled={!canList(schedule, now) || listBusy}
                    >
                      <span className="switch-knob" />
                    </button>
                  </div>
                </div>
                ) : null}
              </div>
            ) : null}

            {openedHere(id) && isRecipient && recipientKey ? (
              <div className="card card-outlined stack-tight">
                <h3>You still hold the recipient&rsquo;s key</h3>
                <p className="muted">
                  You made this key when you opened the schedule, so the claim link can be
                  rebuilt here as often as you need. It also means you can act as the
                  recipient until they re-key.
                </p>
                <label className="field">
                  <span className="visually-hidden">Claim link</span>
                  <input
                    readOnly
                    value={claimLink(id, recipientKey.privateKey)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
                <div className="row-actions">
                  <button
                    className="btn"
                    onClick={() =>
                      void navigator.clipboard.writeText(claimLink(id, recipientKey.privateKey))
                    }
                  >
                    Copy link
                  </button>
                  {confirmForget ? (
                    <>
                      <button
                        className="btn"
                        onClick={() => {
                          deleteKey(`stream:${id}:recipient`)
                          setConfirmForget(false)
                          setKeyTick((t) => t + 1)
                        }}
                      >
                        Yes, forget it
                      </button>
                      <button className="btn btn-quiet" onClick={() => setConfirmForget(false)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-quiet" onClick={() => setConfirmForget(true)}>
                      Forget the recipient&rsquo;s key
                    </button>
                  )}
                </div>
                {confirmForget ? (
                  <p className="muted" role="alert">
                    Forgetting is the only way to give up your hold on this schedule before
                    the recipient re-keys. If they never received the link, nobody can reach
                    the vested amount afterwards.
                  </p>
                ) : null}
              </div>
            ) : null}

            {isSender ? (
              <div className="card card-outlined stack-tight">
                <h3>You are the sender</h3>
                {canCancel(schedule, now) ? (
                  <>
                    <p className="muted">
                      Cancelling returns {toStrk(refundIfCanceledNow(schedule, now))} STRK to
                      you privately. The {toStrk(schedule.total - refundIfCanceledNow(schedule, now) - schedule.withdrawn)}{' '}
                      STRK already vested stays claimable by the recipient.
                    </p>
                    <div>
                      <button className="btn" onClick={runCancel}>
                        Cancel this schedule
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="muted">
                    {schedule.canceled
                      ? 'You already cancelled this schedule.'
                      : 'This schedule is fully vested, so there is nothing left to cancel.'}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <aside className="stack">
            <div className="card card-outlined stack-tight">
              <h3>What this schedule shows publicly</h3>
              <dl className="rows">
                <div className="row">
                  <dt>Sender can cancel</dt>
                  <dd>{isUncancelable(schedule) ? 'No' : 'Yes'}</dd>
                </div>
                <div className="row">
                  <dt>Sender key</dt>
                  <dd>{shortHex(schedule.senderPk)}</dd>
                </div>
                <div className="row">
                  <dt>Recipient key</dt>
                  <dd>{shortHex(schedule.recipientPk)}</dd>
                </div>
                <div className="row">
                  <dt>Open to offers</dt>
                  <dd>{schedule.sellable ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
              <p className="muted">
                These are keys, not wallets. No address of either party appears in any
                transaction on this schedule.
              </p>
              {isUncancelable(schedule) ? (
                <p className="muted">
                  The sender key here is a published constant with no private key behind
                  it, so no signature can ever authorize a cancel. Recompute it from the
                  contract and see for yourself.
                </p>
              ) : null}
              <p>
                <a href={`${VOYAGER}/contract/${NAGARE_PADDED}`} target="_blank" rel="noreferrer">
                  Verify on Voyager
                </a>
              </p>
            </div>
            {offer ? (
              <SalePanel
                id={id}
                schedule={schedule}
                offer={offer}
                now={now}
                isRecipient={isRecipient}
                onDone={load}
              />
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  )
}
