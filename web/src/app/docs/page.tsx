import Link from 'next/link'
import { toStrk } from '@/lib/nagare/format'
import { POOL_FEE } from '@/lib/nagare/config'

export const metadata = {
  title: 'Nagare docs: start here',
  description: 'How private vesting on Nagare works, and what it does and does not hide.',
}

export default function DocsHome() {
  return (
    <>
      <div className="stack-tight">
        <h1>Start here</h1>
        <p className="lead">
          Nagare vests tokens on Starknet without putting either party on a public ledger.
          This page covers the one idea the rest of the product rests on. Read it before
          you move any money.
        </p>
      </div>

      <h2>The idea</h2>
      <p>
        A vesting schedule usually belongs to an address. Yours funds it, theirs receives
        it, and anyone reading the chain can put those two together and keep the answer
        forever.
      </p>
      <p>
        In Nagare a schedule belongs to a <strong>key</strong>. When you open one, your
        browser derives a Stark curve keypair from your wallet, and the contract stores the
        public half. Withdrawing, cancelling, re-keying and selling are signatures from that
        key, rather than transactions sent from your address. The money itself moves through
        the STRK20 privacy pool: the pool pays Nagare to fund a schedule, and Nagare pays the
        pool when someone withdraws.
      </p>
      <p>
        Your wallet still signs the outer transaction, and it still pays the fee. What it
        does not do is appear beside the other party.
      </p>

      <h2>The two keys on every schedule</h2>
      <ul>
        <li>
          The <strong>sender key</strong> can cancel, which returns whatever has not vested.
          A schedule opened as uncancelable has no usable sender key at all.
        </li>
        <li>
          The <strong>recipient key</strong> can withdraw what has vested, hand the schedule
          to a different key, and open it to offers.
        </li>
      </ul>
      <p>
        Holding a key is what makes you the sender or the recipient. There is no account and
        no login, so a schedule is reachable from any browser that can rebuild its key, and
        unreachable from any browser that cannot. <Link href="/docs/keys">Keys and recovery</Link>{' '}
        is the page that matters most here.
      </p>

      <h2>What it costs</h2>
      <p>
        The STRK20 pool charges {toStrk(POOL_FEE)} STRK for each private transaction, taken
        from your shielded balance, on top of the ordinary Starknet fee your wallet pays.
        Funding a schedule costs that once. Every withdrawal, cancel, transfer and sale costs
        it again.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>A Starknet wallet that supports STRK20 private balances. Nagare is built against Ready.</li>
        <li>Private balances turned on in that wallet.</li>
        <li>Enough shielded STRK to cover the amount you are vesting plus the pool fee.</li>
      </ul>
      <p>
        A recipient needs none of this on the day you set the schedule up. They need a wallet
        by the time they want to withdraw.
      </p>

      <h2>Read next</h2>
      <ul>
        <li>
          <Link href="/docs/sending">Sending tokens</Link> if you are the one funding a
          schedule.
        </li>
        <li>
          <Link href="/docs/receiving">Receiving tokens</Link> if someone sent you a claim
          link.
        </li>
        <li>
          <Link href="/docs/keys">Keys and recovery</Link> before you close the browser tab.
        </li>
        <li>
          <Link href="/docs/reference">Reference</Link> for the contract, the disclosure
          table, and what to do when something fails.
        </li>
      </ul>
    </>
  )
}
