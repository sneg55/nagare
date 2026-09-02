import { RpcProvider } from 'starknet'
import { POOL } from '../src/lib/nagare/config'
const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo'
async function main() {
  const p = new RpcProvider({ nodeUrl: RPC })
  for (const ep of ['get_fee_amount', 'fee_amount', 'get_fee_collector', 'get_fee_token']) {
    try {
      const r = await p.callContract({ contractAddress: POOL, entrypoint: ep, calldata: [] })
      console.log(ep, '->', r, ep.includes('amount') ? `(${Number(BigInt(r[0])) / 1e18} STRK)` : '')
    } catch (e) {
      console.log(ep, '-> not callable')
    }
  }
}
main().catch((e) => { console.error(e.message); process.exit(1) })
