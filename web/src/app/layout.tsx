import type { ReactNode } from 'react'
import { Inter, Source_Serif_4 } from 'next/font/google'
import '../styles/tokens.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
})

export const metadata = {
  title: 'Nagare — private vesting on Starknet',
  description:
    'Vest tokens on Starknet without publishing your cap table. Sender and recipient are keys, not wallet addresses.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  )
}
