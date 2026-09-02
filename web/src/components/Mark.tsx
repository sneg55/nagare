export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="mark"
    >
      <path d="M2 6.6c3.1 0 3.3-3 6.6-3s3.5 3 6.7 3 3.3-3 6.7-3" opacity="0.3" />
      <path d="M2 12c3.1 0 3.3-3 6.6-3s3.5 3 6.7 3 3.3-3 6.7-3" />
      <path d="M2 17.4c3.1 0 3.3-3 6.6-3s3.5 3 6.7 3 3.3-3 6.7-3" opacity="0.3" />
    </svg>
  )
}
