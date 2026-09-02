'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { parseClaim } from '@/lib/nagare/claim'
import { saveKey, publicKeyOf, generateKeypair } from '@/lib/nagare/keys'
import { getStream, type Stream } from '@/lib/nagare/read'
import { watch } from '@/lib/nagare/watch'
import { toStrk, when } from '@/lib/nagare/format'

type State =
  | { kind: 'reading' }
  | { kind: 'bad' }
  | { kind: 'ready'; streamId: number; stream: Stream; mine: boolean }

export default function ClaimPage() {
  const [state, setState] = useState<State>({ kind: 'reading' })

  useEffect(() => {
    const parsed = parseClaim(window.location.hash)
    if (!parsed) {
      setState({ kind: 'bad' })
      return
    }
    const { streamId, privateKey } = parsed
    void (async () => {
      const stream = await getStream(streamId)
      if (!stream.exists) {
        setState({ kind: 'bad' })
        return
      }
      const mine = BigInt(publicKeyOf(privateKey)) === BigInt(stream.recipientPk)
      if (mine) {
        saveKey(`stream:${streamId}:recipient`, { privateKey, publicKey: publicKeyOf(privateKey) })
        watch(streamId)
      }
      history.replaceState(null, '', window.location.pathname)
      setState({ kind: 'ready', streamId, stream, mine })
    })()
  }, [])

  if (state.kind === 'reading') {
    return (
      <section className="band">
        <div className="narrow muted">Opening the link…</div>
      </section>
    )
  }

  if (state.kind === 'bad') {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>That link does not open a stream</h1>
          <p className="lead">
            It may have been cut short in transit, or the stream it points at was never
            funded. Ask the sender for a fresh one.
          </p>
        </div>
      </section>
    )
  }

  const { streamId, stream, mine } = state

  if (!mine) {
    return (
      <section className="band">
        <div className="narrow stack">
          <h1>This stream has already moved on</h1>
          <p className="lead">
            The key in this link no longer controls stream {streamId}. Whoever received it
            has re-keyed, which is what a claim link is supposed to make possible.
          </p>
          <Link href="/app/streams" className="btn">
            Go to your streams
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="band">
      <div className="narrow stack" style={{ gap: 'var(--s5)' }}>
        <div className="stack-tight">
          <h1>{toStrk(stream.total)} STRK is vesting to you</h1>
          <p className="lead">
            Stream {streamId} unlocks from {when(stream.cliff)} and finishes{' '}
            {when(stream.end)}. The key from this link is now saved in this browser.
          </p>
        </div>

        <div className="card" style={{ background: 'var(--cream)' }}>
          <div className="stack-tight">
            <h3>Take control of it first</h3>
            <p className="muted">
              The person who sent this link generated your key, so until you replace it,
              they can act as you. Making a fresh key on this device is one transaction and
              closes that gap.
            </p>
            <p className="muted">
              Nothing forces you to. If you trust the sender and want to leave it, the
              stream still pays out to this key.
            </p>
            <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
              <Link href={`/app/streams/${streamId}`} className="btn btn-primary">
                Open the stream
              </Link>
              <button
                className="btn"
                onClick={() => {
                  const fresh = generateKeypair()
                  saveKey(`stream:${streamId}:rekey-target`, fresh)
                  window.location.href = `/app/streams/${streamId}`
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
            without a backup and the stream is unreachable, by you or anyone.
          </p>
        </div>
      </div>
    </section>
  )
}
