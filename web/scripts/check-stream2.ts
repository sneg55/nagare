import { getStream, withdrawable } from '../src/lib/nagare/read'
async function main() {
  const now = Math.floor(Date.now() / 1000)
  for (const id of [1, 2]) {
    const s = await getStream(id)
    if (!s.exists) { console.log(id, 'absent'); continue }
    const vestedFrac = now >= s.end ? 1 : now < s.cliff ? 0 : (now - s.start) / (s.end - s.start)
    console.log(
      `stream ${id}: total=${s.total} withdrawn=${s.withdrawn} canceled=${s.canceled}`,
      `end=${s.end} now=${now}`,
      now >= s.end ? 'FULLY VESTED (cancel would revert)' : `${(vestedFrac * 100).toFixed(1)}% vested`,
      'withdrawable=' + (await withdrawable(id)).toString(),
    )
  }
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
