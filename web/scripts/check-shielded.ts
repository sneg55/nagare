import { RpcProvider } from 'starknet'
import { POOL, STRK, NAGARE } from '../src/lib/nagare/config'
const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo'
async function main() {
  const p = new RpcProvider({ nodeUrl: RPC })
  const fee = BigInt((await p.callContract({ contractAddress: POOL, entrypoint: 'get_fee_amount', calldata: [] }))[0])
  const shielded = 4000000000000000000n
  console.log('pool fee per private tx :', Number(fee) / 1e18, 'STRK')
  console.log('your shielded balance   :', Number(shielded) / 1e18, 'STRK')
  console.log('Cancel needs            : fee only (the refund is paid by Nagare, not you)')
  console.log(shielded >= fee ? 'ENOUGH' : `SHORT by ${Number(fee - shielded) / 1e18} STRK`)
  const r = await p.callContract({ contractAddress: STRK, entrypoint: 'balanceOf', calldata: [NAGARE] })
  console.log('Nagare holds            :', Number(BigInt(r[0])) / 1e18, 'STRK (covers every stream)')
}
main().catch((e) => { console.error(e.message); process.exit(1) })
