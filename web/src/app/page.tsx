import Link from 'next/link'
import { TopBar } from '@/components/TopBar'
import { Reveal } from '@/components/Reveal'
import { HONEST_LIMITS } from '@/lib/nagare/reveal'
import { NAGARE_PADDED, VOYAGER } from '@/lib/nagare/config'
import { PoolStats } from '@/components/PoolStats'

export default function Landing() {
  return (
    <>
      <TopBar />

      <main id="content">
      <section className="band">
        <div className="wrap stack stack-lg">
          <h1 className="display" style={{ maxWidth: '13ch' }}>
            Vesting that doesn&rsquo;t publish your <span className="hl">cap table</span>.
          </h1>
          <p className="lead" style={{ maxWidth: '58ch' }}>
            Open a vesting schedule on Starknet where the sender and the recipient are keys,
            not wallet addresses. The unlock is enforced on chain. Who is on either end of
            it never appears in the transaction.
          </p>
          <div className="row-actions">
            <Link href="/app/create" className="btn btn-primary">
              Open a schedule
            </Link>
            <Link href="/app/schedules" className="btn">
              See your schedules
            </Link>
          </div>
          <PoolStats />
        </div>
      </section>

      <section className="band band-cream">
        <div className="wrap stack stack-lg">
          <h2 style={{ maxWidth: '20ch' }}>
            Every other vesting contract names both parties, forever.
          </h2>
          <p className="lead" style={{ maxWidth: '62ch' }}>
            Open a Tokei or Sablier stream on Voyager and you can read the cap table off
            it: which address funds which, on what schedule, for how much. That record
            does not expire. Nagare moves the funding and the payouts inside the STRK20
            pool, so the line between the two wallets is never drawn.
          </p>
          <div className="grid-cards">
            {[
              {
                t: 'Fund from a shielded balance',
                d: 'The pool pays Nagare. Your wallet is not in the transaction, and the recipient does not need a wallet on the day you set it up.',
              },
              {
                t: 'Withdraw what has vested',
                d: 'Linear accrual with a cliff. The recipient signs with their key and the amount lands in a private note.',
              },
              {
                t: 'Cancel and get the rest back',
                d: 'The unvested part returns to you privately. What already vested stays claimable by the recipient.',
              },
              {
                t: 'Hand the schedule over',
                d: 'Re-key a schedule to a new holder, or list it and sell it. The escrow settles in one transaction.',
              },
            ].map((c) => (
              <article className="card stack-tight" key={c.t}>
                <h3>{c.t}</h3>
                <p className="muted">{c.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <Reveal />
        </div>
      </section>

      <section className="band band-cream">
        <div className="wrap stack">
          <h2>Before you fund anything</h2>
          <dl className="rows rows-plain rows-ink measure-72">
            {HONEST_LIMITS.map((line) => (
              <div className="row" key={line}>
                <dt>{line}</dt>
              </div>
            ))}
            <div className="row">
              <dt>
                Your keys come from your wallet, and one signature rebuilds them on any
                device. A key that arrives in a claim link is the exception: it lives in
                that browser alone until the recipient re-keys.
              </dt>
            </div>
            <div className="row">
              <dt>
                The contract has no owner and no upgrade path, and it has not been
                audited.{' '}
                <a href={`${VOYAGER}/contract/${NAGARE_PADDED}`} target="_blank" rel="noreferrer">
                  Read it on Voyager
                </a>
                .
              </dt>
            </div>
          </dl>
        </div>
      </section>

      </main>

      <footer className="band band-tight">
        <div className="wrap muted footer-links">
          <span>Nagare</span>
          <a href="https://github.com/sneg55/nagare" target="_blank" rel="noreferrer">
            Source
          </a>
          <a href={`${VOYAGER}/contract/${NAGARE_PADDED}`} target="_blank" rel="noreferrer">
            Contract
          </a>
          <span>STRK20 on Starknet mainnet</span>
        </div>
      </footer>
    </>
  )
}
