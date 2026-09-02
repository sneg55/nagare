import { ec, hash, shortString } from 'starknet'

const SIG_DOMAIN = shortString.encodeShortString('NAGARE_SIG:V1')

const OP = {
  Create: 0,
  Withdraw: 1,
  Cancel: 2,
  Transfer: 3,
  Offer: 4,
  Accept: 5,
  Reclaim: 6,
}

export function signingHash({ chainId, contract, streamId, op, noteId, arg, nonce }) {
  return hash.computePoseidonHashOnElements([
    SIG_DOMAIN,
    chainId,
    contract,
    streamId,
    OP[op],
    noteId,
    arg,
    nonce,
  ])
}

const vector = {
  chainId: shortString.encodeShortString('SN_MAIN'),
  contract: '0x04d1e2b3c4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
  streamId: 7,
  op: 'Withdraw',
  noteId: '0x55',
  arg: 0,
  nonce: 3,
}

const privateKey = '0x1234567890987654321'
const publicKey = ec.starkCurve.getStarkKey(privateKey)
const messageHash = signingHash(vector)
const signature = ec.starkCurve.sign(messageHash, privateKey)

console.log(
  JSON.stringify(
    {
      ...vector,
      domain: SIG_DOMAIN,
      publicKey,
      messageHash,
      r: '0x' + signature.r.toString(16),
      s: '0x' + signature.s.toString(16),
    },
    null,
    2,
  ),
)
