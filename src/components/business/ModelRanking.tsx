'use client'

import { ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

interface RankedModel {
  rank: number
  name: string
  strength: string
  api: string
  apiUrl: string
  price: string
  available: boolean
}

const RANKED_MODELS: RankedModel[] = [
  {
    rank: 1,
    name: 'Flux 2 Pro',
    strength: 'photorealism',
    api: 'fal.ai',
    apiUrl: 'https://fal.ai/dashboard/keys',
    price: '~$0.03',
    available: true,
  },
  {
    rank: 2,
    name: 'GPT Image 1.5',
    strength: 'overall',
    api: 'OpenAI',
    apiUrl: 'https://platform.openai.com/api-keys',
    price: '~$0.04–0.12',
    available: true,
  },
  {
    rank: 3,
    name: 'Recraft V4',
    strength: 'logos',
    api: 'Recraft',
    apiUrl: 'https://www.recraft.ai/docs',
    price: '~$0.04',
    available: false,
  },
  {
    rank: 4,
    name: 'Ideogram 3.0',
    strength: 'textInImage',
    api: 'Replicate',
    apiUrl: 'https://replicate.com/account/api-tokens',
    price: 'Free tier',
    available: true,
  },
  {
    rank: 5,
    name: 'Gemini 3 Pro',
    strength: 'multimodal',
    api: 'Google AI',
    apiUrl: 'https://aistudio.google.com/apikey',
    price: 'Per token',
    available: true,
  },
  {
    rank: 6,
    name: 'Midjourney v7',
    strength: 'artistic',
    api: '',
    apiUrl: '',
    price: 'Subscription',
    available: false,
  },
]

export function ModelRanking() {
  const t = useTranslations('ModelRanking')

  return (
    <div className="overflow-hidden rounded-2xl border border-border/75">
      <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="divide-y divide-border/30">
        {RANKED_MODELS.map((model) => (
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
