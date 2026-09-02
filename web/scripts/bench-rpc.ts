import { RpcProvider } from 'starknet'
import { NAGARE, STRK } from '../src/lib/nagare/config'

const ENDPOINTS: Record<string, string> = {
  'lava (current)': 'https://rpc.starknet.lava.build',
  'alchemy demo v0_10': 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo',
  'alchemy demo v0_9': 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/demo',
}

async function timeCall(p: RpcProvider, fn: () => Promise<unknown>): Promise<number | null> {
  const t = Date.now()
  try {
    await fn()
    return Date.now() - t
  } catch {
    return null
  }
}

async function main() {
  for (const [name, url] of Object.entries(ENDPOINTS)) {
    const p = new RpcProvider({ nodeUrl: url })
    const single: number[] = []
    for (let i = 0; i < 3; i++) {
      const ms = await timeCall(p, () =>
        p.callContract({ contractAddress: NAGARE, entrypoint: 'stream_count', calldata: [] }),
      )
      if (ms !== null) single.push(ms)
    }
    if (single.length === 0) {
      console.log(name.padEnd(20), 'unreachable')
      continue
    }
    const avg = Math.round(single.reduce((a, b) => a + b, 0) / single.length)

    const t = Date.now()
    await Promise.all(
      [1, 2, 3, 4, 5].map((id) =>
        p.callContract({ contractAddress: NAGARE, entrypoint: 'get_stream', calldata: ['0x' + id.toString(16)] }),
      ),
    ).catch(() => {})
    const five = Date.now() - t

    console.log(
      name.padEnd(20),
      `single avg ${String(avg).padStart(5)}ms`,
      `| 5 streams in parallel ${String(five).padStart(5)}ms`,
    )
  }
  void STRK
}
main().catch((e) => console.error(e.message))
