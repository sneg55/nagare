import type { OpName } from './actions'

export const REVEAL: Record<string, string> = {
  Create:
    'The chain records the pool paying Nagare, and the amount. Your own wallet address appears nowhere in the transaction.',
  Withdraw:
    'Nagare paid the pool, so an open note of this amount now exists. Voyager shows that the note exists and cannot show which wallet owns it.',
  Cancel:
    'The refund amount and the time it happened both go on chain. Voyager cannot show you who cancelled, or which note took the refund.',
  Transfer:
    'The schedule now answers to a different key. Both keys are on chain, and a key says nothing about the person holding it.',
  List: 'The schedule is marked open to offers, and that flag is public.',
  Offer:
    'The price, the expiry and the buyer key all go on chain. The wallet behind that key stays inside the pool.',
  Accept:
    'The schedule moved to a new key and the price landed in a private note. Voyager records a key on each side of the trade and nothing about the two people.',
  Reclaim:
    'The escrow returned to a private note. Anyone can read the refund off the contract without learning whose wallet it reached.',
}

export function revealFor(op: OpName): string {
  return REVEAL[op] ?? ''
}

export const DISCLOSED = [
  'The total, token, start, cliff and end of every schedule, and its id',
  'The sender key and recipient key, and every re-key',
  "Nagare's STRK balance, and what it owes across every schedule",
  'The amount and time of every withdrawal, refund and sale',
  'Every offer price, expiry and buyer key',
  'Every signature and every calldata item, including note ids',
]

export const NOT_DISCLOSED = [
  'The wallet address that funded a schedule',
  'The wallet address that receives it',
  'The wallet address that cancelled, transferred, listed, offered or accepted',
  'Which wallet owns the note a payout lands in',
]

export const HONEST_LIMITS = [
  'Moving STRK into the pool is a public transaction that puts your address and the amount on chain.',
  'Amounts and timing can be correlated: a distinctive amount withdrawn shortly after a distinctive deposit is a link.',
  'A key used for two schedules links them, which is why every schedule gets a fresh sender key.',
  'The pool charges 6 STRK for each private transaction, taken from your shielded balance.',
]
