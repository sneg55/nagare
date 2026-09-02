import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  agentRules: false,
  images: { unoptimized: true },
}

export default nextConfig
