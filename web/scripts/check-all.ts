import { getStream, streamCount, liability, withdrawable } from '../src/lib/nagare/read'
async function main() {
  const n = await streamCount()
  const now = Math.floor(Date.now() / 1000)
  console.log('stream_count', n, ' liability', (await liability()).toString())
  for (let i = 1; i <= n; i++) {
    const s = await getStream(i)
    console.log(
      `stream ${i}: total=${s.total} withdrawn=${s.withdrawn} refunded=${s.refunded}`,
      `cliff=${s.cliff} end=${s.end}`,
      now >= s.end ? 'fully vested' : `cancellable for ${s.end - now}s`,
      `recipientPk=${s.recipientPk.slice(0, 14)}…`,
      `withdrawable=${(await withdrawable(i)).toString()}`,
    )
  }
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
