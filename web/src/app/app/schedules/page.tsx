'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getStream, type Stream } from '@/lib/nagare/read'
import { watched, watch } from '@/lib/nagare/watch'
import { statusOf, STATUS_LABEL, progress, claimableFraction, withdrawableAt } from '@/lib/nagare/status'
import { toStrk, when } from '@/lib/nagare/format'
import { Meter } from '@/components/Meter'
import { loadKey } from '@/lib/nagare/keys'
import { KeyBackup } from '@/components/KeyBackup'

type Row = { id: number; schedule: Stream; role: string }

export default function SchedulesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [addId, setAddId] = useState('')
  const [addNote, setAddNote] = useState<string | null>(null)
  const now = Math.floor(Date.now() / 1000)

  const load = async () => {
    const ids = watched()
    const loaded = await Promise.all(
      ids.map(async (id) => {
        const schedule = await getStream(id)
        const hasSender = !!loadKey(`stream:${id}:sender`)
        const hasRecipient = !!loadKey(`stream:${id}:recipient`)
        const role = hasSender && hasRecipient ? 'You hold both keys' : hasSender ? 'You are the sender' : hasRecipient ? 'You are the recipient' : 'Watching'
        return { id, schedule, role }
      }),
    )
    setRows(loaded.filter((r) => r.schedule.exists))
  }

  useEffect(() => {
    void load()
  }, [])

  if (rows === null) {
    return (
      <section className="band">
        <div className="wrap muted">Reading your schedules from the contract…</div>
      </section>
    )
  }

  return (
    <section className="band">
      <div className="wrap stack stack-lg">
        <div className="split split-end">
          <div className="stack-tight">
            <h1>Your schedules</h1>
            <p className="muted">
              This list lives in this browser. A schedule you were handed by id or by link
              shows up here once you add it.
            </p>
          </div>
          <Link href="/app/create" className="btn btn-primary">
            Open a schedule
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="card card-outlined stack-tight">
            <h2>Nothing here yet</h2>
            <p className="muted">
              Open a schedule to vest tokens to someone, or add one by its id if you were
              given it.
            </p>
          </div>
        ) : (
          <div className="grid-cards">
            {rows.map(({ id, schedule, role }) => {
              const status = statusOf(schedule, now)
              const due = withdrawableAt(schedule, now)
              return (
                <Link
                  href={`/app/schedules/${id}`}
                  key={id}
                  className="card card-outlined stack-tight backlink"
                >
                  <div className="split align-center">
                    <span className="muted">Schedule {id}</span>
                    <span className={status === 'vesting' ? 'badge badge-live' : 'badge'}>
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                  <p className="amount">{toStrk(schedule.total)} STRK</p>
                  <Meter withdrawn={progress(schedule, now)} claimable={claimableFraction(schedule, now)} label={`Schedule ${id} progress`} />
                  <dl className="rows">
                    <div className="row">
                      <dt>Available now</dt>
                      <dd>{toStrk(due)} STRK</dd>
                    </div>
                    <div className="row">
                      <dt>Fully vested</dt>
                      <dd>{when(schedule.end)}</dd>
                    </div>
                  </dl>
                  <p className="muted">{role}</p>
                </Link>
              )
            })}
          </div>
        )}

        <KeyBackup />

        <div className="card card-cream stack-tight">
          <h2>Add a schedule by id</h2>
          <p className="muted">
            If someone gave you a schedule id, put it here to watch it. You will need the
            matching key to do anything with it.
          </p>
          <div className="row-actions">
            <label className="field field-narrow">
              <span className="visually-hidden">Schedule id</span>
              <input
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                inputMode="numeric"
                placeholder="12"
                aria-label="Schedule id"
              />
            </label>
            <button
              className="btn"
              onClick={() => {
                void (async () => {
                  const n = Number(addId)
                  if (!Number.isInteger(n) || n < 1) {
                    setAddNote('Schedule ids are whole numbers counting up from 1.')
                    return
                  }
                  setAddNote(null)
                  const s = await getStream(n)
                  if (!s.exists) {
                    setAddNote(`The contract has no schedule ${n}. Check the number with whoever sent it.`)
                    return
                  }
                  watch(n)
                  setAddId('')
                  setAddNote(`Watching schedule ${n}.`)
                  await load()
                })()
              }}
            >
              Watch it
            </button>
          </div>
          {addNote ? <p role="status">{addNote}</p> : null}
        </div>
      </div>
    </section>
  )
}
