'use client'

import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ArenaHistory } from '@/components/business/ArenaHistory'
import { ArenaPersonalStats } from '@/components/business/ArenaPersonalStats'

export default function ArenaHistoryPage() {
  const tHistory = useTranslations('ArenaHistory')
  const tStats = useTranslations('ArenaPersonalStats')

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span className="editorial-eyebrow">{tHistory('heroEyebrow')}</span>
            <h1 className="editorial-title">{tHistory('heroTitle')}</h1>
            <p className="editorial-copy max-w-2xl">
              {tHistory('heroDescription')}
            </p>
          </div>

          <Link href="/arena">
            <Button variant="outline" className="gap-2 rounded-full">
              <ArrowLeft className="size-4" />
              {tHistory('backToArena')}
            </Button>
          </Link>
        </section>

        {/* Personal Stats Section */}
        <section id="stats" className="editorial-panel">
          <h2 className="editorial-section-title">{tStats('title')}</h2>
          <p className="editorial-copy mb-6">{tStats('description')}</p>
          <ArenaPersonalStats />
        </section>

        {/* Match History Section */}
        <section className="editorial-panel">
          <h2 className="editorial-section-title">{tHistory('heroTitle')}</h2>
          <ArenaHistory />
        </section>
      </div>
    </div>
  )
}
