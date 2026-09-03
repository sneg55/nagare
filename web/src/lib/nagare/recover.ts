import { getStream, streamCount } from './read'
import { keyForInvite, keyForRecipient, sameKey, senderSlots, INVITE_INDEX_SPAN } from './derive'
import { saveRole } from './roles'
import { watch } from './watch'

export type Found = { id: number; role: 'sender' | 'recipient' }

const BATCH = 8

export async function recoverFromSeed(
  seed: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Found[]> {
  const total = await streamCount()
  const invites = Array.from({ length: INVITE_INDEX_SPAN }, (_, i) => keyForInvite(seed, i))
  const senders = senderSlots(seed)
  const found: Found[] = []

  for (let from = 1; from <= total; from += BATCH) {
    const ids = []
    for (let id = from; id < from + BATCH && id <= total; id += 1) ids.push(id)
    const schedules = await Promise.all(ids.map((id) => getStream(id)))

    ids.forEach((id, i) => {
      const s = schedules[i]
      if (!s.exists) return

      const slot = senders.findIndex((k) => sameKey(k.publicKey, s.senderPk))
      if (slot !== -1) {
        saveRole(`stream:${id}:sender`, {
          publicKey: senders[slot].publicKey,
          source: { kind: 'sender-slot', slot },
        })
        watch(id)
        found.push({ id, role: 'sender' })
      }

      const recipient = keyForRecipient(seed, id)
      const inviteIndex = invites.findIndex((k) => sameKey(k.publicKey, s.recipientPk))
      if (sameKey(recipient.publicKey, s.recipientPk)) {
        saveRole(`stream:${id}:recipient`, {
          publicKey: recipient.publicKey,
          source: { kind: 'recipient', streamId: id },
        })
        watch(id)
        found.push({ id, role: 'recipient' })
      } else if (inviteIndex !== -1) {
        saveRole(`stream:${id}:recipient`, {
          publicKey: invites[inviteIndex].publicKey,
          source: { kind: 'invite', index: inviteIndex },
        })
        watch(id)
        found.push({ id, role: 'recipient' })
      }
    })

    onProgress?.(Math.min(from + BATCH - 1, total), total)
  }

  return found
}

export async function usedSenderKeys(): Promise<string[]> {
  const total = await streamCount()
  const keys: string[] = []
  for (let from = 1; from <= total; from += BATCH) {
    const ids: number[] = []
    for (let id = from; id < from + BATCH && id <= total; id += 1) ids.push(id)
    const schedules = await Promise.all(ids.map((id) => getStream(id)))
    schedules.forEach((s) => {
      if (s.exists) keys.push(s.senderPk)
    })
  }
  return keys
}

export async function findCreated(
  countBefore: number,
  senderPk: string,
  recipientPk: string,
): Promise<number | null> {
  const total = await streamCount()
  for (let id = countBefore + 1; id <= total; id += 1) {
    const s = await getStream(id)
    if (s.exists && sameKey(s.senderPk, senderPk) && sameKey(s.recipientPk, recipientPk)) return id
  }
  return null
}
