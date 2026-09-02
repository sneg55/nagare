import { streamCount, liability, chainId, getStream } from '../src/lib/nagare/read'
import { NAGARE } from '../src/lib/nagare/config'

async function main() {
  console.log('contract  ', NAGARE)
  console.log('chain_id  ', await chainId())
  console.log('streams   ', await streamCount())
  console.log('liability ', (await liability()).toString())
  const s = await getStream(1)
  console.log('stream 1 exists:', s.exists)
}

main().catch((e) => {
  console.error('FAILED', e.message)
  process.exit(1)
})
