'use client'

import { useState } from 'react'
import type { Stream, Offer } from '@/lib/nagare/read'
import { offerActions } from '@/lib/nagare/actions'
import { buildPayout } from '@/lib/nagare/flow'
import { generateKeypair, saveKey, loadKey, publicKeyOf } from '@/lib/nagare/keys'
import { parseStrk, toStrk, when, until } from '@/lib/nagare/format'
import { offerStatusOf, canList } from '@/lib/nagare/status'
import { MAX_OFFER_HOURS } from '@/lib/nagare/config'
import { useWallet } from './WalletProvider'
import { useAction, ActionStatus } from './ActionRunner'

export function SalePanel({
  id,
  stream,
  offer,
  now,
  isRecipient,
  onDone,
}: {
  id: number
  stream: Stream
  offer: Offer
  now: number
  isRecipient: boolean
  onDone: () => void
}) {
  const { conn, prepare } = useWallet()
  const [price, setPrice] = useState('10')
  const [hours, setHours] = useState('12')

  const makeOffer = useAction('Offer', onDone)
  const accept = useAction('Accept', onDone)
  const reclaim = useAction('Reclaim', onDone)

  const status = offerStatusOf(offer, now)
  const buyerKey = loadKey(`stream:${id}:offer:${offer.generation}:buyer`)
  const isBuyer =
    !!buyerKey && offer.generation > 0n && BigInt(publicKeyOf(buyerKey.privateKey)) === BigInt(offer.buyerPk)

  const runOffer = () =>
    void makeOffer.run(async () => {
      const amount = parseStrk(price)
      if (amount <= 0n) throw new Error('Enter a price in STRK.')
      const h = Number(hours)
      if (!(h > 0 && h <= MAX_OFFER_HOURS)) {
        throw new Error(`An offer can stay open for up to ${MAX_OFFER_HOURS} hours.`)
      }
      const buyer = generateKeypair()
      saveKey(`stream:${id}:offer:${(offer.generation + 1n).toString()}:buyer`, buyer)
      return {
        streamId: String(id),
        actions: offerActions(id, buyer.publicKey, amount, now + h * 3600),
      }
    })

  const runAccept = () =>
    void accept.run(async () => {
      const key = loadKey(`stream:${id}:recipient`)
      if (!conn || !key) throw new Error('You do not hold the recipient key for this stream.')
      return {
        streamId: String(id),
        actions: await buildPayout(
          'Accept',
          stream,
          id,
          key.privateKey,
          conn.address,
          prepare,
          offer.generation,
        ),
      }
    })

  const runReclaim = () =>
    void reclaim.run(async () => {
      if (!conn || !buyerKey) throw new Error('You do not hold the buyer key for this offer.')
      return {
        streamId: String(id),
        actions: await buildPayout(
          'Reclaim',
          stream,
          id,
          buyerKey.privateKey,
          conn.address,
          prepare,
          offer.generation,
        ),
      }
    })

  if (!stream.sellable && status !== 'live') {
    return isRecipient ? null : (
      <div className="card card-outlined stack-tight">
        <h3>Not for sale</h3>
        <p className="muted">
          The holder has not opened this stream to offers. Only they can change that.
        </p>
      </div>
    )
  }

  return (
    <div className="card card-outlined stack">
      <h3>{status === 'live' ? 'There is an offer on this stream' : 'Buy this position'}</h3>

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
            The price is already escrowed in the contract. Accepting moves the position to
            the buyer&rsquo;s key and pays you in the same transaction.
          </p>
          {isRecipient ? (
            <div>
              <button className="btn btn-primary" onClick={runAccept}>
                Accept {toStrk(offer.price)} STRK
              </button>
            </div>
          ) : null}
          {isBuyer ? (
            <div>
              <button className="btn" onClick={runReclaim}>
                Take my {toStrk(offer.price)} STRK back
              </button>
              <p className="muted">
                Reclaiming cancels your offer. You can do this at any time before it is
                accepted.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {status === 'expired' ? (
        <div className="stack-tight">
          <p className="muted">
            The last offer expired {until(offer.expiry, now)} without being accepted.
            {isBuyer ? ' Your escrow is still yours to take back.' : ''}
          </p>
          {isBuyer ? (
            <div>
              <button className="btn" onClick={runReclaim}>
                Take my {toStrk(offer.price)} STRK back
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {status !== 'live' && !isRecipient && canList(stream, now) ? (
        <div className="stack-tight">
          <p className="muted">
            Offering escrows your STRK in the contract now. If the holder accepts, the
            position becomes yours; if they do not, you take it back.
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
            <button className="btn" onClick={runOffer} disabled={!conn}>
              {conn ? `Offer ${price} STRK` : 'Connect a wallet to offer'}
            </button>
          </div>
        </div>
      ) : null}

      {status !== 'live' && isRecipient ? (
        <p className="muted">
          This stream is open to offers. Anyone holding its id can escrow a price against
          it, and you decide whether to take it.
        </p>
      ) : null}
    </div>
  )
}
