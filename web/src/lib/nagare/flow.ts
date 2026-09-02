import type { WALLET_API } from '@starknet-io/types-js'
import {
  invokeCalldata,
  payoutActions,
  resolveNoteId,
  signPayout,
  OPEN_NOTE_PLACEHOLDER,
  type PayoutParams,
} from './actions'
import type { Stream } from './read'

export type PrepareFn = (actions: WALLET_API.STRK20_ACTION[]) => Promise<string[]>

export async function buildPayout(
  op: PayoutParams['op'],
  stream: Stream,
  streamId: number,
  privateKey: string,
  recipientAddress: string,
  prepare: PrepareFn,
): Promise<WALLET_API.STRK20_ACTION[]> {
  const probeOf = (sig?: [string, string]) =>
    invokeCalldata({ op, streamId, noteId: OPEN_NOTE_PLACEHOLDER, sig })

  const params: PayoutParams = { op, streamId, recipientAddress }
  const first = await prepare(payoutActions(params))
  const noteId = resolveNoteId(first, probeOf())

  const sig = signPayout(privateKey, {
    streamId,
    op,
    noteId,
    streamNonce: stream.nonce,
  })

  const signed = payoutActions({ ...params, sig })
  const second = await prepare(signed)
  if (BigInt(resolveNoteId(second, probeOf(sig))) !== BigInt(noteId)) {
    throw new Error('the wallet changed the note id between checks')
  }
  return signed
}
