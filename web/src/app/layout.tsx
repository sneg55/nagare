import type { ReactNode } from 'react'

export const metadata = {
  title: 'Nagare harness',
  description: 'Mainnet proof harness for the Nagare vesting contract',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 24,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          lineHeight: 1.6,
          background: '#ffffff',
          color: '#28262a',
        }}
      >
        {children}
      </body>
    </html>
  )
}
