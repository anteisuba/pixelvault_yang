/* eslint-disable @next/next/no-img-element */
import {
  ArrowLeft,
  ArrowUpRight,
  Coins,
  Download,
  ImageIcon,
} from 'lucide-react'
import type { Metadata } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { isCjkLocale, type AppLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { getGenerationById } from '@/services/generation.service'

import { GalleryDetailVideoPlayer } from '@/components/business/GalleryDetailVideoPlayer'
import { Button } from '@/components/ui/button'

interface ImageDetailPageProps {
  params: Promise<{ locale: AppLocale; id: string }>
}

export async function generateMetadata({
  params,
}: ImageDetailPageProps): Promise<Metadata> {
  const { id, locale } = await params
  const generation = await getGenerationById(id)

  if (!generation || !generation.isPublic) {
    return { title: 'Not Found' }
  }

  const tModels = await getTranslations({ locale, namespace: 'Models' })

  const modelLabel = isBuiltInModel(generation.model)
    ? tModels(`${getModelMessageKey(generation.model)}.label`)
    : generation.model

  const title = `${modelLabel} — PixelVault`
  const description = generation.isPromptPublic
    ? generation.prompt.slice(0, 160)
    : `AI-generated ${generation.outputType === 'VIDEO' ? 'video' : 'image'} by ${modelLabel}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const ogImageUrl = `${appUrl}/api/og?type=generation&id=${id}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${appUrl}/${locale}/gallery/${id}`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: description,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function ImageDetailPage({
  params,
}: ImageDetailPageProps) {
  const { id, locale } = await params
  const generation = await getGenerationById(id)

  if (!generation || !generation.isPublic) {
    notFound()
  }

  const isDenseLocale = isCjkLocale(locale)
  const t = await getTranslations({ locale, namespace: 'ImageDetail' })
  const tCard = await getTranslations({ locale, namespace: 'GalleryCard' })
  const tCommon = await getTranslations({ locale, namespace: 'Common' })
  const tModels = await getTranslations({ locale, namespace: 'Models' })
  const format = await getFormatter({ locale })

  const modelLabel = isBuiltInModel(generation.model)
    ? tModels(`${getModelMessageKey(generation.model)}.label`)
    : generation.model

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const createdAt = new Date(generation.createdAt)
  const aspectRatio = `${Math.max(generation.width, 1)} / ${Math.max(generation.height, 1)}`

  const isVideo = generation.outputType === 'VIDEO'

  const jsonLdDescription = generation.isPromptPublic
    ? generation.prompt
    : `AI-generated ${isVideo ? 'video' : 'image'}`

  const jsonLd = isVideo
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: `${modelLabel} generation`,
        description: jsonLdDescription,
        contentUrl: generation.url,
        url: `${appUrl}/${locale}/gallery/${id}`,
        duration: generation.duration ? `PT${generation.duration}S` : undefined,
        uploadDate: createdAt.toISOString(),
        creator: { '@type': 'Organization', name: 'PixelVault' },
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        name: `${modelLabel} generation`,
        description: jsonLdDescription,
        contentUrl: generation.url,
        url: `${appUrl}/${locale}/gallery/${id}`,
        width: generation.width,
        height: generation.height,
        dateCreated: createdAt.toISOString(),
        creator: { '@type': 'Organization', name: 'PixelVault' },
      }

  const labelClass = cn(
    'text-nav font-semibold text-muted-foreground',
    isDenseLocale
      ? 'tracking-normal normal-case'
      : 'uppercase tracking-nav-dense',
  )

  const metadata = [
    { label: tCard('modelLabel'), value: modelLabel, key: 'model' },
    {
      label: tCard('providerLabel'),
      value: generation.provider,
      key: 'provider',
    },
    {
      label: tCard('requestsLabel'),
      value: tCommon('creditCount', { count: generation.requestCount }),
      key: 'requests',
      icon: <Coins className="size-3 text-primary" />,
    },
  ]

  return (
    <div className="editorial-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="editorial-container max-w-4xl">
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
          >
            <Link href={ROUTES.GALLERY}>
              <ArrowLeft className="size-3.5" />
              {t('backToGallery')}
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border/75 bg-card">
          <div className="bg-secondary/18">
            {isVideo ? (
              <GalleryDetailVideoPlayer
                src={generation.url}
                width={generation.width}
                height={generation.height}
              />
            ) : (
              <img
                src={generation.url}
                alt={generation.isPromptPublic ? generation.prompt : modelLabel}
                className="h-auto max-h-[70svh] w-full object-contain"
                style={{ aspectRatio }}
              />
            )}
          </div>

          <div className="space-y-5 p-5 sm:p-6">
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
            </div>

            {generation.isPromptPublic ? (
              <>
                <div className="space-y-2">
                  <p className={labelClass}>{t('promptLabel')}</p>
                  <p className="font-serif text-base leading-7 text-foreground">
                    {generation.prompt}
                  </p>
                </div>

                {generation.negativePrompt ? (
                  <div className="space-y-2">
                    <p className={labelClass}>{t('negativePromptLabel')}</p>
                    <p className="font-serif text-sm leading-6 text-muted-foreground">
                      {generation.negativePrompt}
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}

            {generation.referenceImageUrl ? (
              <div className="space-y-2">
                <p className={cn(labelClass, 'flex items-center gap-1.5')}>
                  <ImageIcon className="size-3" />
                  {t('referenceImageLabel')}
                </p>
                <a
                  href={generation.referenceImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-fit"
                >
                  <img
                    src={generation.referenceImageUrl}
                    alt={t('referenceImageLabel')}
                    className="h-auto max-h-40 rounded-xl border border-border/70 object-contain"
                  />
                </a>
              </div>
            ) : null}

            <dl className="grid gap-2 border-t border-border/70 pt-4">
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
              <div className="flex items-start justify-between gap-3">
                <dt className={labelClass}>{t('dimensionsLabel')}</dt>
                <dd className="text-right text-sm text-foreground">
                  {generation.width} &times; {generation.height}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                asChild
              >
                <a href={generation.url} download>
                  <Download className="size-3.5" />
                  {t('download')}
                </a>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                asChild
              >
                <a
                  href={generation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ArrowUpRight className="size-3.5" />
                  {t('openOriginal')}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
