'use client'

import { useState } from 'react'
import { ExternalLink, Image, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

type TabType = 'image' | 'video'

interface RankedModel {
  rank: number
  name: string
  strength: string
  api: string
  apiUrl: string
  price: string
  available: boolean
  tier?: string
}

const RANKED_IMAGE_MODELS: RankedModel[] = [
  {
    rank: 1,
    name: 'GPT Image 1.5',
    strength: 'overall',
    api: 'OpenAI',
    apiUrl: 'https://platform.openai.com/api-keys',
    price: '~$0.04–0.12',
    available: true,
  },
  {
    rank: 2,
    name: 'Gemini 3.1 Pro',
    strength: 'multimodal',
    api: 'Google AI',
    apiUrl: 'https://aistudio.google.com/apikey',
    price: 'Per token',
    available: true,
  },
  {
    rank: 3,
    name: 'Flux 2 Pro',
    strength: 'photorealism',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.03',
    available: true,
  },
  {
    rank: 4,
    name: 'Seedream 4.5',
    strength: 'cinematic',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.03',
    available: true,
  },
  {
    rank: 5,
    name: 'Ideogram 3',
    strength: 'textInImage',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.03',
    available: true,
  },
  {
    rank: 6,
    name: 'Recraft V3',
    strength: 'logos',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.03',
    available: true,
  },
]

const RANKED_VIDEO_MODELS: RankedModel[] = [
  {
    rank: 1,
    name: 'Kling V3 Pro',
    strength: 'videoMotion',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.30',
    available: true,
    tier: 'premium',
  },
  {
    rank: 2,
    name: 'Veo 3',
    strength: 'videoRealism',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.50',
    available: true,
    tier: 'premium',
  },
  {
    rank: 3,
    name: 'Sora 2',
    strength: 'videoCreative',
    api: 'OpenAI',
    apiUrl: 'https://platform.openai.com/api-keys',
    price: '~$0.30',
    available: true,
    tier: 'premium',
  },
  {
    rank: 4,
    name: 'Seedance Pro',
    strength: 'videoConsistency',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.15',
    available: true,
    tier: 'standard',
  },
  {
    rank: 5,
    name: 'MiniMax Hailuo',
    strength: 'videoSpeed',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.10',
    available: true,
    tier: 'standard',
  },
  {
    rank: 6,
    name: 'Luma Ray 2',
    strength: 'videoCinematic',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.15',
    available: true,
    tier: 'standard',
  },
]

function RankingSection({
  models,
  title,
  subtitle,
  t,
}: {
  models: RankedModel[]
  title: string
  subtitle: string
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/75">
      <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div className="divide-y divide-border/30">
        {models.map((model) => (
          <div
            key={model.rank}
            className={cn(
              'flex items-center gap-3 px-4 py-3 transition-colors',
              model.available && 'hover:bg-muted/10',
              !model.available && 'opacity-50',
            )}
          >
            {/* Rank */}
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                model.rank === 1 && 'bg-primary/10 text-primary',
                model.rank === 2 && 'bg-foreground/8 text-foreground/80',
                model.rank >= 3 && 'text-muted-foreground',
              )}
            >
              {model.rank}
            </span>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {model.name}
                </p>
                {model.available && (
                  <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                    {t('supported')}
                  </span>
                )}
                {!model.available && !model.api && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t('noApi')}
                  </span>
                )}
                {model.tier && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      model.tier === 'premium' &&
                        'bg-amber-500/10 text-amber-600',
                      model.tier === 'standard' &&
                        'bg-blue-500/10 text-blue-600',
                    )}
                  >
                    {t(`tiers.${model.tier}`)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(`strengths.${model.strength}`)} · {model.price}
              </p>
            </div>

            {/* API link */}
            {model.apiUrl && (
              <a
                href={model.apiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {model.api}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ModelRanking() {
  const t = useTranslations('ModelRanking')
  const [activeTab, setActiveTab] = useState<TabType>('image')

  const tabs: { key: TabType; label: string; icon: typeof Image }[] = [
    { key: 'image', label: t('tabImage'), icon: Image },
    { key: 'video', label: t('tabVideo'), icon: Video },
  ]

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-3 flex gap-1 rounded-xl bg-muted/30 p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              activeTab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'image' ? (
        <RankingSection
          models={RANKED_IMAGE_MODELS}
          title={t('imageTitle')}
          subtitle={t('imageSubtitle')}
          t={t}
        />
      ) : (
        <RankingSection
          models={RANKED_VIDEO_MODELS}
          title={t('videoTitle')}
          subtitle={t('videoSubtitle')}
          t={t}
        />
      )}
    </div>
  )
}
