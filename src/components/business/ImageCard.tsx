'use client'
/* eslint-disable @next/next/no-img-element */

import { ArrowUpRight, Coins, Globe2, LockKeyhole } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'

import type { GenerationRecord } from '@/types'
import { cn } from '@/lib/utils'

interface ImageCardProps {
  generation: GenerationRecord
  showVisibility?: boolean
}

export function ImageCard({
  generation,
  showVisibility = false,
}: ImageCardProps) {
  const format = useFormatter()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('GalleryCard')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
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

  return (
    <article className="group overflow-hidden rounded-3xl border border-border/75 bg-card/84 transition-colors hover:border-foreground/15">
      <div className="overflow-hidden bg-secondary/18">
        <a
          href={generation.url}
          target="_blank"
          rel="noreferrer"
          className="block"
          aria-label={t('openImage')}
        >
          <img
            src={generation.url}
            alt={generation.prompt}
            loading="lazy"
            className="h-auto w-full object-cover transition-transform duration-700 group-hover:scale-[1.01]"
            style={{ aspectRatio }}
          />
        </a>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <p
            className={cn(
              'text-[11px] font-semibold text-muted-foreground',
              isDenseLocale
                ? 'tracking-normal normal-case'
                : 'uppercase tracking-[0.16em]',
            )}
          >
            {format.dateTime(createdAt, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>

          <a
            href={generation.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('openImage')}
          >
            {t('openLabel')}
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>

        <p className="line-clamp-3 font-serif text-[1.01rem] leading-6 text-foreground">
          {generation.prompt}
        </p>

        <dl className="grid gap-2 border-t border-border/70 pt-3">
          {metadata.map((item) => (
            <div
              key={item.key}
              className="flex items-start justify-between gap-3"
            >
              <dt
                className={cn(
                  'text-[11px] font-semibold text-muted-foreground',
                  isDenseLocale
                    ? 'tracking-normal normal-case'
                    : 'uppercase tracking-[0.14em]',
                )}
              >
                {item.label}
              </dt>
              <dd className="flex items-center gap-1.5 text-right text-sm text-foreground">
                {item.icon}
                <span>{item.value}</span>
              </dd>
            </div>
          ))}
          {showVisibility ? (
            <div className="flex items-start justify-between gap-3">
              <dt
                className={cn(
                  'text-[11px] font-semibold text-muted-foreground',
                  isDenseLocale
                    ? 'tracking-normal normal-case'
                    : 'uppercase tracking-[0.14em]',
                )}
              >
                {t('visibilityLabel')}
              </dt>
              <dd className="flex items-center gap-1.5 text-sm text-foreground">
                {generation.isPublic ? (
                  <Globe2 className="size-3 text-chart-2" />
                ) : (
                  <LockKeyhole className="size-3 text-muted-foreground" />
                )}
                <span>
                  {generation.isPublic ? t('publicLabel') : t('privateLabel')}
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  )
}
