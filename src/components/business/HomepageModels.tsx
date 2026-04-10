'use client'

import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  getModelMessageKey,
  groupModelsByProvider,
  MODEL_OPTIONS,
  type ModelOption,
  type ProviderGroup,
} from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { BlurFade } from '@/components/ui/blur-fade'
import { MagicCard } from '@/components/ui/magic-card'
import { TextAnimate } from '@/components/ui/text-animate'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const PROVIDER_LABELS: Record<ProviderGroup, string> = {
  openai: 'OpenAI',
  google: 'Google',
  novelai: 'NovelAI',
  fal: 'fal.ai',
  volcengine: 'VolcEngine',
  fish_audio: 'Fish Audio',
  opensource: 'Open Source',
  replicate: 'Replicate',
}

function getCapabilities(model: ModelOption) {
  const isImage = model.outputType === 'IMAGE'
  const isVideo = model.outputType === 'VIDEO'
  return {
    txt2img: isImage,
    img2img: isImage && !model.requiresReferenceImage,
    txt2video: isVideo,
    img2video: isVideo && !!model.i2vModelId,
  }
}

/** Approximate API pricing per generation (USD) */
const MODEL_PRICING: Record<string, { price: string; unit: string }> = {
  // OpenAI
  'gpt-image-1.5': { price: '~$0.03', unit: '/img' },
  // Google
  'gemini-3.1-flash-image-preview': { price: '~$0.07', unit: '/img' },
  'gemini-3-pro-image-preview': { price: '~$0.13', unit: '/img' },
  'gemini-2.5-flash-image': { price: '~$0.04', unit: '/img' },
  // fal — Image
  'flux-2-pro': { price: '~$0.03', unit: '/img' },
  'flux-2-dev': { price: '~$0.012', unit: '/img' },
  'flux-2-schnell': { price: '~$0.008', unit: '/img' },
  'flux-2-max': { price: '~$0.07', unit: '/img' },
  'flux-lora': { price: '~$0.02', unit: '/img' },
  'flux-kontext-pro': { price: '~$0.04', unit: '/img' },
  'flux-kontext-max': { price: '~$0.07', unit: '/img' },
  'ideogram-3': { price: '~$0.05', unit: '/img' },
  'recraft-v3': { price: '~$0.04', unit: '/img' },
  'recraft-v4-pro': { price: '~$0.25', unit: '/img' },
  // VolcEngine
  'seedream-4.5': { price: '~$0.04', unit: '/img' },
  'seedream-5.0-lite': { price: '~$0.035', unit: '/img' },
  'seedream-4.0': { price: '~$0.03', unit: '/img' },
  'seedream-3.0': { price: '~$0.02', unit: '/img' },
  // NovelAI (~13 Anlas ≈ $0.026)
  'nai-diffusion-4-5-full': { price: '~$0.026', unit: '/img' },
  'nai-diffusion-4-5-curated': { price: '~$0.026', unit: '/img' },
  'nai-diffusion-4-full': { price: '~$0.026', unit: '/img' },
  'nai-diffusion-3': { price: '~$0.020', unit: '/img' },
  'illustrious-xl': { price: '~$0.026', unit: '/img' },
  // HuggingFace
  sdxl: { price: '~$0.006', unit: '/img' },
  'animagine-xl-4.0': { price: '~$0.006', unit: '/img' },
  // Replicate
  'sd-3.5-large': { price: '~$0.065', unit: '/img' },
  // fal — Video
  'kling-video': { price: '~$0.10', unit: '/sec' },
  'kling-v3-pro': { price: '~$0.22', unit: '/sec' },
  'minimax-video': { price: '~$0.05', unit: '/vid' },
  'luma-ray-2': { price: '~$0.10', unit: '/sec' },
  'wan-video': { price: '~$0.05', unit: '/sec' },
  'hunyuan-video': { price: '~$0.075', unit: '/sec' },
  'seedance-pro': { price: '~$0.06', unit: '/sec' },
  'seedance-1.5-pro': { price: '~$0.05', unit: '/sec' },
  'seedance-1.0-pro': { price: '~$0.12', unit: '/sec' },
  'veo-3': { price: '~$0.40', unit: '/sec' },
  'pika-v2.2': { price: '~$0.06', unit: '/sec' },
  'runway-gen3': { price: '~$0.06', unit: '/sec' },
}

const capabilityLabels = {
  txt2img: { en: 'Text→Image', ja: 'テキスト→画像', zh: '文生图' },
  img2img: { en: 'Image→Image', ja: '画像→画像', zh: '图生图' },
  txt2video: { en: 'Text→Video', ja: 'テキスト→動画', zh: '文生视频' },
  img2video: { en: 'Image→Video', ja: '画像→動画', zh: '图生视频' },
} as const

