import { StreamDetail } from '@/components/StreamDetail'

export function generateStaticParams() {
  return Array.from({ length: 60 }, (_, i) => ({ id: String(i + 1) }))
}

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StreamDetail id={Number(id)} />
}
