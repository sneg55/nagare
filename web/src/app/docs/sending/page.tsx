import Link from 'next/link'
import { toStrk } from '@/lib/nagare/format'
import { POOL_FEE } from '@/lib/nagare/config'
import { SENDER_SLOT_SPAN } from '@/lib/nagare/derive'

export const metadata = {
  title: 'Nagare docs: sending tokens',
  description: 'Opening a vesting schedule, handing over the claim link, and cancelling.',
}

export default function Sending() {
  return (
    <>
      <div className="stack-tight">
        <h1>Sending tokens</h1>
        <p className="lead">
          You have STRK and someone who should receive it on a schedule: a hire on a cliff,
          an advisor, a contributor. This is the whole path from shielding to funded.
        </p>
      </div>

      <h2>Before you start</h2>
      <p>
        Turn on private balances in your wallet and shield the amount you plan to vest plus{' '}
        {toStrk(POOL_FEE)} STRK for the pool fee. Shielding is an ordinary public deposit, so
        your address and the amount are on chain from that moment. That is expected, and it
        is the first thing on{' '}
        <Link href="/docs/reference#limits">what Nagare does not claim</Link>.
      </p>

      <h2>Opening a schedule</h2>
      <p>
        Go to <Link href="/app/create">Open a schedule</Link> and set four things.
      </p>
      <h3>Amount</h3>
      <p>
        The full amount that will vest, in STRK. It leaves your shielded balance when you
        fund, and it sits in the Nagare contract until it is withdrawn or refunded.
      </p>
      <h3>Cliff and end date</h3>
      <p>
        Accrual is linear from the day you fund. The cliff is a gate on withdrawal, not on
        accrual, so nothing can be taken out before that date and the whole accrued amount
        becomes available at once when it passes. The chart on the form redraws as you type,
        and you can drag either handle instead.
      </p>
      <h3>Cancelable, or not</h3>
      <p>
        A cancelable schedule lets you take back whatever has not vested, at any time before
        it fully vests. Before the cliff that is the entire amount, which is worth being
        honest with yourself about: until the cliff passes, the recipient of a cancelable
        schedule is trusting you completely.
      </p>
      <p>
        Switching it off changes that. Nagare records a published constant as the sender key,
        one with no private key behind it, so no signature can ever authorize a cancel. The
        recipient can check the value themselves against the contract, and the claim page
        tells them which kind they have. This choice is fixed when the schedule is opened and
        no later operation changes it.
      </p>
      <h3>How the recipient gets their key</h3>
      <p>
        <strong>A claim link</strong> generates the recipient key in your browser and hands
        you a URL carrying the private half. Use this when the recipient has no wallet yet or
        you have no key from them.
      </p>
      <p>
        <strong>Their own key</strong> takes a Nagare public key they produce from their own
        wallet. Use this when you can ask them for one first. It is the safer of the two,
        because no secret ever travels.
      </p>

      <h2>Handing over a claim link</h2>
      <p>
        The link carries the recipient key, so whoever opens it controls the schedule until
        the recipient replaces the key. Send it through a channel you would use for a
        password, and tell them to re-key as soon as they arrive.
      </p>
      <p>
        Your browser keeps a copy of that key, which means you can rebuild the link from the
        schedule page as often as you need, and it also means you can still act as the
        recipient. Once you have confirmed they received it, use Forget on the schedule page
        to drop your copy. If they never received the link and you forget it, the vested
        amount is unreachable by everybody.
      </p>

      <h2>Cancelling</h2>
      <p>
        Open the schedule, then the gear. Cancelling returns everything that has not vested to
        you as a private note, and leaves what has already vested claimable by the recipient.
        The refund amount and the time both go on chain, with no indication of who
        cancelled.
      </p>

      <h2>The limit worth knowing</h2>
      <p>
        One wallet signature rebuilds {SENDER_SLOT_SPAN} sender keys, so a wallet can hold{' '}
        {SENDER_SLOT_SPAN} cancelable schedules at once. Opening the next one fails with a
        message saying so. Uncancelable schedules do not consume a slot, because they store the
        published constant rather than a key of yours.
      </p>
    </>
  )
}
