'use client'

import type { ReactNode } from 'react'
import { WalletProvider } from '@/components/WalletProvider'

export default function ClaimLayout({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}
