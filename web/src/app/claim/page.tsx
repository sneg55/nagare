'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TopBar } from '@/components/TopBar'
import { parseClaim } from '@/lib/nagare/claim'
import { saveKey, publicKeyOf, generateKeypair } from '@/lib/nagare/keys'
import { getStream, type Stream } from '@/lib/nagare/read'
import { watch } from '@/lib/nagare/watch'
import { toStrk, when } from '@/lib/nagare/format'

type State =
  | { kind: 'reading' }
  | { kind: 'loading'; streamId: number }
  | { kind: 'bad' }
  | { kind: 'ready'; streamId: number; schedule: Stream; mine: boolean }

export default function ClaimPage() {
  const [state, setState] = useState<State>({ kind: 'reading' })

  useEffect(() => {
    const parsed = parseClaim(window.location.hash)
    if (!parsed) {
      setState({ kind: 'bad' })
      return
    }
    const { streamId, privateKey } = parsed
    setState({ kind: 'loading', streamId })
    void (async () => {
      const schedule = await getStream(streamId)
      if (!schedule.exists) {
        setState({ kind: 'bad' })
        return
      }
      const mine = BigInt(publicKeyOf(privateKey)) === BigInt(schedule.recipientPk)
      if (mine) {
        saveKey(`stream:${streamId}:recipient`, { privateKey, publicKey: publicKeyOf(privateKey) })
        watch(streamId)
      }
      history.replaceState(null, '', window.location.pathname)
      setState({ kind: 'ready', streamId, schedule, mine })
    })()
  }, [])

  if (state.kind === 'reading' || state.kind === 'loading') {
    return (
      <>
      <TopBar cta={false} />
      <main id="content" className="band">
        <div className="narrow stack">
          <h1>Opening your schedule</h1>
          <p className="lead">
            {state.kind === 'loading'
              ? `Reading schedule ${state.streamId} from Starknet. This takes a few seconds.`
              : 'Checking the link.'}
          </p>
        </div>
      </main>
      </>
    )
  }

  if (state.kind === 'bad') {
    return (
      <>
      <TopBar cta={false} />
      <main id="content" className="band">
        <div className="narrow stack">
          <h1>That link does not open a schedule</h1>
          <p className="lead">
            It may have been cut short in transit, or the schedule it points at was never
            funded. Ask the sender for a fresh one.
          </p>
        </div>
      </main>
      </>
    )
  }

  const { streamId, schedule, mine } = state

  if (!mine) {
    return (
      <>
      <TopBar cta={false} />
      <main id="content" className="band">
        <div className="narrow stack">
          <h1>This schedule has already moved on</h1>
          <p className="lead">
            The key in this link no longer controls schedule {streamId}. Whoever received it
            has re-keyed, which is what a claim link is supposed to make possible.
          </p>
          <Link href="/app/schedules" className="btn">
            Go to your schedules
          </Link>
        </div>
      </main>
      </>
    )
  }

  return (
    <>
    <TopBar cta={false} />
    <main id="content" className="band">
      <div className="narrow stack stack-lg">
        <div className="stack-tight">
          <h1>{toStrk(schedule.total)} STRK is vesting to you</h1>
          <p className="lead">
            Schedule {streamId} unlocks from {when(schedule.cliff)} and finishes{' '}
            {when(schedule.end)}. The key from this link is now saved in this browser.
          </p>
        </div>

        <div className="card card-cream">
          <div className="stack-tight">
            <h3>Take control of it first</h3>
            <p className="muted">
              The person who sent this link generated your key, so until you replace it,
              they can act as you. Making a fresh key on this device is one transaction and
              closes that gap.
            </p>
            <p className="muted">
              Nothing forces you to. If you trust the sender and want to leave it, the
              schedule still pays out to this key.
            </p>
            <div className="row-actions">
              <Link href={`/app/schedules/${streamId}`} className="btn btn-primary">
                Open the schedule
              </Link>
              <button
                className="btn"
                onClick={() => {
                  saveKey(`stream:${streamId}:rekey-target`, generateKeypair())
                  window.location.href = `/app/schedules/${streamId}`
                }}
              >
                Make me a fresh key
              </button>
            </div>
          </div>
        </div>

        <div className="card card-outlined stack-tight">
          <h3>Back this key up now</h3>
          <p className="muted">
            It lives only in this browser and there is no recovery. Clear your site data
            without a backup and the schedule is unreachable, by you or anyone.
          </p>
        </div>
      </div>
    </main>
    </>
  )
}
