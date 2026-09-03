'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getStream, type Stream } from '@/lib/nagare/read'
import { watched, openedHere, recovered, markRecovered } from '@/lib/nagare/watch'
import { statusOf, STATUS_LABEL, progress, claimableFraction, withdrawableAt } from '@/lib/nagare/status'
import { toStrk, when } from '@/lib/nagare/format'
import { Meter } from '@/components/Meter'
import { hasHiddenRole, publicKeyFor } from '@/lib/nagare/roles'
import { useWallet } from '@/components/WalletProvider'
import { recoverFromSeed } from '@/lib/nagare/recover'

type Row = { id: number; schedule: Stream; role: string }

export default function SchedulesPage() {
  const { conn, unlock } = useWallet()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState<[number, number] | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)
  const tried = useRef<string | null>(null)
  const now = Math.floor(Date.now() / 1000)

  const load = useCallback(async () => {
    const ids = watched()
    const loaded = await Promise.all(
      ids.map(async (id) => {
        const schedule = await getStream(id)
        const hasSender = !!publicKeyFor(`stream:${id}:sender`)
        const hasRecipient = !!publicKeyFor(`stream:${id}:recipient`)
        const hidden =
          hasHiddenRole(`stream:${id}:sender`) || hasHiddenRole(`stream:${id}:recipient`)
        const role =
          hasSender && hasRecipient
            ? 'You hold both keys'
            : hasSender
              ? 'You are the sender'
              : hasRecipient
                ? 'You are the recipient'
                : hidden
                  ? 'Connect your wallet to see your role'
                  : openedHere(id)
                    ? 'You opened this'
                    : 'Watching'
        return { id, schedule, role }
      }),
    )
    setRows(loaded.filter((r) => r.schedule.exists))
  }, [])

  const scan = useCallback(
    async (address: string) => {
      setScanning(true)
      setScanNote(null)
      try {
        const seed = await unlock()
        const found = await recoverFromSeed(seed, (done, total) => setScanned([done, total]))
        markRecovered(address)
        if (found.length === 0) {
          setScanNote('No schedule on the contract carries a key from this wallet.')
        }
        await load()
      } catch (e) {
        setScanNote((e as Error).message)
      } finally {
        setScanning(false)
        setScanned(null)
      }
    },
    [unlock, load],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!conn || tried.current === conn.address) return
    if (watched().length > 0 || recovered(conn.address)) return
    tried.current = conn.address
    void scan(conn.address)
  }, [conn, scan])

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
              Every schedule your wallet holds a key for, plus any you are watching.
            </p>
          </div>
          <Link href="/app/create" className="btn btn-primary">
            Open a schedule
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="card card-outlined stack-tight">
            <h2>{scanning ? 'Looking for your schedules' : 'Nothing here yet'}</h2>
            <p className="muted">
              {scanning
                ? 'Nagare is rebuilding your keys from that signature and checking every schedule on the contract for a match.'
                : conn
                  ? 'You hold no keys on any schedule the contract knows about. Open one to vest tokens to someone.'
                  : 'Connect your wallet and Nagare will rebuild your keys and find the schedules that carry them.'}
            </p>
            {scanned ? (
              <p className="muted" role="status">
                Read {scanned[0]} of {scanned[1]} schedules.
              </p>
            ) : null}
            {scanNote ? (
              <p className="muted" role="status">
                {scanNote}
              </p>
            ) : null}
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

        <div className="card card-cream stack-tight">
          <h2>Missing one?</h2>
          <p className="muted">
            Nagare checks the contract for your keys the first time you connect on a
            browser. Check again if a schedule was transferred to you since.
          </p>
          <div>
            <button
              className="btn"
              onClick={() => conn && void scan(conn.address)}
              disabled={!conn || scanning}
            >
              {scanning ? 'Checking the contract…' : 'Check for my schedules again'}
            </button>
          </div>
          {rows.length > 0 && scanned ? (
            <p className="muted" role="status">
              Read {scanned[0]} of {scanned[1]} schedules.
            </p>
          ) : null}
          {rows.length > 0 && scanNote ? <p role="status">{scanNote}</p> : null}
        </div>
      </div>
    </section>
  )
}
