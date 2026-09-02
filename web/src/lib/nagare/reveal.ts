import type { OpName } from './actions'

export const REVEAL: Record<string, string> = {
  Create:
    'The pool paid Nagare and the amount is public. Your wallet address is not in this transaction.',
  Withdraw:
    'Nagare paid the pool, and an open note of this amount exists. Which wallet owns that note is not on chain.',
  Cancel:
    'The refund amount and the time are public. Who cancelled, and which note the refund went to, are not.',
  Transfer:
    'The stream now answers to a different key. The old and new keys are public; the people behind them are not.',
  List: 'The stream is marked open to offers. That flag is public.',
  Offer: 'The price, the expiry and the buyer key are public. The buyer wallet is not.',
  Accept:
    'The position moved to a new key and the price landed in a private note. Neither party is named.',
  Reclaim: 'The escrow returned to a private note. The buyer wallet is not named.',
}

export function revealFor(op: OpName): string {
  return REVEAL[op] ?? ''
}

export const DISCLOSED = [
  'The total, token, start, cliff and end of every stream, and its id',
  'The sender key and recipient key, and every re-key',
  "Nagare's STRK balance, and what it owes across every stream",
  'The amount and time of every withdrawal, refund and sale',
  'Every offer price, expiry and buyer key',
  'Every signature and every calldata item, including note ids',
]

export const NOT_DISCLOSED = [
  'The wallet address that funded a stream',
  'The wallet address that receives it',
  'The wallet address that cancelled, transferred, listed, offered or accepted',
  'Which wallet owns the note a payout lands in',
]

export const HONEST_LIMITS = [
  'Shielding is public. Moving STRK into the pool puts your address and that amount on chain.',
  'Amounts and timing can be correlated. A distinctive amount withdrawn shortly after a distinctive deposit is a link.',
  'A key used for two streams links them, which is why every stream gets a fresh sender key.',
  'The pool charges 6 STRK for each private transaction, taken from your shielded balance.',
]
