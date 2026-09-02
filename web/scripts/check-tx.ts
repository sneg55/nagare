import { RpcProvider } from 'starknet'
import { NAGARE, POOL } from '../src/lib/nagare/config'

const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo'
const tx = process.argv[2]

async function main() {
  const p = new RpcProvider({ nodeUrl: RPC })
  const status = await p.getTransactionStatus(tx)
  console.log('status:', JSON.stringify(status))
  const r = (await p.getTransactionReceipt(tx)) as unknown as {
    events?: { from_address: string; keys: string[]; data: string[] }[]
    execution_status?: string
    revert_reason?: string
  }
  if (r.revert_reason) console.log('revert:', r.revert_reason)
  const events = r.events ?? []
  console.log('events:', events.length)
  let pool = 0
  let ours = 0
  for (const e of events) {
    const from = BigInt(e.from_address)
    if (from === BigInt(POOL)) pool++
    if (from === BigInt(NAGARE)) {
      ours++
      console.log('  NAGARE event keys', e.keys, 'data', e.data)
    }
  }
  console.log('pool events:', pool, ' nagare events:', ours)
}

main().catch((e) => {
  console.error('FAILED', e.message)
  process.exit(1)
})
