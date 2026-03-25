'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'

import {
  ArrowUpRight,
  Coins,
  Globe2,
  ImageIcon,
  LockKeyhole,
  Play,
} from 'lucide-react'
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
  const [isPromptPublic, setIsPromptPublic] = useState(
    generation.isPromptPublic,
  )
  const [togglingField, setTogglingField] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const router = useRouter()
  const format = useFormatter()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('GalleryCard')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  const handleToggle = async (field: 'isPublic' | 'isPromptPublic') => {
    if (togglingField) return
    setTogglingField(field)
    const setter = field === 'isPublic' ? setIsPublic : setIsPromptPublic
    const prev = field === 'isPublic' ? isPublic : isPromptPublic
    setter(!prev)
    const result = await toggleGenerationVisibility(generation.id, field)
    if (!result.success) {
      setter(prev)
    } else {
      if (result.data) {
        setIsPublic(result.data.isPublic)
        setIsPromptPublic(result.data.isPromptPublic)
      }
      router.refresh()
    }
    setTogglingField(null)
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
    isPromptPublic,
  }

  return (
    <>
      <article className="group overflow-hidden rounded-3xl border border-border/60 bg-card/84 shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
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
            {generation.outputType === 'VIDEO' ? (
              <video
                src={`${generation.url}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                className="h-auto w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                style={{ aspectRatio }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={generation.url}
                alt={generation.prompt}
                loading="lazy"
                className="h-auto w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                style={{ aspectRatio }}
              />
            )}
          </button>
          {generation.referenceImageUrl && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-md">
              <ImageIcon className="size-3" />
              {t('referenceImageLabel')}
            </span>
          )}
          {generation.outputType === 'VIDEO' && (
            <>
              <span className="absolute bottom-3 left-3 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
                <Play className="ml-0.5 size-3.5" fill="currentColor" />
              </span>
              {generation.duration != null && (
                <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-md">
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

          {(showVisibility || generation.isPromptPublic) && (
            <p className="line-clamp-3 font-serif text-base leading-6 text-foreground">
              {generation.prompt}
            </p>
          )}

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
              <>
                <div className="flex items-start justify-between gap-3 pt-0.5">
                  <dt className={labelClass}>{t('imageVisibilityLabel')}</dt>
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
                      disabled={togglingField !== null}
                      onClick={() => void handleToggle('isPublic')}
                      className={cn(
                        'text-nav font-semibold text-primary underline-offset-2 transition-opacity hover:underline disabled:pointer-events-none',
                        isDenseLocale
                          ? 'tracking-normal normal-case'
                          : 'uppercase tracking-nav-dense',
                        togglingField !== null && 'opacity-50',
                      )}
                    >
                      {isPublic
                        ? t('makePrivateAction')
                        : t('makePublicAction')}
                    </button>
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className={labelClass}>{t('promptVisibilityLabel')}</dt>
                  <dd className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm text-foreground">
                      {isPromptPublic ? (
                        <Globe2 className="size-3 text-chart-2" />
                      ) : (
                        <LockKeyhole className="size-3 text-muted-foreground" />
                      )}
                      {isPromptPublic ? t('publicLabel') : t('privateLabel')}
                    </span>
                    <button
                      type="button"
                      disabled={togglingField !== null}
                      onClick={() => void handleToggle('isPromptPublic')}
                      className={cn(
                        'text-nav font-semibold text-primary underline-offset-2 transition-opacity hover:underline disabled:pointer-events-none',
                        isDenseLocale
                          ? 'tracking-normal normal-case'
                          : 'uppercase tracking-nav-dense',
                        togglingField !== null && 'opacity-50',
                      )}
                    >
                      {isPromptPublic
                        ? t('makePrivateAction')
                        : t('makePublicAction')}
                    </button>
                  </dd>
                </div>
              </>
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
