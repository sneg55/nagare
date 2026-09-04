import Link from 'next/link'
import { toStrk } from '@/lib/nagare/format'
import { POOL_FEE } from '@/lib/nagare/config'

export const metadata = {
  title: 'Nagare docs: receiving tokens',
  description: 'Claiming a schedule, taking control of it with your own key, and withdrawing.',
}

export default function Receiving() {
  return (
    <>
      <div className="stack-tight">
        <h1>Receiving tokens</h1>
        <p className="lead">
          Someone sent you a claim link, or asked you for a key. Do the first section today,
          even if the cliff is a year away.
        </p>
      </div>

      <h2>Take control of the schedule first</h2>
      <p>
        A claim link carries a key your sender generated. Until you replace it, they can act
        as you, and so can anyone else the link reached along the way. The claim page offers
        to derive a key from your own wallet and move the schedule onto it. Do that, and the
        sender loses the ability to withdraw or sell it out from under you.
      </p>
      <p>
        Re-keying costs {toStrk(POOL_FEE)} STRK from your shielded balance like any other
        Nagare operation, so you need private balances turned on and a little STRK shielded
        before you can do it.
      </p>
      <p>
        It also makes the schedule portable. The key from a link lives in the browser that
        opened it and nowhere else, so clearing site data before you re-key puts the schedule
        out of reach permanently. A key derived from your wallet can be rebuilt on any
        device. <Link href="/docs/keys">Keys and recovery</Link> spells this out.
      </p>

      <h2>If you were asked for a key instead</h2>
      <p>
        Open the schedule page your sender points you at, connect your wallet, and use Show my
        Nagare key for this schedule. Send them the value it gives you. It is a public key,
        so it reveals nothing on its own, and it is not a wallet address. Once they transfer
        the schedule onto it, it appears on your list.
      </p>

      <h2>Checking what you have</h2>
      <p>
        The claim page states whether the sender can cancel. If it says they cannot, the
        schedule was opened with a published constant in place of a sender key, no private key
        for it exists, and the full amount will vest on the dates shown. You can verify that
        against the contract yourself.
      </p>
      <p>
        If it says they can, they are able to take back whatever has not vested, at any time
        until the schedule fully vests. Before the cliff that is everything. Withdraw as it
        vests and less of it stays exposed to a cancel.
      </p>

      <h2>Withdrawing</h2>
      <p>
        Nothing can be withdrawn before the cliff. After it, the schedule page shows what is
        available and the button takes it. The amount lands in a private note inside the pool,
        so your visible wallet balance will not move. The withdrawal is public as an amount
        and a time, with no indication of the wallet it belongs to.
      </p>
      <p>
        Withdrawals are yours to time. Taking everything the moment it vests and taking it all
        at the end are both fine, though a single distinctive amount is easier to correlate
        with a deposit than several ordinary ones.
      </p>

      <h2>If the sender cancels</h2>
      <p>
        You keep everything that had vested at that moment, and it stays withdrawable
        afterwards. The schedule shows as canceled and still claimable until you take it, then
        as canceled and settled.
      </p>
    </>
  )
}
