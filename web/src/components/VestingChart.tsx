'use client'

import { useEffect, useRef, useState } from 'react'

const H = 208
const PAD_T = 26
const PAD_B = 30
const PAD_X = 14
const DAY_MS = 86400000

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function niceDomain(days: number): number {
  const raw = Math.max(days, 1) * 1.2
  const step = raw > 400 ? 30 : raw > 120 ? 10 : raw > 40 ? 5 : 1
  return Math.ceil(raw / step) * step
}

function vestedFraction(day: number, cliff: number, end: number): number {
  if (day < cliff) return 0
  if (end <= 0 || day >= end) return 1
  return day / end
}

function share(total: number | null, fraction: number): string {
  if (total === null) return `${Math.round(fraction * 100)}% of the amount`
  return `${Math.round(total * fraction * 100) / 100} STRK`
}

export function VestingChart({
  total,
  cliffDays,
  endDays,
  onCliffDays,
  onEndDays,
}: {
  total: number | null
  cliffDays: number
  endDays: number
  onCliffDays: (d: number) => void
  onEndDays: (d: number) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [w, setW] = useState(640)
  const [now, setNow] = useState<number | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [held, setHeld] = useState<number | null>(null)
  const [ringed, setRinged] = useState<'cliff' | 'end' | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cliff = Math.max(0, Math.round(cliffDays))
  const end = Math.max(1, Math.round(endDays))
  const domain = held ?? niceDomain(Math.max(cliff, end))

  const x0 = PAD_X
  const x1 = Math.max(x0 + 1, w - PAD_X)
  const y0 = PAD_T
  const y1 = H - PAD_B
  const px = (day: number) => x0 + (Math.min(day, domain) / domain) * (x1 - x0)
  const py = (f: number) => y1 - f * (y1 - y0)
  const dayAt = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return 0
    const t = (clientX - box.left - x0) / (x1 - x0)
    return Math.round(Math.max(0, Math.min(1, t)) * domain)
  }

  const cliffFraction = vestedFraction(cliff, cliff, end)
  const corners: Array<[number, number]> =
    cliff >= end
      ? [[0, 0], [cliff, 0], [cliff, 1], [domain, 1]]
      : [[0, 0], [cliff, 0], [cliff, cliffFraction], [end, 1], [domain, 1]]
  const line = corners.map(([d, f], i) => `${i ? 'L' : 'M'}${px(d)} ${py(f)}`).join(' ')
  const filled = corners.slice(0, -1)
  const area = `${filled.map(([d, f], i) => `${i ? 'L' : 'M'}${px(d)} ${py(f)}`).join(' ')} L${px(filled[filled.length - 1][0])} ${py(0)} Z`

  const dateOf = (day: number) => (now === null ? '' : DATE.format(now + day * DAY_MS))

  const grab = (which: 'cliff' | 'end', day: number, set: (d: number) => void, lo: number, hi: number) => ({
    onFocus: (e: React.FocusEvent<SVGRectElement>) =>
      setRinged(e.currentTarget.matches(':focus-visible') ? which : null),
    onBlur: () => setRinged(null),
    onPointerDown: (e: React.PointerEvent<SVGRectElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setHeld(domain)
      setScrub(day)
    },
    onPointerMove: (e: React.PointerEvent<SVGRectElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const d = Math.max(lo, Math.min(hi, dayAt(e.clientX)))
      set(d)
      setScrub(d)
    },
    onPointerUp: (e: React.PointerEvent<SVGRectElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId)
      setHeld(null)
      setScrub(null)
    },
    onPointerCancel: () => {
      setHeld(null)
      setScrub(null)
    },
    onKeyDown: (e: React.KeyboardEvent<SVGRectElement>) => {
      const step = e.shiftKey ? 30 : 1
      const next =
        e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? day - step
          : e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? day + step
            : e.key === 'Home'
              ? lo
              : e.key === 'End'
                ? hi
                : null
      if (next === null) return
      e.preventDefault()
      set(Math.max(lo, Math.min(hi, next)))
    },
  })

  const readFraction = scrub === null ? null : vestedFraction(scrub, cliff, end)

  return (
    <div className="stack-tight" ref={wrap}>
      <svg
        ref={svg}
        className="chart"
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        role="group"
        aria-label="Vesting curve"
        onPointerMove={(e) => {
          if (held !== null) return
          setScrub(dayAt(e.clientX))
        }}
        onPointerLeave={() => {
          if (held === null) setScrub(null)
        }}
      >
        <line className="chart-ceiling" x1={x0} y1={py(1)} x2={x1} y2={py(1)} />
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
        <line className="chart-axis" x1={x0} y1={y1} x2={x1} y2={y1} />
        {scrub !== null && readFraction !== null ? (
          <line className="chart-scrub" x1={px(scrub)} y1={y1} x2={px(scrub)} y2={py(readFraction)} />
        ) : null}
        <text className="chart-label" x={x0} y={py(1) - 8}>
          {total === null ? 'Full amount' : `${total} STRK`}
        </text>
        <text className="chart-label" x={x0} y={y1 + 20}>
          Today
        </text>
        {ringed !== null ? (
          <circle className="chart-ring" cx={px(ringed === 'cliff' ? cliff : end)} cy={y1} r={13} />
        ) : null}
        <circle className="chart-handle" cx={px(cliff)} cy={y1} r={6} />
        <circle className="chart-handle" cx={px(end)} cy={y1} r={6} />
        <rect
          className="chart-grab"
          x={px(cliff) - 22}
          y={y1 - 22}
          width={44}
          height={44}
          tabIndex={0}
          role="slider"
          aria-label="Cliff on the curve, in days from now"
          aria-valuemin={0}
          aria-valuemax={end - 1}
          aria-valuenow={cliff}
          aria-valuetext={`${cliff} days, ${dateOf(cliff)}`}
          {...grab('cliff', cliff, onCliffDays, 0, end - 1)}
        />
        <rect
          className="chart-grab"
          x={px(end) - 22}
          y={y1 - 22}
          width={44}
          height={44}
          tabIndex={0}
          role="slider"
          aria-label="Fully vested on the curve, in days"
          aria-valuemin={cliff + 1}
          aria-valuemax={domain}
          aria-valuenow={end}
          aria-valuetext={`${end} days, ${dateOf(end)}`}
          {...grab('end', end, onEndDays, cliff + 1, domain)}
        />
      </svg>
      <div className="chart-note stack-tight">
        {scrub !== null && readFraction !== null ? (
          <p>
            {dateOf(scrub)}: {share(total, readFraction)} vested
          </p>
        ) : cliff > 0 ? (
          <p>
            {dateOf(cliff)}: {share(total, cliffFraction)} unlocks at once, then it
            accrues by the second.
          </p>
        ) : (
          <p>No cliff. It accrues by the second from today.</p>
        )}
        <p className="muted">
          Fully vested {dateOf(end)}. Drag either handle, or type the days above.
        </p>
      </div>
    </div>
  )
}
