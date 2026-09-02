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
