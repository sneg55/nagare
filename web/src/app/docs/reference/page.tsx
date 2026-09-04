import { DISCLOSED, NOT_DISCLOSED, HONEST_LIMITS } from '@/lib/nagare/reveal'
import { NAGARE_PADDED, VOYAGER, MAX_OFFER_HOURS } from '@/lib/nagare/config'
import { NO_CANCEL_KEY } from '@/lib/nagare/cancelable'

export const metadata = {
  title: 'Nagare docs: reference',
  description: 'Contract operations, the disclosure table, selling a schedule, and error messages.',
}

const OPS: [string, string][] = [
  ['Create', 'Funds a schedule. The pool pays Nagare and the terms are written on chain.'],
  ['Withdraw', 'Pays the recipient what has vested, into a private note. Recipient key.'],
  ['Cancel', 'Returns whatever has not vested to the sender, privately. Sender key.'],
  ['Transfer', 'Moves the schedule to a different recipient key. Recipient key.'],
  ['List', 'Marks the schedule open to offers, or takes it off. Recipient key.'],
  ['Offer', 'Escrows a price against a listed schedule under a buyer key.'],
  ['Accept', 'Moves the schedule to the buyer and pays the holder, in one call. Recipient key.'],
  ['Reclaim', 'Returns an escrowed offer to the buyer. Buyer key.'],
]

export default function Reference() {
  return (
    <>
      <div className="stack-tight">
        <h1>Reference</h1>
        <p className="lead">
          The contract, what it publishes, how a sale works, and what the error messages mean.
        </p>
      </div>

      <h2 id="contract">Contract</h2>
      <p>
        Nagare is deployed once on Starknet mainnet, with no owner, no pause and no upgrade
        path. Nobody can change its behaviour, including its authors. It has not been audited.
      </p>
      <p>
        <code>{NAGARE_PADDED}</code>
      </p>
      <p>
        <a href={`${VOYAGER}/contract/${NAGARE_PADDED}`} target="_blank" rel="noreferrer">
          Read it on Voyager
        </a>
      </p>

      <h2 id="operations">Operations</h2>
      <p>
        All eight run through the STRK20 pool, which is the only caller the contract accepts.
        Each is authorized by an ECDSA signature over the operation, bound to the chain, the
        contract, the schedule, the note being paid into and a nonce, so a signature cannot be
        replayed on another schedule, another chain or a second time.
      </p>
      <dl className="docs-dl">
        {OPS.map(([op, what]) => (
          <div key={op}>
            <dt>{op}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>

      <h2 id="uncancelable">Verifying an uncancelable schedule</h2>
      <p>
        An uncancelable schedule stores a published constant where the sender key would be. It
        is the Poseidon hash of the short string <code>NAGARE_NO_CANCEL</code>, which is not a
        point on the Stark curve, so no private key for it exists and no signature can satisfy
        a cancel.
      </p>
      <p>
        <code>{NO_CANCEL_KEY}</code>
      </p>
      <p>
        Read <code>get_stream</code> for the schedule and compare its sender key against that
        value. It is identical on every uncancelable schedule, which is also the one way this
        leaks something: an uncancelable schedule is publicly identifiable as one.
      </p>

      <h2 id="selling">Selling a schedule</h2>
      <p>
        A recipient can open their schedule to offers from the gear on its page, which lists it
        on the <a href="/app/market">Marketplace</a>. A buyer escrows a price against it under
        a key derived from their own wallet, for up to {MAX_OFFER_HOURS} hours. Accepting moves
        the schedule to the buyer&rsquo;s key and pays the holder in the same call. A buyer can
        reclaim their escrow at any point before it is accepted.
      </p>
      <p>
        Two rules protect the buyer. An offer can only be accepted while the amount already
        withdrawn matches what it was when the offer was made, so a holder cannot withdraw and
        then sell the emptied schedule. And a live offer blocks a transfer, so the schedule
        cannot be moved elsewhere while a price is standing against it.
      </p>
      <p>
        This path is implemented end to end and has not been exercised on mainnet. No offer has
        been placed against any schedule on the deployed contract.
      </p>

      <h2 id="disclosure">What the chain records</h2>
      <div className="two-cols">
        <div className="stack-tight">
          <h3>Never published</h3>
          <ul>
            {NOT_DISCLOSED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="stack-tight">
          <h3>Public on chain</h3>
          <ul>
            {DISCLOSED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <h2 id="limits">What Nagare does not claim</h2>
      <ul>
        {HONEST_LIMITS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>
        The claim is that no wallet address of either party appears in any Nagare transaction.
        Amounts, dates and keys are public by design, and correlation between a deposit and a
        withdrawal is a real risk that Nagare does not remove.
      </p>

      <h2 id="errors">When something fails</h2>
      <dl className="docs-dl">
        <div>
          <dt>Private balances are off in your wallet</dt>
          <dd>
            Turn on STRK20 private balances in Ready, then reload. Nagare cannot move anything
            until the pool knows your wallet.
          </dd>
        </div>
        <div>
          <dt>The pool charges more than you have shielded</dt>
          <dd>Shield more STRK in your wallet. Every Nagare operation costs the pool fee.</dd>
        </div>
        <div>
          <dt>Your wallet did not approve this</dt>
          <dd>
            The prompt was rejected, or the wallet lacked the fee. Both are safe to retry, and
            nothing was sent.
          </dd>
        </div>
        <div>
          <dt>The wallet changed the note it would pay into</dt>
          <dd>
            The signature is bound to a specific note, so Nagare refuses rather than sending a
            payment it cannot prove. Try again.
          </dd>
        </div>
        <div>
          <dt>The wallet rejected the shape of this transaction</dt>
          <dd>
            Usually a wallet version that does not support the operation. Update it, and report
            it if it persists.
          </dd>
        </div>
        <div>
          <dt>An operation went to your wallet and has not come back</dt>
          <dd>
            Approve or reject it in the wallet, then retry. Nagare holds one operation per
            schedule at a time so a second one cannot be sent by accident.
          </dd>
        </div>
        <div>
          <dt>You hold no key for this schedule</dt>
          <dd>
            Connect the wallet that opened it, or open the claim link that carries the recipient
            key. Everything on the page is public and readable without either.
          </dd>
        </div>
      </dl>
    </>
  )
}
