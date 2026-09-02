import { getStream, withdrawable, liability } from '../src/lib/nagare/read'

async function main() {
  const s = await getStream(1)
  const now = Math.floor(Date.now() / 1000)
  console.log('exists      ', s.exists)
  console.log('total       ', s.total.toString())
  console.log('start/cliff/end', s.start, s.cliff, s.end)
  console.log('now         ', now, now < s.cliff ? `(cliff in ${s.cliff - now}s)` : '(past cliff)')
  console.log('senderPk    ', s.senderPk)
  console.log('recipientPk ', s.recipientPk)
  console.log('nonce       ', s.nonce, 'canceled', s.canceled, 'sellable', s.sellable)
  console.log('withdrawable', (await withdrawable(1)).toString())
  console.log('liability   ', (await liability()).toString())
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
