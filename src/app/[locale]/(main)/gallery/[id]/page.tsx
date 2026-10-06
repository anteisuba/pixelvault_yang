/* eslint-disable @next/next/no-img-element */
import { cache } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  Coins,
  Download,
  ImageIcon,
  Wand2,
} from '@/components/icons'
import type { Metadata } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { getAppOrigin, SITE_NAME } from '@/constants/config'
import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import {
  ROUTES,
  creatorProfilePath,
  galleryGenerationPath,
  studioCanvasEditPath,
} from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { isCjkLocale, type AppLocale } from '@/i18n/routing'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import {
  buildPromptAltText,
  buildPromptDescription,
  buildPromptTitleSummary,
} from '@/lib/generation-seo'
import { localeUrl, pageAddress } from '@/lib/page-address'
import { cn } from '@/lib/utils'
import { getPublicGenerationById } from '@/services/generation.service'
import type { GenerationRecord } from '@/types'

import { GalleryDetailVideoPlayer } from '@/components/business/GalleryDetailVideoPlayer'
import { Button } from '@/components/ui/button'

// React.cache dedupes the fetch so generateMetadata + the page body share
// one DB round trip per request instead of issuing two `findUnique`s. The
// underlying getter is the slim, public-only variant — skips snapshot /
// recipeSnapshot / evaluation, which can balloon to ~7 MB on a single row.
const loadPublicGeneration = cache(getPublicGenerationById)

interface ImageDetailPageProps {
  params: Promise<{ locale: AppLocale; id: string }>
}

/**
 * 标题 / 描述 / alt 的同一套口径（seo.md「作品详情页的文字」）：
 * 提示词公开 → 清洗后的提示词摘要；没公开 → 「@作者 的 AI 图片 · 模型」，
 * ⛔ 不拿提示词或由它派生的任何东西兜底（`prompt` 在这里已被 redact 成空串）。
 */
async function getDetailSeoText(
  locale: AppLocale,
  generation: GenerationRecord,
  modelLabel: string,
) {
  const t = await getTranslations({ locale, namespace: 'ImageDetail' })
  const type = generation.outputType
  const username = generation.creator?.username
  const prompt = generation.isPromptPublic ? generation.prompt : ''
  const summary = buildPromptTitleSummary(prompt)
  const headline = summary
    ? `${summary} · ${modelLabel}`
    : username
      ? t('seoTitleNoPrompt', { type, username, model: modelLabel })
      : t('seoTitleNoPromptAnonymous', { type, model: modelLabel })
  const description =
    buildPromptDescription(prompt) ||
    t('seoDescriptionNoPrompt', { type, model: modelLabel, site: SITE_NAME })
  const alt = buildPromptAltText(prompt) || headline
  return { headline, description, alt }
}

export async function generateMetadata({
  params,
}: ImageDetailPageProps): Promise<Metadata> {
  const { id, locale } = await params
  const generation = await loadPublicGeneration(id)

  if (!generation) {
    return { title: 'Not Found' }
  }

  const tModels = await getTranslations({ locale, namespace: 'Models' })

  const modelLabel = isBuiltInModel(generation.model)
    ? tModels(`${getModelMessageKey(generation.model)}.label`)
    : generation.model

  const { headline, description } = await getDetailSeoText(
    locale,
    generation,
    modelLabel,
  )
  const title = `${headline} — ${SITE_NAME}`

  const ogImageUrl = `${getAppOrigin()}/api/og?type=generation&id=${id}`
  const address = pageAddress({ locale, path: galleryGenerationPath(id) })

  return {
    title,
    description,
    alternates: address.alternates,
    openGraph: {
      ...address.openGraph,
      title,
      description,
      type: 'article',
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
  const generation = await loadPublicGeneration(id)

  if (!generation) {
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

  // JSON-LD 的 `url` 必须与 canonical 逐字一致，所以走同一支。
  const pageUrl = localeUrl(locale, galleryGenerationPath(id))
  const createdAt = new Date(generation.createdAt)
  const aspectRatio = `${Math.max(generation.width, 1)} / ${Math.max(generation.height, 1)}`

  const isVideo = generation.outputType === 'VIDEO'

  const seo = await getDetailSeoText(locale, generation, modelLabel)
  const creator = generation.creator
    ? {
        '@type': 'Person',
        name: generation.creator.displayName || generation.creator.username,
        url: localeUrl(locale, creatorProfilePath(generation.creator.username)),
      }
    : { '@type': 'Organization', name: SITE_NAME }

  const jsonLd = isVideo
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: seo.headline,
        description: seo.description,
        contentUrl: generation.url,
        url: pageUrl,
        duration: generation.duration ? `PT${generation.duration}S` : undefined,
        uploadDate: createdAt.toISOString(),
        creator,
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        name: seo.headline,
        description: seo.description,
        contentUrl: generation.url,
        url: pageUrl,
        width: generation.width,
        height: generation.height,
        dateCreated: createdAt.toISOString(),
        creator,
      }

  const labelClass = cn(
    'text-2xs font-semibold text-muted-foreground',
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
      value: tCommon('requestCount', { count: generation.requestCount }),
      key: 'requests',
      icon: <Coins className="size-3 text-primary" />,
    },
  ]
  const previewUrl = getGenerationPreviewUrl(generation)

  // `prompt` is user-controlled, so `JSON.stringify(jsonLd)` could contain
  // `</script>` or U+2028/U+2029 separators that break out of the inline
  // script and execute. Escape the three hostile sequences inline — this
  // keeps the JSON syntactically valid while preventing both classic XSS
  // and the line-separator JS parser bug.
  const jsonLdSafe = JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

  return (
    <div className="editorial-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe }}
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
                src={previewUrl}
                alt={seo.alt}
                className="h-auto max-h-[70svh] w-full object-contain"
                style={{ aspectRatio }}
              />
            )}
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <p
                className={cn(
                  'text-2xs font-semibold text-muted-foreground',
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
                  <p className="text-base leading-7 text-foreground">
                    {generation.prompt}
                  </p>
                </div>

                {generation.negativePrompt ? (
                  <div className="space-y-2">
                    <p className={labelClass}>{t('negativePromptLabel')}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
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

              {generation.outputType === 'IMAGE' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  asChild
                >
                  <Link
                    href={studioCanvasEditPath({
                      generationId: generation.id,
                      sourceUrl: generation.url,
                      width: generation.width,
                      height: generation.height,
                    })}
                  >
                    <Wand2 className="size-3.5" />
                    {t('editInStudio')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
