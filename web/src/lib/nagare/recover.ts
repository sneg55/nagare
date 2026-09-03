import { getStream, streamCount } from './read'
import { keyForInvite, keyForSchedule, sameKey, INVITE_INDEX_SPAN } from './derive'
import { saveKey } from './keys'
import { watch } from './watch'

export type Found = { id: number; role: 'sender' | 'recipient' }

const BATCH = 8

export async function recoverFromSeed(
  seed: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Found[]> {
  const total = await streamCount()
  const invites = Array.from({ length: INVITE_INDEX_SPAN }, (_, i) => keyForInvite(seed, i))
  const found: Found[] = []

  for (let from = 1; from <= total; from += BATCH) {
    const ids = []
    for (let id = from; id < from + BATCH && id <= total; id += 1) ids.push(id)
    const schedules = await Promise.all(ids.map((id) => getStream(id)))

    ids.forEach((id, i) => {
      const s = schedules[i]
      if (!s.exists) return

      const sender = keyForSchedule(seed, 'sender', id)
      if (sameKey(sender.publicKey, s.senderPk)) {
        saveKey(`stream:${id}:sender`, sender)
        watch(id)
        found.push({ id, role: 'sender' })
      }

      const recipient = keyForSchedule(seed, 'recipient', id)
      const invite = invites.find((k) => sameKey(k.publicKey, s.recipientPk))
      const match = sameKey(recipient.publicKey, s.recipientPk) ? recipient : invite
      if (match) {
        saveKey(`stream:${id}:recipient`, match)
        watch(id)
        found.push({ id, role: 'recipient' })
      }
    })

    onProgress?.(Math.min(from + BATCH - 1, total), total)
  }

  return found
}
