'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TopBar } from '@/components/TopBar'
import { parseClaim } from '@/lib/nagare/claim'
import { saveKey, publicKeyOf } from '@/lib/nagare/keys'
import { keyForSchedule } from '@/lib/nagare/derive'
import { isUncancelable } from '@/lib/nagare/cancelable'
import { useWallet } from '@/components/WalletProvider'
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
  const { unlock } = useWallet()
  const [keying, setKeying] = useState(false)
  const [keyNote, setKeyNote] = useState<string | null>(null)

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

  const makeMyKey = async () => {
    setKeying(true)
    setKeyNote(null)
    try {
      const seed = await unlock()
      saveKey(`stream:${streamId}:rekey-target`, keyForSchedule(seed, 'recipient', streamId))
      window.location.href = `/app/schedules/${streamId}`
    } catch (e) {
      setKeyNote((e as Error).message)
    } finally {
      setKeying(false)
    }
  }

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

        <div
          className={isUncancelable(schedule) ? 'card card-outlined stack-tight' : 'card card-cream stack-tight'}
        >
          <h3>
            {isUncancelable(schedule)
              ? 'The sender cannot take this back'
              : 'The sender can cancel this'}
          </h3>
          {isUncancelable(schedule) ? (
            <>
              <p className="muted">
                This schedule was opened with no sender key. Nagare recorded a published
                constant in its place, and no private key exists for it, so no signature
                can ever authorize a cancel. The whole {toStrk(schedule.total)} STRK will
                vest on the dates above.
              </p>
              <p className="muted">
                You do not have to take anyone&rsquo;s word for it. The contract shows the
                sender key on this schedule, and it is the same value on every uncancelable
                one.
              </p>
            </>
          ) : (
            <>
              <p className="muted">
                Until it fully vests on {when(schedule.end)}, the sender can cancel and take
                back whatever has not vested by then. What has already vested stays yours to
                withdraw.
              </p>
              <p className="muted">
                Nothing vests before the cliff on {when(schedule.cliff)}, so a cancel before
                that date returns the whole {toStrk(schedule.total)} STRK to the sender and
                leaves you nothing. Withdrawing as it vests is what limits that.
              </p>
            </>
          )}
        </div>

        <div className="card card-cream">
          <div className="stack-tight">
            <h3>Take control of it first</h3>
            <p className="muted">
              The person who sent this link generated your key, so until you replace it
              they can act as you, and so can anyone else the link reached. Your own key
              comes from your wallet: one signature to derive it, one transaction to move
              the schedule onto it.
            </p>
            <p className="muted">
              That also makes the schedule yours to reopen anywhere. The key in this link
              lives in this browser alone, and clearing your site data before you re-key
              puts the schedule out of reach.
            </p>
            <div className="row-actions">
              <button
                className="btn btn-primary"
                onClick={() => void makeMyKey()}
                disabled={keying}
              >
                {keying ? 'Deriving your key…' : 'Make me a key from my wallet'}
              </button>
              <Link href={`/app/schedules/${streamId}`} className="btn">
                Leave the sender&rsquo;s key for now
              </Link>
            </div>
            {keyNote ? (
              <p className="muted" role="status">
                {keyNote}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
    </>
  )
}
