'use client'

import type { ReactNode } from 'react'
import { WalletProvider } from '@/components/WalletProvider'
import { TopBar } from '@/components/TopBar'
import { WalletBar } from '@/components/WalletBar'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <TopBar cta={false} />
      <WalletBar />
      {children}
    </WalletProvider>
  )
}
