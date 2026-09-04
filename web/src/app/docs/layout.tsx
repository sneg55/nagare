import type { ReactNode } from 'react'
import { TopBar } from '@/components/TopBar'
import { DocsNav } from '@/components/DocsNav'

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar cta={false} />
      <main id="content" className="band">
        <div className="wrap docs-grid">
          <DocsNav />
          <div className="stack docs-body">{children}</div>
        </div>
      </main>
    </>
  )
}
