import Link from 'next/link'
import { Mark } from './Mark'

export function TopBar({ cta = true }: { cta?: boolean }) {
  return (
    <>
    <a href="#content" className="skip">
      Skip to content
    </a>
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="Nagare, home">
        <Mark />
        <span>Nagare</span>
      </Link>
      <nav>
        <Link href="/app/schedules">My Schedules</Link>
        <Link href="/app/market">Marketplace</Link>
        {cta ? (
          <Link href="/app/create" className="btn">
            New schedule
          </Link>
        ) : null}
      </nav>
    </header>
    </>
  )
}
