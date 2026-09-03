import { DISCLOSED, NOT_DISCLOSED } from '@/lib/nagare/reveal'

export function Reveal() {
  return (
    <div className="stack">
      <h2>What the chain can see</h2>
      <p className="lead">
        Nagare hides the parties and publishes the terms. Here they are in full, so you
        can decide whether they fit before you fund anything.
      </p>
      <div className="two-cols">
        <div className="stack-tight">
          <h3>Never published</h3>
          <dl className="rows rows-plain rows-ink">
            {NOT_DISCLOSED.map((line) => (
              <div className="row" key={line}>
                <dt>{line}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="stack-tight">
          <h3>Public on Voyager</h3>
          <dl className="rows rows-plain">
            {DISCLOSED.map((line) => (
              <div className="row" key={line}>
                <dt>{line}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
