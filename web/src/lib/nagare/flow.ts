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
  generation?: bigint,
): Promise<WALLET_API.STRK20_ACTION[]> {
  const arg = generation === undefined ? undefined : generation.toString()
  const probe = invokeCalldata({ op, streamId, arg, noteId: OPEN_NOTE_PLACEHOLDER })

  const params: PayoutParams = { op, streamId, arg, recipientAddress }
  const prepared = await prepare(payoutActions(params))
  const noteId = resolveNoteId(prepared, probe)

  const sig = signPayout(privateKey, {
    streamId,
    op,
    noteId,
    arg,
    streamNonce: stream.nonce,
  })

  return payoutActions({ ...params, sig })
}
