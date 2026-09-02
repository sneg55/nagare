import { STRK_DECIMALS } from './config'

const ONE = 10n ** BigInt(STRK_DECIMALS)

export function toStrk(wei: bigint, maxFractionDigits = 4): string {
  const whole = wei / ONE
  const frac = wei % ONE
  if (frac === 0n) return whole.toString()
  const digits = frac.toString().padStart(STRK_DECIMALS, '0').slice(0, maxFractionDigits)
  const trimmed = digits.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole.toString()
}

export function parseStrk(input: string): bigint {
  const [whole = '0', frac = ''] = input.trim().split('.')
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) throw new Error('enter an amount in STRK')
  const padded = (frac + '0'.repeat(STRK_DECIMALS)).slice(0, STRK_DECIMALS)
  return BigInt(whole || '0') * ONE + BigInt(padded || '0')
}

export function shortHex(v: string, lead = 6, tail = 4): string {
  return v.length <= lead + tail + 2 ? v : `${v.slice(0, lead + 2)}…${v.slice(-tail)}`
}

const DATE = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function when(unix: number): string {
  return DATE.format(new Date(unix * 1000))
}

export function until(unix: number, now: number): string {
  const d = Math.abs(unix - now)
  const past = unix < now
  const unit =
    d < 90 ? `${d}s` : d < 5400 ? `${Math.round(d / 60)} min` : d < 172800 ? `${Math.round(d / 3600)} h` : `${Math.round(d / 86400)} days`
  return past ? `${unit} ago` : `in ${unit}`
}
