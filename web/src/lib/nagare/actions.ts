import { hash, num, shortString } from 'starknet'
import type { WALLET_API } from '@starknet-io/types-js'
import { CHAIN_ID, NAGARE, STRK } from './config'
import { signHash } from './keys'

export const SIG_DOMAIN = shortString.encodeShortString('NAGARE_SIG:V1')
export const CHAIN_ID_FELT = shortString.encodeShortString(CHAIN_ID)

export const Op = {
  Create: 0,
  Withdraw: 1,
  Cancel: 2,
  Transfer: 3,
  Offer: 4,
  Accept: 5,
  Reclaim: 6,
  List: 7,
} as const

export type OpName = keyof typeof Op

export type SigningInput = {
  chainId: string
  contract: string
  streamId: bigint | number
  op: OpName
  noteId: string
  arg: string | bigint | number
  nonce: string | bigint | number
}

export function signingHash(input: SigningInput): string {
  return hash.computePoseidonHashOnElements([
    SIG_DOMAIN,
    input.chainId,
    input.contract,
    num.toHex(BigInt(input.streamId)),
    num.toHex(BigInt(Op[input.op])),
    input.noteId,
    num.toHex(BigInt(input.arg)),
    num.toHex(BigInt(input.nonce)),
  ])
}

const ZERO = '0x0'
export const OPEN_NOTE_PLACEHOLDER = '${openNoteIds[0]}'
const NOTE_SLOT = 10
const CALLDATA_LEN = 13

export type InvokeFields = {
  op: OpName
  streamId?: bigint | number
  token?: string
  total?: bigint | number
  start?: bigint | number
  cliff?: bigint | number
  end?: bigint | number
  senderPk?: string
  recipientPk?: string
  arg?: string | bigint | number
  noteId?: string
  sig?: [string, string]
}

export function invokeCalldata(f: InvokeFields): string[] {
  const felt = (v: string | bigint | number | undefined) =>
    v === undefined ? ZERO : num.toHex(BigInt(v))
  return [
    num.toHex(Op[f.op]),
    felt(f.streamId),
    felt(f.token),
    felt(f.total),
    felt(f.start),
    felt(f.cliff),
    felt(f.end),
    felt(f.senderPk),
    felt(f.recipientPk),
    felt(f.arg),
    f.noteId === undefined ? ZERO : f.noteId === OPEN_NOTE_PLACEHOLDER ? f.noteId : num.toHex(BigInt(f.noteId)),
    felt(f.sig?.[0]),
    felt(f.sig?.[1]),
  ]
}

export type CreateParams = {
  total: bigint
  start: number
  cliff: number
  end: number
  senderPk: string
  recipientPk: string
}

export function createActions(p: CreateParams): WALLET_API.STRK20_ACTION[] {
  return [
    { type: 'withdraw', token: STRK, amount: num.toHex(p.total), recipient: NAGARE },
    {
      type: 'invoke',
      contract: NAGARE,
      calldata: invokeCalldata({
        op: 'Create',
        token: STRK,
        total: p.total,
        start: p.start,
        cliff: p.cliff,
        end: p.end,
        senderPk: p.senderPk,
        recipientPk: p.recipientPk,
      }),
    },
  ]
}

export type PayoutParams = {
  op: 'Withdraw' | 'Cancel' | 'Accept' | 'Reclaim'
  streamId: bigint | number
  arg?: string | bigint | number
  recipientAddress: string
  noteId?: string
  sig?: [string, string]
}

export function payoutActions(p: PayoutParams): WALLET_API.STRK20_ACTION[] {
  return [
    { type: 'transfer', token: STRK, amount: 'OPEN', recipient: p.recipientAddress },
    {
      type: 'invoke',
      contract: NAGARE,
      calldata: invokeCalldata({
        op: p.op,
        streamId: p.streamId,
        arg: p.arg,
        noteId: p.noteId ?? OPEN_NOTE_PLACEHOLDER,
        sig: p.sig,
      }),
    },
  ]
}

export function keyedActions(
  op: 'Transfer' | 'List',
  streamId: bigint | number,
  arg: string | bigint | number,
  sig?: [string, string],
): WALLET_API.STRK20_ACTION[] {
  return [
    {
      type: 'invoke',
      contract: NAGARE,
      calldata: invokeCalldata({ op, streamId, arg, sig }),
    },
  ]
}

export function offerActions(
  streamId: bigint | number,
  buyerPk: string,
  price: bigint,
  expiry: number,
): WALLET_API.STRK20_ACTION[] {
  return [
    { type: 'withdraw', token: STRK, amount: num.toHex(price), recipient: NAGARE },
    {
      type: 'invoke',
      contract: NAGARE,
      calldata: invokeCalldata({ op: 'Offer', streamId, total: price, end: expiry, arg: buyerPk }),
    },
  ]
}

export class NoteIdNotFound extends Error {
  constructor() {
    super('could not find the Nagare call inside the prepared transaction')
  }
}

export function resolveNoteId(preparedCalldata: string[], probe: string[]): string {
  const felts = preparedCalldata.map((v) => BigInt(v))
  const want = probe.map((v) => (v === OPEN_NOTE_PLACEHOLDER ? 0n : BigInt(v)))
  const matches: number[] = []

  for (let i = 0; i + CALLDATA_LEN <= felts.length; i++) {
    let ok = true
    for (let j = 0; j < CALLDATA_LEN; j++) {
      if (j === NOTE_SLOT) continue
      if (felts[i + j] !== want[j]) {
        ok = false
        break
      }
    }
    if (ok) matches.push(i)
  }

  if (matches.length === 0) throw new NoteIdNotFound()
  const anchored = matches.find((i) => i > 0 && felts[i - 1] === BigInt(CALLDATA_LEN))
  return num.toHex(felts[(anchored ?? matches[0]) + NOTE_SLOT])
}

export const OFFER_FAMILY: ReadonlySet<string> = new Set(['Offer', 'Accept', 'Reclaim'])

export function nonceFor(op: OpName, streamNonce: string | bigint | number): bigint {
  return OFFER_FAMILY.has(op) ? 0n : BigInt(streamNonce)
}

export function signPayout(
  privateKey: string,
  p: { streamId: bigint | number; op: PayoutParams['op']; noteId: string; arg?: string | bigint | number; streamNonce: string | bigint | number },
): [string, string] {
  return signHash(
    privateKey,
    signingHash({
      chainId: CHAIN_ID_FELT,
      contract: NAGARE,
      streamId: p.streamId,
      op: p.op,
      noteId: p.noteId,
      arg: p.arg ?? 0,
      nonce: nonceFor(p.op, p.streamNonce),
    }),
  )
}

export function signKeyed(
  privateKey: string,
  p: { streamId: bigint | number; op: 'Transfer' | 'List'; arg: string | bigint | number; streamNonce: string | bigint | number },
): [string, string] {
  return signHash(
    privateKey,
    signingHash({
      chainId: CHAIN_ID_FELT,
      contract: NAGARE,
      streamId: p.streamId,
      op: p.op,
      noteId: '0x0',
      arg: p.arg,
      nonce: nonceFor(p.op, p.streamNonce),
    }),
  )
}
