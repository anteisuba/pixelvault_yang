'use client'

import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ArenaLeaderboard } from '@/components/business/ArenaLeaderboard'

export default function LeaderboardPage() {
  const t = useTranslations('ArenaLeaderboard')

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span className="editorial-eyebrow">{t('heroEyebrow')}</span>
            <h1 className="editorial-title">{t('heroTitle')}</h1>
            <p className="editorial-copy max-w-2xl">{t('heroDescription')}</p>
          </div>

          <Link href="/arena">
            <Button variant="outline" className="gap-2 rounded-full">
              <ArrowLeft className="size-4" />
              {t('backToArena')}
            </Button>
          </Link>
        </section>

        <section className="editorial-panel">
          <ArenaLeaderboard />
        </section>
      </div>
    </div>
  )
}
