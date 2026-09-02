export function Meter({
  withdrawn,
  claimable,
  label,
}: {
  withdrawn: number
  claimable: number
  label: string
}) {
  const taken = Math.max(0, Math.min(1, withdrawn))
  const ready = Math.max(0, Math.min(1, claimable))
  return (
    <div
      className="meter"
      role="progressbar"
      aria-valuenow={Math.round(ready * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${ready * 100}%` }}>
        <i style={{ width: ready > 0 ? `${(taken / ready) * 100}%` : '0%' }} />
      </span>
    </div>
  )
}
