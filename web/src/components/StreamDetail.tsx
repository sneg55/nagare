'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getStream, getOffer, type Stream, type Offer } from '@/lib/nagare/read'
import { loadKey } from '@/lib/nagare/keys'
import {
  forgetRole,
  hasHiddenRole,
  moveRole,
  promoteOfferKey,
  publicKeyFor,
  roleEntry,
} from '@/lib/nagare/roles'
import { keyForRecipient, sameKey } from '@/lib/nagare/derive'
import { claimLink } from '@/lib/nagare/claim'
import { isUncancelable } from '@/lib/nagare/cancelable'
import { openedHere, unwatch, watched } from '@/lib/nagare/watch'
import { recoverFromSeed } from '@/lib/nagare/recover'
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
import { SalePanel } from './SalePanel'
import { Modal } from './Modal'
import { Gear } from './Gear'

export function StreamDetail({ id }: { id: number }) {
  const { requireWallet, prepare, keyFor, unlock } = useWallet()
  const valid = Number.isInteger(id) && id > 0
  const [schedule, setSchedule] = useState<Stream | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [newKey, setNewKey] = useState('')
  const [rekeyPending, setRekeyPending] = useState<string | null>(null)
  const [confirmForget, setConfirmForget] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmTransfer, setConfirmTransfer] = useState(false)
  const [myKey, setMyKey] = useState<string | null>(null)
  const [myKeyNote, setMyKeyNote] = useState<string | null>(null)
  const [showingKey, setShowingKey] = useState(false)
  const [dropped, setDropped] = useState(false)
  const [hunting, setHunting] = useState(false)
  const [huntNote, setHuntNote] = useState<string | null>(null)

  const findMyKey = async () => {
    setHunting(true)
    setHuntNote(null)
    try {
      const { conn } = await requireWallet()
      const found = await recoverFromSeed(await unlock())
      if (found.some((f) => f.id === id)) {
        setKeyTick((t) => t + 1)
        await load()
      } else {
        setHuntNote(
          `Nothing on this schedule matches a key from ${shortHex(conn.address)}. If you opened it with another wallet, connect that one.`,
        )
      }
    } catch (e) {
      setHuntNote((e as Error).message)
    } finally {
      setHunting(false)
    }
  }

  const showMyKey = async () => {
    setShowingKey(true)
    setMyKeyNote(null)
    try {
      setMyKey(keyForRecipient(await unlock(), id).publicKey)
    } catch (e) {
      setMyKeyNote((e as Error).message)
    } finally {
      setShowingKey(false)
    }
  }
  const [keyTick, setKeyTick] = useState(0)

  useEffect(() => {
    const waiting = publicKeyFor(`stream:${id}:rekey-target`)
    if (waiting) {
      setRekeyPending(waiting)
      setNewKey(waiting)
    }
  }, [id])

  const load = useCallback(async () => {
    if (!valid) return
    const [s, o] = await Promise.all([getStream(id), getOffer(id)])
    if (s.exists) promoteOfferKey(id, s.recipientPk)
    setSchedule(s)
    setOffer(o)
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
            Schedule ids are whole numbers counting up from 1. Check the link you followed,
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
  const heldSenderPk = publicKeyFor(`stream:${id}:sender`)
  const heldRecipientPk = publicKeyFor(`stream:${id}:recipient`)
  const isRecipient = !!heldRecipientPk && sameKey(heldRecipientPk, schedule.recipientPk)
  const isSender = !!heldSenderPk && sameKey(heldSenderPk, schedule.senderPk)
  const movedOn = !!heldRecipientPk && !isRecipient
  const hiddenRole =
    hasHiddenRole(`stream:${id}:sender`) || hasHiddenRole(`stream:${id}:recipient`)
  const linkKey =
    isRecipient && roleEntry(`stream:${id}:recipient`)?.source.kind === 'stored'
      ? loadKey(`stream:${id}:recipient`)
      : undefined

  const status = statusOf(schedule, now)
  const due = withdrawableAt(schedule, now)
  const offerStatus = offer ? offerStatusOf(offer, now) : 'none'

  const runWithdraw = () =>
    void withdraw.run(async () => {
      if (!isRecipient) throw new Error('You do not hold the recipient key for this schedule.')
      const recipientKey = await keyFor(`stream:${id}:recipient`)
      const { conn } = await requireWallet()
      return {
        streamId: String(id),
        actions: await buildPayout('Withdraw', schedule, id, recipientKey.privateKey, conn.address, prepare),
        settled: nonceMoves,
      }
    })

  const runCancel = () =>
    void cancel.run(async () => {
      if (!isSender) throw new Error('You do not hold the sender key for this schedule.')
      const senderKey = await keyFor(`stream:${id}:sender`)
      const { conn } = await requireWallet()
      return {
        streamId: String(id),
        actions: await buildPayout('Cancel', schedule, id, senderKey.privateKey, conn.address, prepare),
        settled: nonceMoves,
      }
    })

  const runTransfer = () =>
    void transfer.run(async () => {
      if (!isRecipient) throw new Error('You do not hold the recipient key for this schedule.')
      const recipientKey = await keyFor(`stream:${id}:recipient`)
      const { conn } = await requireWallet()
      const target = newKey.trim()
      if (!/^0x[0-9a-fA-F]{1,63}$/.test(target)) throw new Error('That does not look like a Nagare key.')
      if (rekeyPending && BigInt(target) === BigInt(rekeyPending)) {
        moveRole(`stream:${id}:rekey-target`, `stream:${id}:recipient`)
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

  const runList = (enable: boolean) =>
    void list.run(async () => {
      if (!isRecipient) throw new Error('You do not hold the recipient key for this schedule.')
      const recipientKey = await keyFor(`stream:${id}:recipient`)
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
                  <div className="split align-center">
                    <span className="muted">
                      {isRecipient ? 'Available to withdraw now' : 'Vested and not yet withdrawn'}
                    </span>
                    {isRecipient || isSender ? (
                      <button
                        className="icon-btn"
                        aria-label={`Settings for schedule ${id}`}
                        onClick={() => setSettingsOpen(true)}
                      >
                        <Gear />
                      </button>
                    ) : null}
                  </div>
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

            {movedOn ? (
              <div className="card card-outlined stack-tight">
                <h3>This schedule moved to another key</h3>
                <p className="muted">
                  The key this browser holds no longer controls it. It is kept here for
                  your records.
                </p>
              </div>
            ) : null}

            {!isSender && !isRecipient && !movedOn ? (
              openedHere(id) && isUncancelable(schedule) ? (
                <div className="card card-outlined stack-tight">
                  <h3>You opened this schedule</h3>
                  <p className="muted">
                    You opened it with no sender key, so nobody can cancel it, you
                    included. Everything from here is the recipient&rsquo;s to do.
                  </p>
                </div>
              ) : (
                <div className="card card-outlined stack-tight">
                  <h3>
                    {hiddenRole
                      ? 'Connect your wallet to use your key'
                      : 'You hold no key for this schedule'}
                  </h3>
                  <p className="muted">
                    {hiddenRole
                      ? 'This browser recorded a key of yours for this schedule, derived from a wallet that is not connected right now. Connect that wallet and your role comes back.'
                      : 'Everything on this page is public, so you can read all of it. Withdrawing, cancelling, re-keying or listing needs the sender\u2019s key or the recipient\u2019s, and this browser holds neither of them.'}
                  </p>
                  {hiddenRole ? null : (
                    <p className="muted">
                      If it should be yours, check your wallet for it below, or open the
                      claim link that carries the recipient&rsquo;s key.
                    </p>
                  )}
                  <div className="row-actions">
                    {hiddenRole ? null : (
                      <button
                        className="btn btn-primary"
                        onClick={() => void findMyKey()}
                        disabled={hunting}
                      >
                        {hunting ? 'Checking the contract\u2026' : 'Look for my key in my wallet'}
                      </button>
                    )}
                    {hiddenRole ? null : (
                      <button className="btn" onClick={() => void showMyKey()} disabled={showingKey}>
                        {showingKey ? 'Deriving\u2026' : 'Show my Nagare key for this schedule'}
                      </button>
                    )}
                    <Link href="/app/schedules" className="btn btn-quiet">
                      Go to your schedules
                    </Link>
                    {!hiddenRole && !dropped && watched().includes(id) ? (
                      <button
                        className="btn btn-quiet"
                        onClick={() => {
                          unwatch(id)
                          setDropped(true)
                        }}
                      >
                        Remove from my schedules
                      </button>
                    ) : null}
                  </div>
                  {dropped ? (
                    <p className="muted" role="status">
                      Removed from your list, which changed nothing on the contract.
                    </p>
                  ) : null}
                  {myKey ? (
                    <div className="stack-tight">
                      <label className="field">
                        <span>Your Nagare key for schedule {id}</span>
                        <input readOnly value={myKey} onFocus={(e) => e.currentTarget.select()} />
                      </label>
                      <div>
                        <button
                          className="btn"
                          onClick={() => void navigator.clipboard.writeText(myKey)}
                        >
                          Copy key
                        </button>
                      </div>
                      <p className="muted">
                        Send this to whoever holds the schedule. It is a public key and
                        gives away nothing on its own. Once they transfer to it, Recover on
                        your schedules page picks the schedule up.
                      </p>
                    </div>
                  ) : null}
                  {huntNote ? (
                    <p className="muted" role="status">
                      {huntNote}
                    </p>
                  ) : null}
                  {myKeyNote ? (
                    <p className="muted" role="status">
                      {myKeyNote}
                    </p>
                  ) : null}
                </div>
              )
            ) : null}

            {isRecipient ? (
              <div className="card card-outlined stack">
                <h3>You are the recipient</h3>
                {due > 0n ? (
                  <div className="stack-tight">
                    <p className="muted">
                      {toStrk(due)} STRK has vested and is yours to take. It arrives as a
                      private note in the pool, so your visible balance will not move.
                    </p>
                    <div>
                      <button
                        className="btn btn-primary"
                        onClick={runWithdraw}
                        disabled={withdraw.busy}
                      >
                        {withdraw.busy ? 'Withdrawing\u2026' : `Withdraw ${toStrk(due)} STRK`}
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

              </div>
            ) : null}

            {openedHere(id) && linkKey ? (
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
                    value={claimLink(id, linkKey.privateKey)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
                <div className="row-actions">
                  <button
                    className="btn"
                    onClick={() =>
                      void navigator.clipboard.writeText(claimLink(id, linkKey.privateKey))
                    }
                  >
                    Copy link
                  </button>
                  {confirmForget ? (
                    <>
                      <button
                        className="btn"
                        onClick={() => {
                          forgetRole(`stream:${id}:recipient`)
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
                <p className="muted">
                  {canCancel(schedule, now)
                    ? 'You can cancel what has not vested. The button for it is in this schedule\u2019s settings.'
                    : schedule.canceled
                      ? 'You already cancelled this schedule.'
                      : 'This schedule is fully vested, so there is nothing left to cancel.'}
                </p>
              </div>
            ) : null}

            <Modal
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              title={`Schedule ${id} settings`}
            >
              <ActionStatus phase={transfer.phase} op="Transfer" reset={transfer.reset} />
              <ActionStatus phase={list.phase} op="List" reset={list.reset} />
              <ActionStatus phase={cancel.phase} op="Cancel" reset={cancel.reset} />

              {isRecipient && (canTransfer(schedule, now, offer!) || canList(schedule, now)) ? (
                <div className="stack-tight">
                  <h3>{rekeyPending ? 'Take control with your own key' : 'Hand it to someone else'}</h3>
                <p className="muted">
                  {rekeyPending
                    ? 'A key derived from your wallet is ready. Moving the schedule onto it means the person who sent you the claim link can no longer act as you, and your wallet can rebuild it on any device.'
                    : 'Re-key this schedule to a new holder. Your key stops working the moment it lands.'}
                </p>
                <label className="field">
                  <span>{rekeyPending ? 'Your new Nagare key' : 'Their Nagare key'}</span>
                  <input
                    value={newKey}
                    onChange={(e) => {
                      setNewKey(e.target.value)
                      setConfirmTransfer(false)
                    }}
                    placeholder="0x…"
                  />
                </label>
                {rekeyPending ? null : (
                  <p className="muted">
                    Nagare keys are not wallet addresses. Send them this page&rsquo;s link
                    and they can produce one from their own wallet in a click.
                  </p>
                )}
                {confirmTransfer ? (
                  <p className="muted" role="alert">
                    Schedule {id} moves to that key and yours stops working the moment it
                    lands. A wallet address cannot sign for anything, so if that is not a
                    Nagare key the schedule becomes unreachable by everyone. Check it
                    against what they sent you.
                  </p>
                ) : null}
                <div className="row-actions">
                  {confirmTransfer ? (
                    <>
                      <button
                        className="btn"
                        disabled={transfer.busy}
                        onClick={() => {
                          setConfirmTransfer(false)
                          runTransfer()
                        }}
                      >
                        Yes, transfer it
                      </button>
                      <button className="btn btn-quiet" onClick={() => setConfirmTransfer(false)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      className={rekeyPending ? 'btn btn-primary' : 'btn'}
                      onClick={() => (rekeyPending ? runTransfer() : setConfirmTransfer(true))}
                      disabled={
                        transfer.busy || !canTransfer(schedule, now, offer!) || !newKey.trim()
                      }
                    >
                      {rekeyPending ? 'Move it onto my key' : 'Transfer this schedule'}
                    </button>
                  )}
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
                        ? 'Anyone holding this schedule\u2019s id can escrow a price against it. The schedule stays yours until you accept one.'
                        : 'Let anyone holding this schedule\u2019s id escrow a price against it. The schedule stays yours until you accept one.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    className="switch"
                    aria-checked={schedule.sellable}
                    aria-labelledby={`sellable-${id}`}
                    onClick={() => runList(!schedule.sellable)}
                    disabled={!canList(schedule, now) || list.busy}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>
                </div>
              ) : null}

              {isSender && canCancel(schedule, now) ? (
                <div
                  className={
                    isRecipient ? 'stack-tight modal-section' : 'stack-tight'
                  }
                >
                  <h3>Cancel this schedule</h3>
                  <p className="muted">
                    Cancelling returns {toStrk(refundIfCanceledNow(schedule, now))} STRK to
                    you privately. The{' '}
                    {toStrk(schedule.total - refundIfCanceledNow(schedule, now) - schedule.withdrawn)}{' '}
                    STRK already vested stays claimable by the recipient.
                  </p>
                  <p className="muted">
                    Whether a schedule can be cancelled is fixed when it is opened, and no
                    operation on the contract changes it afterwards. You cannot give the
                    right up here, so the recipient has to trust you for as long as the
                    schedule runs. Open the next one uncancelable if you would rather they
                    did not have to.
                  </p>
                  <div>
                    <button className="btn" onClick={runCancel} disabled={cancel.busy}>
                      {cancel.busy ? 'Cancelling\u2026' : 'Cancel this schedule'}
                    </button>
                  </div>
                </div>
              ) : null}
            </Modal>
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
                The sender and recipient values above are Nagare keys. No address of
                either party appears in any transaction on this schedule.
              </p>
              {isUncancelable(schedule) ? (
                <p className="muted">
                  The sender key here is a published constant with no private key behind
                  it, so no signature can ever authorize a cancel. You can recompute it
                  from the contract yourself.
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
