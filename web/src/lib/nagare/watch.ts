const KEY = 'nagare.watched.v1'

function read(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export function watched(): number[] {
  return read().sort((a, b) => b - a)
}

export function watch(id: number) {
  const all = read()
  if (!all.includes(id)) {
    all.push(id)
    window.localStorage.setItem(KEY, JSON.stringify(all))
  }
}

export function unwatch(id: number) {
  window.localStorage.setItem(KEY, JSON.stringify(read().filter((x) => x !== id)))
}

const OPENED_KEY = 'nagare.opened.v1'

function readOpened(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(OPENED_KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export function openedHere(id: number): boolean {
  return readOpened().includes(id)
}

export function markOpened(id: number) {
  const all = readOpened()
  if (!all.includes(id)) {
    all.push(id)
    window.localStorage.setItem(OPENED_KEY, JSON.stringify(all))
  }
}

export function unmarkOpened(id: number) {
  window.localStorage.setItem(OPENED_KEY, JSON.stringify(readOpened().filter((x) => x !== id)))
}

const RECOVERED_KEY = 'nagare.recovered.v1'

function readRecovered(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECOVERED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function recovered(address: string): boolean {
  return readRecovered().some((a) => {
    try {
      return BigInt(a) === BigInt(address)
    } catch {
      return false
    }
  })
}

export function markRecovered(address: string) {
  if (recovered(address)) return
  window.localStorage.setItem(RECOVERED_KEY, JSON.stringify([...readRecovered(), address]))
}
