'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Meter } from '@/components/Meter'
import { listedSchedules, type Listing } from '@/lib/nagare/market'
import { toStrk, when } from '@/lib/nagare/format'
import { isUncancelable } from '@/lib/nagare/cancelable'
import { STATUS_LABEL, claimableFraction, offerStatusOf, progress, statusOf } from '@/lib/nagare/status'

export default function MarketPage() {
  const [rows, setRows] = useState<Listing[] | null>(null)
  const [scanned, setScanned] = useState<[number, number] | null>(null)
  const now = Math.floor(Date.now() / 1000)

  useEffect(() => {
    void (async () => {
      setRows(await listedSchedules(Math.floor(Date.now() / 1000), (done, total) => setScanned([done, total])))
    })()
  }, [])

  return (
    <section className="band">
      <div className="wrap stack stack-lg">
        <div className="stack-tight">
          <h1>Open to offers</h1>
          <p className="lead measure-72">
            Every schedule here has been opened to offers by whoever holds it. Escrow a
            price against one and the holder decides whether to take it. If they never do,
            you take your STRK back.
          </p>
          <p className="muted measure-72">
            This page reads the contract. A schedule&rsquo;s amounts, dates and its
            listing are public on chain whether or not anyone lists them here, and none of
            it says who holds the position.
          </p>
        </div>

        {rows === null ? (
          <p className="muted" role="status">
            {scanned ? `Read ${scanned[0]} of ${scanned[1]} schedules.` : 'Reading the contract…'}
          </p>
        ) : rows.length === 0 ? (
          <div className="card card-outlined stack-tight">
            <h2>Nothing is open to offers</h2>
            <p className="muted">
              A holder opens their schedule from its own page. Come back when one has.
            </p>
          </div>
        ) : (
          <div className="grid-cards">
            {rows.map(({ id, schedule, offer }) => {
              const remaining = schedule.total - schedule.withdrawn
              const live = offerStatusOf(offer, now) === 'live'
              return (
                <Link
                  href={`/app/schedules/${id}`}
                  key={id}
                  className="card card-outlined stack-tight backlink"
                >
                  <div className="split align-center">
                    <span className="muted">Schedule {id}</span>
                    <span className={live ? 'badge badge-live' : 'badge'}>
                      {live ? 'Offer standing' : STATUS_LABEL[statusOf(schedule, now)]}
                    </span>
                  </div>
                  <div className="stack-tight">
                    <span className="muted">Still to be paid out</span>
                    <p className="amount">{toStrk(remaining)} STRK</p>
                  </div>
                  <Meter
                    withdrawn={progress(schedule, now)}
                    claimable={claimableFraction(schedule, now)}
                    label={`Schedule ${id} progress`}
                  />
                  <dl className="rows">
                    <div className="row">
                      <dt>Total</dt>
                      <dd>{toStrk(schedule.total)} STRK</dd>
                    </div>
                    <div className="row">
                      <dt>Already withdrawn</dt>
                      <dd>{toStrk(schedule.withdrawn)} STRK</dd>
                    </div>
                    <div className="row">
                      <dt>Fully vested</dt>
                      <dd>{when(schedule.end)}</dd>
                    </div>
                    <div className="row">
                      <dt>Sender can cancel</dt>
                      <dd>{isUncancelable(schedule) ? 'No' : 'Yes'}</dd>
                    </div>
                    {live ? (
                      <div className="row">
                        <dt>Standing offer</dt>
                        <dd>
                          {toStrk(offer.price)} STRK{' '}
                          <span className="muted">(until {when(offer.expiry)})</span>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="muted">
                    {live
                      ? 'Someone has already escrowed a price. Yours would replace it once theirs expires.'
                      : 'No offer standing on it yet.'}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
