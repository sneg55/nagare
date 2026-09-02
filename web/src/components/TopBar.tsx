import Link from 'next/link'

export function TopBar({ cta = true }: { cta?: boolean }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark">
        Nagare
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
