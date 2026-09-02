import { signingHash, SIG_DOMAIN } from '../src/lib/nagare/actions'

const VECTOR = {
  chainId: '0x534e5f4d41494e',
  contract: '0x04d1e2b3c4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
  streamId: 7,
  op: 'Withdraw' as const,
  noteId: '0x55',
  arg: 0,
  nonce: 3,
}
const PINNED_IN_CAIRO = '0x1cdc8e5efc46c0ea1cca695a1954a4c9a5a23907ceb795e9c720a3786e38b4c'
const PINNED_DOMAIN = '0x4e41474152455f5349473a5631'

const failures: string[] = []

if (SIG_DOMAIN !== PINNED_DOMAIN) {
  failures.push(`domain felt is ${SIG_DOMAIN}, Cairo has ${PINNED_DOMAIN}`)
}

const got = signingHash(VECTOR)
if (BigInt(got) !== BigInt(PINNED_IN_CAIRO)) {
  failures.push(`message hash is ${got}, the Cairo test pins ${PINNED_IN_CAIRO}`)
}

if (failures.length) {
  for (const f of failures) console.error('FAIL:', f)
  process.exit(1)
}
console.log('signature serialization matches tests/test_nagare.cairo')
