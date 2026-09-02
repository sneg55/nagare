'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getStream, getOffer, type Stream, type Offer } from '@/lib/nagare/read'
import { loadKey, publicKeyOf, saveKey, generateKeypair } from '@/lib/nagare/keys'
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
  const { conn, prepare } = useWallet()
  const valid = Number.isInteger(id) && id > 0
  const [stream, setStream] = useState<Stream | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [newKey, setNewKey] = useState('')
  const [rekeyPending, setRekeyPending] = useState<{ privateKey: string; publicKey: string } | null>(null)

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
    setStream(s)
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
          <h1>That is not a stream id</h1>
          <p className="lead">
            Stream ids are whole numbers counting up from 1. Check the link you followed,
            or find the stream in your list.
          </p>
          <div>
            <Link href="/app/streams" className="btn">
              Back to your streams
            </Link>
          </div>
        </div>
      </section>
    )
  }

  if (!stream) {
    return (
      <section className="band">
        <div className="wrap muted">Reading stream {id} from the contract…</div>
      </section>
    )
  }

  if (!stream.exists) {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>No stream {id}</h1>
          <p className="lead">
            The contract has no stream with that id. Check the number, or ask whoever sent
            it to you.
          </p>
          <Link href="/app/streams" className="btn">
            Back to your streams
          </Link>
        </div>
      </section>
    )
  }

  const senderKey = loadKey(`stream:${id}:sender`)
  const recipientKey = loadKey(`stream:${id}:recipient`)
  const isRecipient =
    !!recipientKey && BigInt(publicKeyOf(recipientKey.privateKey)) === BigInt(stream.recipientPk)
  const isSender = !!senderKey && BigInt(publicKeyOf(senderKey.privateKey)) === BigInt(stream.senderPk)
  const movedOn = !!recipientKey && !isRecipient

  const status = statusOf(stream, now)
  const due = withdrawableAt(stream, now)
  const offerStatus = offer ? offerStatusOf(offer, now) : 'none'

  const runWithdraw = () =>
    void withdraw.run(async () => {
      if (!conn || !recipientKey) throw new Error('You do not hold the recipient key for this stream.')
      return {
        streamId: String(id),
        actions: await buildPayout('Withdraw', stream, id, recipientKey.privateKey, conn.address, prepare),
      }
    })

  const runCancel = () =>
    void cancel.run(async () => {
      if (!conn || !senderKey) throw new Error('You do not hold the sender key for this stream.')
      return {
        streamId: String(id),
        actions: await buildPayout('Cancel', stream, id, senderKey.privateKey, conn.address, prepare),
      }
    })

  const runTransfer = () =>
    void transfer.run(async () => {
      if (!recipientKey) throw new Error('You do not hold the recipient key for this stream.')
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
        streamNonce: stream.nonce,
      })
      return { streamId: String(id), actions: keyedActions('Transfer', id, target, sig) }
    })

  const runList = (enable: boolean) =>
    void list.run(async () => {
      if (!recipientKey) throw new Error('You do not hold the recipient key for this stream.')
      const arg = enable ? 1 : 0
      const sig = signKeyed(recipientKey.privateKey, {
        streamId: id,
        op: 'List',
        arg,
        streamNonce: stream.nonce,
      })
      return { streamId: String(id), actions: keyedActions('List', id, arg, sig) }
    })

  return (
    <section className="band">
      <div className="wrap stack" style={{ gap: 'var(--s5)' }}>
        <div className="stack-tight">
          <Link href="/app/streams" className="muted" style={{ textDecoration: 'none' }}>
            ← Your streams
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexWrap: 'wrap' }}>
            <h1>Stream {id}</h1>
            <span className={status === 'vesting' ? 'badge badge-live' : 'badge'}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        <div className="detail-grid">
          <div className="stack">
            <div className="card" style={{ background: 'var(--cream)' }}>
              <div className="stack">
                <div className="stack-tight">
                  <span className="muted">Available to withdraw now</span>
                  <p className="amount amount-lg">{toStrk(due)} STRK</p>
                </div>
                <Meter withdrawn={progress(stream, now)} claimable={claimableFraction(stream, now)} label="Vesting progress" />
                <dl className="rows">
                  <div className="row">
                    <dt>Total</dt>
                    <dd>{toStrk(stream.total)} STRK</dd>
                  </div>
                  <div className="row">
                    <dt>Already withdrawn</dt>
                    <dd>{toStrk(stream.withdrawn)} STRK</dd>
                  </div>
                  {stream.canceled ? (
                    <div className="row">
                      <dt>Refunded on cancel</dt>
                      <dd>{toStrk(stream.refunded)} STRK</dd>
                    </div>
                  ) : null}
                  <div className="row">
                    <dt>Cliff</dt>
                    <dd>
                      {when(stream.cliff)} <span className="muted">({until(stream.cliff, now)})</span>
                    </dd>
                  </div>
                  <div className="row">
                    <dt>Fully vested</dt>
                    <dd>
                      {when(stream.end)} <span className="muted">({until(stream.end, now)})</span>
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
                <h3>This stream moved to another key</h3>
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
                    {now < stream.cliff
                      ? `Nothing has vested yet. The cliff is ${until(stream.cliff, now)}.`
                      : 'You have withdrawn everything available so far.'}
                  </p>
                )}

                {canTransfer(stream, now, offer!) || canList(stream, now) ? (
                <div className="stack-tight">
                  <h3>{rekeyPending ? 'Take control with your own key' : 'Hand it to someone else'}</h3>
                  <p className="muted">
                    {rekeyPending
                      ? 'A fresh key is ready in this browser. Moving the stream onto it means the person who sent you the claim link can no longer act as you.'
                      : 'Re-key this stream to a new holder. Your key stops working the moment it lands.'}
                  </p>
                  <input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Their Nagare key, 0x…"
                    style={{ font: 'inherit', padding: 12, border: '1px solid var(--fog)', borderRadius: 'var(--r-ui)' }}
                  />
                  <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
                    <button
                      className={rekeyPending ? 'btn btn-primary' : 'btn'}
                      onClick={runTransfer}
                      disabled={!canTransfer(stream, now, offer!)}
                    >
                      {rekeyPending ? 'Move it onto my key' : 'Transfer this stream'}
                    </button>
                    <button
                      className="btn btn-quiet"
                      onClick={() => runList(!stream.sellable)}
                      disabled={!canList(stream, now)}
                    >
                      {stream.sellable ? 'Take it off the market' : 'Open it to offers'}
                    </button>
                  </div>
                  {offerStatus === 'live' ? (
                    <p className="muted">
                      A live offer blocks a transfer. Accept it or wait for it to expire.
                    </p>
                  ) : null}
                </div>
                ) : null}
              </div>
            ) : null}

            {isSender ? (
              <div className="card card-outlined stack-tight">
                <h3>You are the sender</h3>
                {canCancel(stream, now) ? (
                  <>
                    <p className="muted">
                      Cancelling returns {toStrk(refundIfCanceledNow(stream, now))} STRK to
                      you privately. The {toStrk(stream.total - refundIfCanceledNow(stream, now) - stream.withdrawn)}{' '}
                      STRK already vested stays claimable by the recipient.
                    </p>
                    <div>
                      <button className="btn" onClick={runCancel}>
                        Cancel this stream
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="muted">
                    {stream.canceled
                      ? 'You already cancelled this stream.'
                      : 'This stream is fully vested, so there is nothing left to cancel.'}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <aside className="stack">
            <div className="card card-outlined stack-tight">
              <h3>What this stream shows publicly</h3>
              <dl className="rows">
                <div className="row">
                  <dt>Sender key</dt>
                  <dd>{shortHex(stream.senderPk)}</dd>
                </div>
                <div className="row">
                  <dt>Recipient key</dt>
                  <dd>{shortHex(stream.recipientPk)}</dd>
                </div>
                <div className="row">
                  <dt>Open to offers</dt>
                  <dd>{stream.sellable ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
              <p className="muted">
                These are keys, not wallets. No address of either party appears in any
                transaction on this stream.
              </p>
              <p>
                <a href={`${VOYAGER}/contract/${NAGARE_PADDED}`} target="_blank" rel="noreferrer">
                  Verify on Voyager
                </a>
              </p>
            </div>
            {offer ? (
              <SalePanel
                id={id}
                stream={stream}
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
