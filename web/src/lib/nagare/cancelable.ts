import { hash, num, shortString } from 'starknet'

export const NO_CANCEL_KEY = num.toHex(
  hash.computePoseidonHashOnElements([shortString.encodeShortString('NAGARE_NO_CANCEL')]),
)

export function isUncancelable(s: { senderPk: string }): boolean {
  return BigInt(s.senderPk) === BigInt(NO_CANCEL_KEY)
}
