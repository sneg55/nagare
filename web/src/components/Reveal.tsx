import { DISCLOSED, NOT_DISCLOSED } from '@/lib/nagare/reveal'

export function Reveal() {
  return (
    <div className="stack">
      <h2>What the chain can see</h2>
      <p className="lead">
        Nagare hides who, not what. These are the exact terms, so you can decide whether
        they fit before you fund anything.
      </p>
      <div style={{ display: 'grid', gap: 'var(--s5)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="stack-tight">
          <h3>Never published</h3>
          <dl className="rows">
            {NOT_DISCLOSED.map((line) => (
              <div className="row" key={line} style={{ gridTemplateColumns: '1fr' }}>
                <dt style={{ color: 'var(--ink)' }}>{line}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="stack-tight">
          <h3>Public on Voyager</h3>
          <dl className="rows">
            {DISCLOSED.map((line) => (
              <div className="row" key={line} style={{ gridTemplateColumns: '1fr' }}>
                <dt>{line}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
