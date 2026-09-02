export function claimLink(streamId: number, privateKey: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/claim#${streamId}-${privateKey}`
}

export function parseClaim(hash: string): { streamId: number; privateKey: string } | null {
  const raw = hash.replace(/^#/, '')
  const at = raw.indexOf('-')
  if (at < 1) return null
  const streamId = Number(raw.slice(0, at))
  const privateKey = raw.slice(at + 1)
  if (!Number.isInteger(streamId) || streamId < 1) return null
  if (!/^0x[0-9a-fA-F]+$/.test(privateKey)) return null
  return { streamId, privateKey }
}
