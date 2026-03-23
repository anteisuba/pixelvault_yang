'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'

import { ArrowUpRight, Coins, Globe2, LockKeyhole, Play } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { useRouter } from '@/i18n/navigation'
import { isCjkLocale } from '@/i18n/routing'
import { toggleGenerationVisibility } from '@/lib/api-client'

import type { GenerationRecord } from '@/types'
import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import { cn } from '@/lib/utils'

interface ImageCardProps {
  generation: GenerationRecord
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
}

export function ImageCard({
  generation,
  showVisibility = false,
  showDelete = false,
  onDelete,
}: ImageCardProps) {
  const [isPublic, setIsPublic] = useState(generation.isPublic)
  const [isToggling, setIsToggling] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const router = useRouter()
  const format = useFormatter()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('GalleryCard')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  const handleToggleVisibility = async () => {
    if (isToggling) return
    setIsToggling(true)
    const prev = isPublic
    setIsPublic(!prev)
    const result = await toggleGenerationVisibility(generation.id)
    if (!result.success) {
      setIsPublic(prev)
    } else {
      router.refresh()
    }
    setIsToggling(false)
  }

  const createdAt = new Date(generation.createdAt)
  const modelLabel = isBuiltInModel(generation.model)
    ? tModels(`${getModelMessageKey(generation.model)}.label`)
    : generation.model
  const aspectRatio = `${Math.max(generation.width, 1)} / ${Math.max(
    generation.height,
    1,
  )}`
  const metadata = [
    {
      label: t('modelLabel'),
      value: modelLabel,
      key: 'model',
    },
    {
      label: t('providerLabel'),
      value: generation.provider,
      key: 'provider',
    },
    {
      label: t('requestsLabel'),
      value: tCommon('creditCount', { count: generation.requestCount }),
      key: 'requests',
      icon: <Coins className="size-3 text-primary" />,
    },
  ]

  const labelClass = cn(
    'text-nav font-semibold text-muted-foreground',
    isDenseLocale
      ? 'tracking-normal normal-case'
      : 'uppercase tracking-nav-dense',
  )

  const detailGeneration = {
    ...generation,
    isPublic,
  }

  return (
    <>
      <article className="group overflow-hidden rounded-3xl border border-border/75 bg-card/84 transition-colors hover:border-foreground/15">
        <div className="relative overflow-hidden bg-secondary/18">
          <button
            type="button"
            className="block w-full cursor-pointer"
            onClick={() => setDetailOpen(true)}
            aria-label={
              generation.outputType === 'VIDEO'
                ? t('openVideo')
                : t('openImage')
            }
          >
            <img
              src={generation.url}
              alt={generation.prompt}
              loading="lazy"
              className="h-auto w-full object-cover transition-transform duration-700 group-hover:scale-[1.01]"
              style={{ aspectRatio }}
            />
          </button>
          {generation.outputType === 'VIDEO' && (
            <>
              <span className="absolute bottom-3 left-3 flex size-8 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm">
                <Play className="ml-0.5 size-3.5" fill="currentColor" />
              </span>
              {generation.duration != null && (
                <span className="absolute bottom-3 right-3 rounded-full bg-foreground/60 px-2 py-0.5 font-mono text-xs text-background backdrop-blur-sm">
                  0:{String(Math.round(generation.duration)).padStart(2, '0')}
                </span>
              )}
            </>
          )}
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <p
              className={cn(
                'text-nav font-semibold text-muted-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-nav',
              )}
            >
              {format.dateTime(createdAt, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>

            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 text-nav font-semibold text-muted-foreground transition-colors hover:text-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-nav-dense',
              )}
              aria-label={t('openImage')}
            >
              {t('openLabel')}
              <ArrowUpRight className="size-3.5" />
            </button>
          </div>

          <p className="line-clamp-3 font-serif text-base leading-6 text-foreground">
            {generation.prompt}
          </p>

          <dl className="grid gap-2 border-t border-border/70 pt-3">
            {metadata.map((item) => (
              <div
                key={item.key}
                className="flex items-start justify-between gap-3"
              >
                <dt className={labelClass}>{item.label}</dt>
                <dd className="flex items-center gap-1.5 text-right text-sm text-foreground">
                  {item.icon}
                  <span>{item.value}</span>
                </dd>
              </div>
            ))}

            {showVisibility ? (
              <div className="flex items-start justify-between gap-3 pt-0.5">
                <dt className={labelClass}>{t('visibilityLabel')}</dt>
                <dd className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    {isPublic ? (
                      <Globe2 className="size-3 text-chart-2" />
                    ) : (
                      <LockKeyhole className="size-3 text-muted-foreground" />
                    )}
                    {isPublic ? t('publicLabel') : t('privateLabel')}
                  </span>
                  <button
                    type="button"
                    disabled={isToggling}
                    onClick={() => void handleToggleVisibility()}
                    className={cn(
                      'text-nav font-semibold text-primary underline-offset-2 transition-opacity hover:underline disabled:pointer-events-none',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-nav-dense',
                      isToggling && 'opacity-50',
                    )}
                  >
                    {isPublic ? t('makePrivateAction') : t('makePublicAction')}
                  </button>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </article>

      <ImageDetailModal
        generation={detailGeneration}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        showVisibility={showVisibility}
        showDelete={showDelete}
        onDelete={onDelete}
      />
    </>
  )
}
