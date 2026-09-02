import { ec, num } from 'starknet'

export type Keypair = {
  privateKey: string
  publicKey: string
}

export function generateKeypair(): Keypair {
  const privateKey = num.toHex(
    num.toBigInt('0x' + Buffer.from(ec.starkCurve.utils.randomPrivateKey()).toString('hex')),
  )
  return { privateKey, publicKey: ec.starkCurve.getStarkKey(privateKey) }
}

export function publicKeyOf(privateKey: string): string {
  return ec.starkCurve.getStarkKey(privateKey)
}

export function signHash(privateKey: string, messageHash: string): [string, string] {
  const s = ec.starkCurve.sign(messageHash, privateKey)
  return [num.toHex(s.r), num.toHex(s.s)]
}

const STORE_KEY = 'nagare.keys.v1'

type KeyStore = Record<string, Keypair>

function read(): KeyStore {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}') as KeyStore
  } catch {
    return {}
  }
}

function write(store: KeyStore) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

export function saveKey(id: string, keypair: Keypair) {
  const store = read()
  store[id] = keypair
  write(store)
}

export function loadKey(id: string): Keypair | undefined {
  return read()[id]
}

export function allKeys(): KeyStore {
  return read()
}

export function exportKeys(): string {
  return JSON.stringify(read())
}

const SINK = 'http://localhost:3031/keys'

export async function pushKeysToSink(): Promise<number> {
  const store = read()
  await fetch(SINK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(store),
  })
  return Object.keys(store).length
}

export async function pullKeysFromSink(): Promise<number> {
  const incoming = (await (await fetch(SINK)).json()) as KeyStore
  write({ ...read(), ...incoming })
  return Object.keys(incoming).length
}

export function importKeys(blob: string) {
  const parsed = JSON.parse(blob) as KeyStore
  write({ ...read(), ...parsed })
}

const IN_FLIGHT_KEY = 'nagare.inflight.v1'

export type InFlight = { op: string; streamId: string; at: number }

export function readInFlight(): InFlight | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(IN_FLIGHT_KEY)
    return raw ? (JSON.parse(raw) as InFlight) : null
  } catch {
    return null
  }
}

export function writeInFlight(v: InFlight) {
  window.localStorage.setItem(IN_FLIGHT_KEY, JSON.stringify(v))
}

export function clearInFlight() {
  window.localStorage.removeItem(IN_FLIGHT_KEY)
}
