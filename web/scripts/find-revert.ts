import { RpcProvider } from 'starknet'
import { NAGARE, POOL } from '../src/lib/nagare/config'

const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo'
const GOOD = '0x3548a481c1e3f948805fa353438bf4d6cbfc5c73712ec515391461fcd4d3b3e'

async function main() {
  const p = new RpcProvider({ nodeUrl: RPC })
  const good = (await p.getTransaction(GOOD)) as unknown as { sender_address?: string }
  const sender = good.sender_address
  console.log('submitter of the working Create:', sender)

  const latest = (await p.getBlockWithTxHashes('latest')).block_number
  console.log('scanning back from block', latest)

  const hits: string[] = []
  const blocks = Array.from({ length: 260 }, (_, i) => latest - i)
  let idx = 0
  async function worker() {
    while (idx < blocks.length) {
      const n = blocks[idx++]
      try {
        const b = await p.getBlockWithTxs(n)
        for (const t of b.transactions as unknown as { sender_address?: string; transaction_hash: string; calldata?: string[] }[]) {
          if (!t.sender_address || BigInt(t.sender_address) !== BigInt(sender!)) continue
          const touchesUs = (t.calldata ?? []).some((c) => {
            try { return BigInt(c) === BigInt(NAGARE) } catch { return false }
          })
          if (touchesUs) hits.push(t.transaction_hash)
        }
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: 10 }, worker))

  console.log('transactions from that submitter mentioning Nagare:', hits.length)
  for (const h of hits) {
    const r = (await p.getTransactionReceipt(h)) as unknown as {
      execution_status?: string
      revert_reason?: string
    }
    console.log(' ', h, r.execution_status, r.revert_reason ? '\n    revert: ' + r.revert_reason.replace(/\s+/g, ' ').slice(0, 400) : '')
  }
  void POOL
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
