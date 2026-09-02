import { RpcProvider } from 'starknet'
import { getStream, liability, streamCount } from '../src/lib/nagare/read'
import { NAGARE, STRK, RPC_URL } from '../src/lib/nagare/config'

async function main() {
  const p = new RpcProvider({ nodeUrl: RPC_URL })
  const n = await streamCount()
  let unsettled = 0n
  for (let i = 1; i <= n; i++) {
    const s = await getStream(i)
    const rest = s.total - s.withdrawn - s.refunded
    console.log(`stream ${i}: total=${s.total} withdrawn=${s.withdrawn} refunded=${s.refunded} unsettled=${rest}`)
    unsettled += rest
  }
  const owed = await liability()
  const r = await p.callContract({ contractAddress: STRK, entrypoint: 'balanceOf', calldata: [NAGARE] })
  const held = BigInt(r[0]) + (BigInt(r[1]) << 128n)
  console.log('sum unsettled principal:', unsettled.toString())
  console.log('liability ledger       :', owed.toString())
  console.log('STRK actually held     :', held.toString())
  console.log(unsettled === owed ? 'LEDGER MATCHES the streams' : 'LEDGER DRIFT')
  console.log(held >= owed ? 'SOLVENT' : 'INSOLVENT')
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