const capabilityConfig = [
  { key: 'txt2img' as const, color: 'bg-blue-500/15 text-blue-700' },
  { key: 'img2img' as const, color: 'bg-emerald-500/15 text-emerald-700' },
  { key: 'txt2video' as const, color: 'bg-purple-500/15 text-purple-700' },
  { key: 'img2video' as const, color: 'bg-amber-500/15 text-amber-700' },
]

export function HomepageModels() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  const groups = groupModelsByProvider(MODEL_OPTIONS)
  const availableGroups = groups.filter((g) =>
    g.models.some((m) => m.available),
  )

  return (
    <section
      id="models"
      className="grid gap-5 pt-[clamp(2rem,3.5vw,3rem)] scroll-mt-24"
    >
      <BlurFade inView>
        <div className="grid gap-[0.65rem] max-w-[42rem]">
          <p
            className={cn(
              'text-[0.72rem] font-semibold tracking-[0.18em] uppercase text-primary opacity-75',
              isDenseLocale && 'tracking-normal normal-case',
            )}
          >
            {t('models.eyebrow')}
          </p>
          <TextAnimate
            as="h2"
            by="word"
            animation="blurInUp"
            duration={0.6}
            once
            startOnView
            className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance"
          >
            {t('models.title')}
          </TextAnimate>
        </div>
      </BlurFade>

      <Tabs defaultValue={availableGroups[0]?.group}>
        <TabsList className="flex flex-wrap gap-1 bg-transparent h-auto p-0">
          {availableGroups.map(({ group, models }) => (
            <TabsTrigger
              key={group}
              value={group}
              className="rounded-full border border-border/60 bg-card/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary"
            >
              {PROVIDER_LABELS[group]}
              <span className="ml-1.5 text-[0.6rem] opacity-70">
                {models.filter((m) => m.available).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {availableGroups.map(({ group, models }) => {
          const availableModels = models.filter((m) => m.available)
          return (
            <TabsContent key={group} value={group} className="mt-4">
              <MagicCard
                gradientFrom="#d97757"
                gradientTo="#b85c3a"
                gradientColor="rgba(217, 119, 87, 0.04)"
                gradientOpacity={0.6}
                className="rounded-2xl border-border/60 bg-transparent overflow-hidden"
              >
                {/* Table header */}
                <div className="grid grid-cols-[1fr_6rem_minmax(0,16rem)] max-sm:grid-cols-[1fr_6rem] gap-2 px-5 py-3 border-b border-border/40 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{tCommon('model')}</span>
                  <span className="text-center">{tCommon('cost')}</span>
                  <span className="max-sm:hidden">
                    {tCommon('capabilities')}
                  </span>
                </div>

                {/* Model rows */}
                {availableModels.map((model, i) => {
                  const caps = getCapabilities(model)
                  return (
                    <BlurFade
                      key={model.id}
                      delay={i * 0.04}
                      inView
                      direction="left"
                    >
                      <div
                        className={cn(
                          'grid grid-cols-[1fr_6rem_minmax(0,16rem)] max-sm:grid-cols-[1fr_6rem] gap-2 items-center px-5 py-3 transition-colors duration-200 hover:bg-primary/3',
                          i < availableModels.length - 1 &&
                            'border-b border-border/20',
                        )}
                      >
                        {/* Model name + tags */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-display text-[0.95rem] font-medium leading-tight tracking-[-0.01em] truncate">
                            {tModels(`${getModelMessageKey(model.id)}.label`)}
                          </span>
                          {model.qualityTier === 'premium' && (
                            <Sparkles className="size-3.5 text-primary shrink-0" />
                          )}
                          {model.freeTier && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase text-primary">
                              Free
                            </span>
                          )}
                          {model.supportsLora && (
                            <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase text-muted-foreground">
                              LoRA
                            </span>
                          )}
                        </div>

                        {/* Cost */}
                        <span className="text-center font-display text-[0.78rem] font-medium tabular-nums text-foreground/70">
                          {MODEL_PRICING[model.id]
                            ? `${MODEL_PRICING[model.id].price}${MODEL_PRICING[model.id].unit}`
                            : `${model.cost}cr`}
                        </span>

                        {/* Capabilities */}
                        <div className="flex flex-wrap items-center gap-1 max-sm:hidden">
                          {capabilityConfig
                            .filter(({ key }) => caps[key])
                            .map(({ key, color }) => {
                              const labels = capabilityLabels[key]
                              const capLabel =
                                locale === 'ja'
                                  ? labels.ja
                                  : locale === 'zh'
                                    ? labels.zh
                                    : labels.en
                              return (
                                <span
                                  key={key}
                                  className={cn(
                                    'inline-flex items-center rounded-full px-2 py-0.5 text-[0.62rem] font-semibold',
                                    color,
                                  )}
                                >
                                  {capLabel}
                                </span>
                              )
                            })}
                        </div>
                      </div>
                    </BlurFade>
                  )
                })}
              </MagicCard>
            </TabsContent>
          )
        })}
      </Tabs>
    </section>
  )
}
