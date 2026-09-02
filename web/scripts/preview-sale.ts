import { offerStatusOf, canList } from '../src/lib/nagare/status'
import type { Stream, Offer } from '../src/lib/nagare/read'

const now = Math.floor(Date.now() / 1000)
const live: Stream = {
  token: '0x1', total: 10n ** 18n, withdrawn: 0n, refunded: 0n,
  start: now - 3600, cliff: now - 60, end: now + 86400 * 30,
  senderPk: '0x1', recipientPk: '0x2', canceled: false, nonce: '0x0',
  sellable: true, exists: true,
}
const noOffer: Offer = { buyerPk: '0x0', price: 0n, expiry: 0, generation: 0n, withdrawnAtOffer: 0n, live: false }
const liveOffer: Offer = { buyerPk: '0x9', price: 5n * 10n ** 18n, expiry: now + 7200, generation: 1n, withdrawnAtOffer: 0n, live: true }
const expired: Offer = { ...liveOffer, expiry: now - 60 }

console.log('listable stream, no offer  -> canList', canList(live, now), '| offer status', offerStatusOf(noOffer, now))
console.log('listable stream, live offer-> status', offerStatusOf(liveOffer, now))
console.log('listable stream, expired   -> status', offerStatusOf(expired, now))
console.log('unsellable stream          -> canList', canList({ ...live, sellable: false, canceled: true }, now))
