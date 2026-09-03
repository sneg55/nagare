import { deleteKey, loadKey, saveKey, type Keypair } from './keys'
import { keyForInvite, keyForOffer, keyForRecipient, keyForSender } from './derive'

export type Source =
  | { kind: 'stored' }
  | { kind: 'sender-slot'; slot: number }
  | { kind: 'recipient'; streamId: number }
  | { kind: 'invite'; index: number }
  | { kind: 'offer'; streamId: number; generation: string }

export type RoleEntry = { publicKey: string; source: Source }

const STORE_KEY = 'nagare.roles.v1'

type RoleStore = Record<string, RoleEntry>

function read(): RoleStore {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}') as RoleStore
  } catch {
    return {}
  }
}

function write(store: RoleStore) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

export function saveRole(id: string, entry: RoleEntry) {
  const store = read()
  store[id] = entry
  write(store)
}

export function roleEntry(id: string): RoleEntry | undefined {
  const known = read()[id]
  if (known) return known
  const held = loadKey(id)
  return held ? { publicKey: held.publicKey, source: { kind: 'stored' } } : undefined
}

export function publicKeyFor(id: string): string | undefined {
  return roleEntry(id)?.publicKey
}

export function forgetRole(id: string) {
  const store = read()
  delete store[id]
  write(store)
  deleteKey(id)
}

export function moveRole(from: string, to: string) {
  const entry = roleEntry(from)
  if (!entry) return
  const held = loadKey(from)
  saveRole(to, entry)
  if (held) saveKey(to, held)
  forgetRole(from)
}

export function keypairFor(id: string, entry: RoleEntry, seed: string | null): Keypair {
  const s = entry.source
  if (s.kind === 'stored') {
    const held = loadKey(id)
    if (!held) throw new Error('That key is not in this browser any more.')
    return held
  }
  if (!seed) throw new Error('Nagare needs one wallet signature to rebuild that key.')
  if (s.kind === 'sender-slot') return keyForSender(seed, s.slot)
  if (s.kind === 'recipient') return keyForRecipient(seed, s.streamId)
  if (s.kind === 'invite') return keyForInvite(seed, s.index)
  return keyForOffer(seed, s.streamId, s.generation)
}
