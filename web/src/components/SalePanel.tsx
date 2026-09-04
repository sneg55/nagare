'use client'

import { useState } from 'react'
import { getOffer, getStream, type Stream, type Offer } from '@/lib/nagare/read'
import { offerActions } from '@/lib/nagare/actions'
import { buildPayout } from '@/lib/nagare/flow'
import { keyForOffer } from '@/lib/nagare/derive'
import { offerGenerationsHeld, publicKeyFor, saveRole } from '@/lib/nagare/roles'
import { watch } from '@/lib/nagare/watch'
import { parseStrk, toStrk, when, until } from '@/lib/nagare/format'
import { offerStatusOf, canList } from '@/lib/nagare/status'
import { MAX_OFFER_HOURS } from '@/lib/nagare/config'
import { useWallet } from './WalletProvider'
import { useAction, ActionStatus } from './ActionRunner'

export function SalePanel({
  id,
  schedule,
  offer,
  now,
  isRecipient,
  onDone,
}: {
  id: number
  schedule: Stream
  offer: Offer
  now: number
  isRecipient: boolean
  onDone: () => void
}) {
  const { requireWallet, prepare, keyFor, unlock } = useWallet()
  const [price, setPrice] = useState('10')
  const [hours, setHours] = useState('12')

  const makeOffer = useAction('Offer', onDone)
  const accept = useAction('Accept', onDone)
  const reclaim = useAction('Reclaim', onDone)

  const status = offerStatusOf(offer, now)
  const buyerPk = publicKeyFor(`stream:${id}:offer:${offer.generation}:buyer`)
  const isBuyer = !!buyerPk && offer.generation > 0n && BigInt(buyerPk) === BigInt(offer.buyerPk)

  const runOffer = () =>
    void makeOffer.run(async () => {
      const amount = parseStrk(price)
      if (amount <= 0n) throw new Error('Enter a price in STRK.')
      const h = Number(hours)
      if (!(h > 0 && h <= MAX_OFFER_HOURS)) {
        throw new Error(`An offer can stay open for up to ${MAX_OFFER_HOURS} hours.`)
      }
      const generation = (offer.generation + 1n).toString()
      const buyer = keyForOffer(await unlock(), id, generation)
      saveRole(`stream:${id}:offer:${generation}:buyer`, {
        publicKey: buyer.publicKey,
        source: { kind: 'offer', streamId: id, generation },
      })
      watch(id)
      return {
        streamId: String(id),
        actions: offerActions(id, buyer.publicKey, amount, now + h * 3600),
        settled: async () => (await getOffer(id)).generation > offer.generation,
      }
    })

  const runAccept = () =>
    void accept.run(async () => {
      const key = await keyFor(`stream:${id}:recipient`)
      const { conn } = await requireWallet()
      return {
        streamId: String(id),
        actions: await buildPayout(
          'Accept',
          schedule,
          id,
          key.privateKey,
          conn.address,
          prepare,
          offer.generation,
        ),
        settled: async () => (await getStream(id)).nonce !== schedule.nonce,
      }
    })

  const runReclaimOf = (generation: bigint) =>
    void reclaim.run(async () => {
      const buyerKey = await keyFor(`stream:${id}:offer:${generation}:buyer`)
      const { conn } = await requireWallet()
      return {
        streamId: String(id),
        actions: await buildPayout(
          'Reclaim',
          schedule,
          id,
          buyerKey.privateKey,
          conn.address,
          prepare,
          generation,
        ),
        settled:
          generation === offer.generation ? async () => !(await getOffer(id)).live : undefined,
      }
    })

  const runReclaim = () => runReclaimOf(offer.generation)

  const stale = offerGenerationsHeld(id).filter((g) => BigInt(g) !== offer.generation)

  const pendingOffer = status === 'live' || status === 'expired'

  if (isRecipient && !pendingOffer && stale.length === 0) return null

  if (!pendingOffer && !schedule.sellable && stale.length === 0) {
    return (
      <div className="card card-outlined stack-tight">
        <h3>Not for sale</h3>
        <p className="muted">
          The holder has not opened this schedule to offers. Only they can change that.
        </p>
      </div>
    )
  }

  return (
    <div className="card card-outlined stack">
      <h3>
        {status === 'live'
          ? 'There is an offer on this schedule'
          : isRecipient
            ? 'Offers on this schedule'
            : 'Buy this schedule'}
      </h3>

      <ActionStatus phase={makeOffer.phase} op="Offer" reset={makeOffer.reset} />
      <ActionStatus phase={accept.phase} op="Accept" reset={accept.reset} />
      <ActionStatus phase={reclaim.phase} op="Reclaim" reset={reclaim.reset} />

      {status === 'live' ? (
        <div className="stack-tight">
          <dl className="rows">
            <div className="row">
              <dt>Price</dt>
              <dd className="amount">{toStrk(offer.price)} STRK</dd>
            </div>
            <div className="row">
              <dt>Open until</dt>
              <dd>
                {when(offer.expiry)} <span className="muted">({until(offer.expiry, now)})</span>
              </dd>
            </div>
          </dl>
          <p className="muted">
            The price is already escrowed in the contract. Accepting moves the schedule to
            the buyer&rsquo;s key and pays you in the same transaction.
          </p>
          {isRecipient ? (
            <div>
              <button className="btn btn-primary" onClick={runAccept} disabled={accept.busy}>
                {accept.busy ? 'Accepting\u2026' : `Accept ${toStrk(offer.price)} STRK`}
              </button>
            </div>
          ) : null}
          {isBuyer ? (
            <div>
              <button className="btn" onClick={runReclaim} disabled={reclaim.busy}>
                {reclaim.busy ? 'Reclaiming\u2026' : `Take my ${toStrk(offer.price)} STRK back`}
              </button>
              <p className="muted">
                Reclaiming cancels your offer. You can do this at any time before it is
                accepted.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {stale.length > 0 ? (
        <div className="stack-tight">
          <h4>Earlier offers you made</h4>
          <p className="muted">
            An offer stays escrowed under its own generation until you reclaim it, so one you
            made before this round can still be sitting in the contract. Nagare cannot read an
            older generation back, so try it and the contract will say whether anything is
            there.
          </p>
          {stale.map((g) => (
            <div key={g}>
              <button
                className="btn"
                onClick={() => runReclaimOf(BigInt(g))}
                disabled={reclaim.busy}
              >
                {reclaim.busy ? 'Reclaiming\u2026' : `Reclaim my offer from round ${g}`}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {status === 'expired' ? (
        <div className="stack-tight">
          <p className="muted">
            The offer of {toStrk(offer.price)} STRK expired {until(offer.expiry, now)} without
            being accepted, so it can no longer be taken.
            {isBuyer
              ? ' Your escrow is still in the contract and yours to take back.'
              : ' The escrow stays in the contract until the buyer reclaims it.'}
          </p>
          {isBuyer ? (
            <div>
              <button className="btn" onClick={runReclaim} disabled={reclaim.busy}>
                {reclaim.busy ? 'Reclaiming\u2026' : `Take my ${toStrk(offer.price)} STRK back`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {status !== 'live' && !isRecipient && canList(schedule, now) ? (
        <div className="stack-tight">
          <p className="muted">
            Offering escrows your STRK in the contract now. If the holder accepts, the
            schedule becomes yours; if they do not, you take it back.
          </p>
          <div className="two-up">
            <label className="field">
              <span>Your price in STRK</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Open for, in hours</span>
              <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" />
            </label>
          </div>
          <div>
            <button className="btn" onClick={runOffer} disabled={makeOffer.busy}>
              {makeOffer.busy ? 'Offering\u2026' : `Offer ${price} STRK`}
            </button>
          </div>
        </div>
      ) : null}

    </div>
  )
}
