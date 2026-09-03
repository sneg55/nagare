import { ec, hash, num, shortString } from 'starknet'
import { CHAIN_ID } from './config'
import type { Keypair } from './keys'

export const SEED_MESSAGE = {
  types: {
    StarknetDomain: [
      { name: 'name', type: 'shortstring' },
      { name: 'version', type: 'shortstring' },
      { name: 'chainId', type: 'shortstring' },
      { name: 'revision', type: 'shortstring' },
    ],
    NagareSeed: [
      { name: 'purpose', type: 'shortstring' },
      { name: 'grants', type: 'shortstring' },
      { name: 'where', type: 'shortstring' },
    ],
  },
  primaryType: 'NagareSeed',
  domain: { name: 'Nagare', version: '1', chainId: CHAIN_ID, revision: '1' },
  message: {
    purpose: 'Derive Nagare keys',
    grants: 'It controls your schedules',
    where: 'Sign only on Nagare',
  },
}

export const INVITE_INDEX_SPAN = 32
export const SENDER_SLOT_SPAN = 32

function felts(sig: unknown): string[] {
  const hex = (v: unknown) => num.toHex(BigInt(v as string))
  if (Array.isArray(sig)) return sig.map(hex)
  const pair = sig as { r?: unknown; s?: unknown }
  if (pair?.r !== undefined && pair?.s !== undefined) return [hex(pair.r), hex(pair.s)]
  throw new Error('That wallet returned a signature Nagare cannot read.')
}

export async function deriveSeed(sign: (message: unknown) => Promise<unknown>): Promise<string> {
  const parts = felts(await sign(SEED_MESSAGE))
  if (parts.length === 0) throw new Error('That wallet returned an empty signature.')
  return hash.computePoseidonHashOnElements(parts)
}

function keyFrom(raw: string): Keypair {
  const privateKey = num.toHex(BigInt(`0x${ec.starkCurve.grindKey(raw)}`))
  return { privateKey, publicKey: ec.starkCurve.getStarkKey(privateKey) }
}

export function keyForRecipient(seed: string, streamId: number): Keypair {
  return keyFrom(
    hash.computePoseidonHashOnElements([
      seed,
      shortString.encodeShortString('recipient'),
      num.toHex(streamId),
    ]),
  )
}

export function keyForOffer(seed: string, streamId: number, generation: string): Keypair {
  return keyFrom(
    hash.computePoseidonHashOnElements([
      seed,
      shortString.encodeShortString('offer'),
      num.toHex(streamId),
      num.toHex(BigInt(generation)),
    ]),
  )
}

export function keyForSender(seed: string, slot: number): Keypair {
  return keyFrom(
    hash.computePoseidonHashOnElements([
      seed,
      shortString.encodeShortString('sender-slot'),
      num.toHex(slot),
    ]),
  )
}

export function senderSlots(seed: string): Keypair[] {
  return Array.from({ length: SENDER_SLOT_SPAN }, (_, i) => keyForSender(seed, i))
}

export function freeSenderSlot(slots: Keypair[], taken: string[]): { slot: number; key: Keypair } {
  const used = new Set(taken.map((pk) => BigInt(pk)))
  const slot = slots.findIndex((k) => !used.has(BigInt(k.publicKey)))
  if (slot === -1) {
    throw new Error(
      `This wallet has opened ${SENDER_SLOT_SPAN} schedules, which is as many as one signature can rebuild.`,
    )
  }
  return { slot, key: slots[slot] }
}

export function keyForInvite(seed: string, index: number): Keypair {
  return keyFrom(
    hash.computePoseidonHashOnElements([
      seed,
      shortString.encodeShortString('invite'),
      num.toHex(index),
    ]),
  )
}

export function sameKey(a: string, b: string): boolean {
  return BigInt(a) === BigInt(b)
}
