import type { Stream, Offer } from './read'
import { isUncancelable } from './cancelable'

export type StreamStatus =
  | 'canceled-settled'
  | 'canceled-claimable'
  | 'depleted'
  | 'vested'
  | 'vesting'
  | 'cliff'
  | 'scheduled'

export const STATUS_LABEL: Record<StreamStatus, string> = {
  'canceled-settled': 'Canceled and settled',
  'canceled-claimable': 'Canceled, still claimable',
  depleted: 'Fully withdrawn',
  vested: 'Fully vested',
  vesting: 'Vesting',
  cliff: 'In cliff',
  scheduled: 'Not started',
}

export function statusOf(s: Stream, now: number): StreamStatus {
  if (s.canceled) {
    return s.withdrawn + s.refunded === s.total ? 'canceled-settled' : 'canceled-claimable'
  }
  if (s.withdrawn === s.total) return 'depleted'
  if (now >= s.end) return 'vested'
  if (now >= s.cliff) return 'vesting'
  if (now >= s.start) return 'cliff'
  return 'scheduled'
}

export function streamedAt(s: Stream, now: number): bigint {
  if (now < s.cliff) return 0n
  if (now >= s.end) return s.total
  return (s.total * BigInt(now - s.start)) / BigInt(s.end - s.start)
}

export function withdrawableAt(s: Stream, now: number): bigint {
  const vested = s.canceled ? s.total - s.refunded : streamedAt(s, now)
  return vested - s.withdrawn
}

export function progress(s: Stream, now: number): number {
  if (s.total === 0n) return 0
  return Number((s.withdrawn * 1000n) / s.total) / 1000
}

export function claimableFraction(s: Stream, now: number): number {
  if (s.total === 0n) return 0
  const claimable = s.canceled ? s.total - s.refunded : streamedAt(s, now)
  return Number((claimable * 1000n) / s.total) / 1000
}

export type OfferStatus = 'none' | 'live' | 'expired' | 'cleared'

export function offerStatusOf(o: Offer, now: number): OfferStatus {
  if (o.generation === 0n) return 'none'
  if (!o.live) return 'cleared'
  return now < o.expiry ? 'live' : 'expired'
}

export function canWithdraw(s: Stream, now: number): boolean {
  return s.exists && withdrawableAt(s, now) > 0n
}

export function canCancel(s: Stream, now: number): boolean {
  return s.exists && !s.canceled && now < s.end && !isUncancelable(s)
}

export function canTransfer(s: Stream, now: number, offer: Offer): boolean {
  return s.exists && !s.canceled && s.withdrawn < s.total && offerStatusOf(offer, now) !== 'live'
}

export function canList(s: Stream, now: number): boolean {
  return s.exists && !s.canceled && s.withdrawn < s.total && now < s.end
}

export function refundIfCanceledNow(s: Stream, now: number): bigint {
  return s.total - streamedAt(s, now)
}
