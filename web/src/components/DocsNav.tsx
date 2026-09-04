'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PAGES = [
  { href: '/docs', label: 'Start here' },
  { href: '/docs/sending', label: 'Sending tokens' },
  { href: '/docs/receiving', label: 'Receiving tokens' },
  { href: '/docs/keys', label: 'Keys and recovery' },
  { href: '/docs/reference', label: 'Reference' },
]

export function DocsNav() {
  const here = usePathname()
  return (
    <nav className="docs-nav" aria-label="Documentation">
      {PAGES.map((p) => (
        <Link key={p.href} href={p.href} aria-current={here === p.href ? 'page' : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  )
}
