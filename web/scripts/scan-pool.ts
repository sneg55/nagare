import { RpcProvider } from 'starknet'
import { NAGARE } from '../src/lib/nagare/config'

const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo'

async function main() {
  const p = new RpcProvider({ nodeUrl: RPC })
  const latest = (await p.getBlockWithTxHashes('latest')).block_number
  const blocks = Array.from({ length: 300 }, (_, i) => latest - i)
  const found: { hash: string; status: string; reason?: string }[] = []
  let idx = 0
  async function worker() {
    while (idx < blocks.length) {
      const n = blocks[idx++]
      try {
        const b = await p.getBlockWithTxs(n)
        for (const t of b.transactions as unknown as { transaction_hash: string; calldata?: string[] }[]) {
          const touches = (t.calldata ?? []).some((c) => {
            try { return BigInt(c) === BigInt(NAGARE) } catch { return false }
          })
          if (!touches) continue
          const r = (await p.getTransactionReceipt(t.transaction_hash)) as unknown as {
            execution_status?: string
            revert_reason?: string
          }
          found.push({ hash: t.transaction_hash, status: r.execution_status ?? '?', reason: r.revert_reason })
        }
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker))
  console.log('transactions mentioning Nagare in the last 300 blocks:', found.length)
  for (const f of found) {
    console.log(' ', f.hash, f.status)
    if (f.reason) console.log('    ', f.reason.replace(/\s+/g, ' ').slice(0, 500))
  }
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
