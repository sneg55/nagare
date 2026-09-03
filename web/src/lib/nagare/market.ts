import { getOffer, getStream, streamCount, type Offer, type Stream } from './read'
import { canList } from './status'

export type Listing = { id: number; schedule: Stream; offer: Offer }

const BATCH = 8

export async function listedSchedules(
  now: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Listing[]> {
  const total = await streamCount()
  const found: Listing[] = []

  for (let from = 1; from <= total; from += BATCH) {
    const ids: number[] = []
    for (let id = from; id < from + BATCH && id <= total; id += 1) ids.push(id)
    const schedules = await Promise.all(ids.map((id) => getStream(id)))

    const open = ids
      .map((id, i) => ({ id, schedule: schedules[i] }))
      .filter(({ schedule }) => schedule.exists && schedule.sellable && canList(schedule, now))

    const offers = await Promise.all(open.map(({ id }) => getOffer(id)))
    open.forEach(({ id, schedule }, i) => found.push({ id, schedule, offer: offers[i] }))

    onProgress?.(Math.min(from + BATCH - 1, total), total)
  }

  return found
}
