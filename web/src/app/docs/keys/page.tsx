import Link from 'next/link'
import { SENDER_SLOT_SPAN } from '@/lib/nagare/derive'

export const metadata = {
  title: 'Nagare docs: keys and recovery',
  description: 'Where Nagare keys come from, and which ones survive a lost browser.',
}

export default function Keys() {
  return (
    <>
      <div className="stack-tight">
        <h1>Keys and recovery</h1>
        <p className="lead">
          Every schedule is controlled by a key rather than an account. Most of those keys
          come from your wallet, so they survive a lost laptop and a cleared browser. One
          kind is fragile, and that is the section to read carefully.
        </p>
      </div>

      <h2>Where the keys come from</h2>
      <p>
        Nagare asks your wallet to sign one fixed message and hashes the signature into a
        seed. Every key it needs comes out of that seed by a fixed path: sender keys by slot,
        a recipient key per schedule, keys for offers you make. The signature moves no funds
        and the seed is held in memory for the session only.
      </p>
      <p>
        This is why the browser holds no secrets worth stealing. It stores public keys and the
        path each one came from, so it knows which schedules are yours, and it asks your
        wallet again whenever it needs to actually sign something.
      </p>

      <h2>A new browser, or a cleared one</h2>
      <p>
        Connect your wallet on <Link href="/app/schedules">Your schedules</Link>. The first
        time a wallet connects to a browser with an empty list, Nagare signs once and reads
        the contract looking for keys that match, and everything it finds comes back. There is
        a Check again button on the same page for a schedule that was transferred to you
        afterwards.
      </p>
      <p>
        Recovery finds the schedules you opened, the schedules whose recipient key came from
        your wallet, and the offers you placed. It reads only the contract, so it works from a
        browser that has never seen Nagare before.
      </p>

      <h2>The exception: a key that arrived in a claim link</h2>
      <p>
        A claim link carries a key that your sender generated in their browser. It was never
        derived from your wallet, so your wallet cannot rebuild it and recovery cannot find
        it. That key exists in two places: the browser that opened the link, and the browser
        of whoever created it.
      </p>
      <p>
        Clearing site data in that browser before re-keying therefore puts the schedule out
        of your reach for good, and so does losing the device. Re-keying to a key from your
        own wallet ends that exposure, which is why the claim page pushes you to do it
        immediately. Until you do, the sender can also still act as you.
      </p>

      <h2>Forgetting a key on purpose</h2>
      <p>
        A sender who used a claim link keeps a copy of the recipient key so the link can be
        rebuilt. Forget on the schedule page drops that copy, which is the only way to give up
        that hold before the recipient re-keys. It is irreversible from that browser, and if
        the recipient never received the link, nobody can reach the schedule afterwards.
      </p>

      <h2>Two limits</h2>
      <ul>
        <li>
          One signature rebuilds {SENDER_SLOT_SPAN} sender keys, so a wallet holds at most{' '}
          {SENDER_SLOT_SPAN} cancelable schedules. Uncancelable ones consume no slot.
        </li>
        <li>
          A key reused across two schedules links them to each other. Nagare derives a fresh
          sender key per schedule to avoid that, which is why the slots exist.
        </li>
      </ul>

      <h2>Switching wallets</h2>
      <p>
        Roles are scoped to the wallet that derived them, so connecting a different wallet
        hides the first one&rsquo;s schedules. They come back when you reconnect the
        original. A schedule you can see but hold no key for still shows all its
        public detail, because everything on that page is readable by anyone.
      </p>
    </>
  )
}
