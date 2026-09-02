import Link from 'next/link'
import { Mark } from './Mark'

export function TopBar({ cta = true }: { cta?: boolean }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="Nagare, home">
        <Mark />
        <span>Nagare</span>
      </Link>
      <nav>
        <Link href="/app/streams">Streams</Link>
        {cta ? (
          <Link href="/app/create" className="btn">
            New stream
          </Link>
        ) : null}
      </nav>
    </header>
  )
}
