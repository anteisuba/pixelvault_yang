'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileText,
  Heart,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Share2,
  X,
} from '@/components/icons'
import { COPIED_ACK_MS } from '@/constants/motion'
import {
  ROUTES,
  creatorProfilePath,
  galleryGenerationPath,
  promptCreatePath,
} from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import type { GenerationRecord, OutputType } from '@/types'
import { GenerationLayerStrip } from '@/components/business/image/GenerationLayerStrip'
import { LikeCount } from '@/components/business/image-card/ImageCardActions'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import {
  InPlaceViewer,
  useInPlaceViewer,
} from '@/components/business/viewer/InPlaceViewer'
import {
  ViewerMedia,
  viewerRatioOf,
} from '@/components/business/viewer/ViewerMedia'
import { ViewerPrompt } from '@/components/business/viewer/ViewerPrompt'
import {
  VIEWER_OUTLINE_ICON,
  VIEWER_OUTLINE_PILL,
  VIEWER_SMALL_PILL,
} from '@/components/business/viewer/viewer-classes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { Link, useRouter } from '@/i18n/navigation'
import { downloadRemoteAsset } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import {
  openExternalAsset,
  triggerDirectAssetDownload,
} from '@/lib/asset-links'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/video-utils'

/** 参考图最多摆几张。 */
const MAX_REFERENCE_THUMBS = 8

interface GalleryViewerProps {
  generation: GenerationRecord
  /** 能翻的那组：当前已加载、当前筛选结果里的图片。 */
  images: readonly GenerationRecord[]
  onNavigate: (next: GenerationRecord) => void
  /** 关上的动画演完了（或做同款要离开这一页）：由画廊把这一张放下。 */
  onClose: () => void
  /** ♥ 由画廊统一记（卡片与查看器看同一个数）。 */
  onToggleLike: (generation: GenerationRecord) => void
}

function studioRouteFor(outputType: OutputType) {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

/**
 * 画廊的就地查看器（domains/gallery.md「卡片、顶栏与详情」· 设计画布「A / B 点开 =
 * 就地查看器」）：外壳与素材页同一个 `InPlaceViewer`，这里给舞台上的那一件和右边
 * 340「作者与配方」。作者没公开提示词时，配方那一半整个收起。
 */
export function GalleryViewer(props: GalleryViewerProps) {
  const t = useTranslations('GalleryPage.viewer')
  const { generation, images, onNavigate, onClose } = props

  return (
    <InPlaceViewer
      current={generation}
      items={generation.outputType === 'IMAGE' ? images : []}
      onNavigate={onNavigate}
      onClose={onClose}
      label={t('label')}
      tileAttribute="data-gallery-tile-id"
      ratioOf={viewerRatioOf}
      darkStage={generation.outputType === 'VIDEO'}
      media={<ViewerMedia key={generation.id} generation={generation} />}
      thumbnailOf={getGenerationThumbnailUrl}
      thumbLabel={(n) => t('thumb', { n })}
      previousLabel={t('previous')}
      nextLabel={t('next')}
      className="pt-3"
    >
      <GalleryViewerAside {...props} />
    </InPlaceViewer>
  )
}

/** 右边 340：作者 → 动作 → 提示词 → 元信息 → 参考图 · 图层 → 复制 · 原图。 */
function GalleryViewerAside({
  generation,
  onClose,
  onToggleLike,
}: GalleryViewerProps) {
  const api = useInPlaceViewer()
  const t = useTranslations('GalleryPage.viewer')
  const tDetail = useTranslations('ImageDetail')
  const tCard = useTranslations('GalleryCard')
  const tModels = useTranslations('Models')
  const tErrors = useTranslations('Errors')
  const format = useFormatter()
  const locale = useLocale()
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [copied, setCopied] = useState<'link' | 'prompt' | null>(null)

  // 菜单开着时，Esc 与方向键归它。
  const { setKeyboardBlocked } = api
  useEffect(() => {
    setKeyboardBlocked(menuOpen)
  }, [menuOpen, setKeyboardBlocked])

  // 服务端对没公开的提示词已经抹掉（domains/gallery.md 隐私红线）；这里只决定摆什么。
  const promptPublic =
    generation.isPromptPublic && generation.prompt.trim().length > 0
  const isLiked = Boolean(generation.isLiked)
  const creator = generation.creator
  const creatorName =
    creator?.displayName?.trim() || creator?.username?.trim() || ''

  const flashCopied = (what: 'link' | 'prompt') => {
    setCopied(what)
    window.setTimeout(
      () => setCopied((value) => (value === what ? null : value)),
      COPIED_ACK_MS,
    )
  }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${locale}${galleryGenerationPath(generation.id)}`,
      )
      flashCopied('link')
    } catch {
      toast.error(tDetail('shareFailed'))
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generation.prompt)
      flashCopied('prompt')
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  const remix = () => {
    try {
      sessionStorage.setItem(
        STUDIO_PREFILL_PROMPT_STORAGE_KEY,
        generation.prompt,
      )
    } catch {
      // 存不进就只换页，工作台照常打开。
    }
    onClose()
    router.push(studioRouteFor(generation.outputType))
  }

  const download = async () => {
    if (isDownloading) return
    const ext = generation.mimeType.split('/')[1] || 'png'
    const fileName = `pixelvault-${generation.id.slice(0, 8)}.${ext}`
    if (!isSignedIn) {
      triggerDirectAssetDownload(generation.url, fileName)
      return
    }
    setIsDownloading(true)
    try {
      const result = await downloadRemoteAsset(generation.url, fileName)
      if (!result.success) {
        toast.error(
          getApiErrorMessage(tErrors, result, tDetail('downloadFailed')),
        )
        triggerDirectAssetDownload(generation.url, fileName)
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const durationLabel =
    typeof generation.duration === 'number' && generation.duration > 0
      ? formatDuration(Math.round(generation.duration))
      : null
  const sizeLine = [
    generation.width > 0 && generation.height > 0
      ? `${generation.width}×${generation.height}`
      : null,
    durationLabel,
  ]
    .filter(Boolean)
    .join(' · ')
  const references = (
    generation.referenceImages?.map((reference) => reference.url) ??
    (generation.referenceImageUrl ? [generation.referenceImageUrl] : [])
  ).slice(0, MAX_REFERENCE_THUMBS)
  const menuZoom = getChipZoomMotion({
    side: 'bottom',
    align: 'end',
    sideOffset: 6,
  })

  const row = (label: string, value: ReactNode) => (
    <div className="flex gap-3 text-2sm">
      <span className="w-16 shrink-0 pt-0.5 text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{value}</div>
    </div>
  )

  return (
    <>
      <div className="flex items-center gap-2.5 px-5">
        {creator?.username ? (
          <Link
            href={creatorProfilePath(creator.username)}
            aria-label={tCard('creatorProfileLabel', { name: creatorName })}
            className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {creator.avatarUrl ? (
              <Image
                src={creator.avatarUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="size-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              >
                {creatorName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-2sm font-semibold text-foreground">
                {creatorName}
              </b>
              <small className="truncate text-xs text-muted-foreground">
                @{creator.username}
              </small>
            </span>
          </Link>
        ) : (
          <b className="text-2sm font-semibold text-foreground">
            {tDetail('title')}
          </b>
        )}
        <button
          type="button"
          autoFocus
          onClick={api.requestClose}
          aria-label={t('close')}
          className="ml-auto grid size-7.5 shrink-0 place-items-center rounded-full bg-muted text-foreground/75 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-5">
        {promptPublic ? (
          <button
            type="button"
            onClick={remix}
            className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-2sm font-semibold text-primary-foreground transition-[background-color,transform] duration-fast hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.98]"
          >
            <Plus className="size-3.5" aria-hidden />
            {t('remix')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onToggleLike(generation)}
          aria-pressed={isLiked}
          aria-label={isLiked ? tCard('unlike') : tCard('like')}
          className={VIEWER_OUTLINE_PILL}
        >
          <Heart
            weight={isLiked ? 'fill' : 'bold'}
            className="size-3.5"
            aria-hidden
          />
          <LikeCount count={generation.likeCount ?? 0} />
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className={VIEWER_OUTLINE_PILL}
        >
          {copied === 'link' ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Share2 className="size-3.5" aria-hidden />
          )}
          {copied === 'link' ? t('linkCopied') : tDetail('shareLink')}
        </button>
        <button
          type="button"
          onClick={() => void download()}
          disabled={isDownloading}
          aria-label={
            isDownloading ? tDetail('downloading') : tDetail('download')
          }
          title={tDetail('download')}
          className={VIEWER_OUTLINE_ICON}
        >
          {isDownloading ? (
            <Spinner size="sm" />
          ) : (
            <Download className="size-3.5" aria-hidden />
          )}
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('more')}
              title={t('more')}
              className="grid size-8.5 shrink-0 place-items-center rounded-full text-foreground/75 transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className={cn('w-50 rounded-2xl p-1.5', menuZoom.className)}
            style={menuZoom.style}
          >
            {promptPublic ? (
              <DropdownMenuItem asChild className="rounded-xl">
                <Link
                  href={promptCreatePath({
                    prompt: generation.prompt,
                    negativePrompt: generation.negativePrompt,
                    modelId: generation.model,
                    provider: generation.provider,
                    outputType: generation.outputType,
                    generationId: generation.id,
                  })}
                >
                  <FileText aria-hidden />
                  {tDetail('savePromptTemplate')}
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() => openExternalAsset(generation.url)}
              className="rounded-xl"
            >
              <ArrowUpRight aria-hidden />
              {t('openOriginal')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="studio-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5">
        {promptPublic ? (
          <ViewerPrompt
            key={generation.id}
            text={generation.prompt}
            labels={{
              title: tDetail('promptLabel'),
              copy: t('copy'),
              copied: t('copied'),
              copyFailed: t('copyFailed'),
              expand: t('expand'),
              collapse: t('collapse'),
            }}
          />
        ) : (
          <p className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-2sm text-muted-foreground">
            <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
            {t('promptPrivate')}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {promptPublic
            ? row(
                t('negative'),
                <span className="break-words font-mono text-xs leading-5 text-foreground">
                  {generation.negativePrompt?.trim() || '—'}
                </span>,
              )
            : null}
          {generation.model
            ? row(
                tCard('modelLabel'),
                <span className="break-all font-mono text-xs leading-5 text-foreground">
                  {getTranslatedModelLabel(tModels, generation.model)}
                </span>,
              )
            : null}
          {sizeLine
            ? row(
                tDetail('dimensionsLabel'),
                <span className="font-mono text-xs leading-5 tabular-nums text-foreground">
                  {sizeLine}
                </span>,
              )
            : null}
          {row(
            t('publishedAt'),
            <span className="text-xs leading-5 text-foreground">
              {format.dateTime(new Date(generation.createdAt), {
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>,
          )}
        </div>

        {references.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h5 className="text-2xs font-semibold text-muted-foreground">
              {t('references')}
            </h5>
            <div className="flex flex-wrap gap-1.5">
              {references.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- 参考图是生成时带的直链。
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt={t('referenceAlt', { n: i + 1 })}
                  loading="lazy"
                  className="h-14.5 w-11 rounded-lg bg-muted object-cover"
                />
              ))}
            </div>
          </div>
        ) : null}

        {generation.layers?.length ? (
          <GenerationLayerStrip
            key={generation.id}
            layers={generation.layers}
            labelClassName="text-2xs font-semibold text-muted-foreground"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2 px-5">
        {promptPublic ? (
          <button
            type="button"
            onClick={() => void copyPrompt()}
            className={VIEWER_SMALL_PILL}
          >
            {copied === 'prompt' ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            {copied === 'prompt' ? t('copied') : tDetail('copyPrompt')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => openExternalAsset(generation.url)}
          className={VIEWER_SMALL_PILL}
        >
          <ArrowUpRight className="size-3.5" aria-hidden />
          {t('openOriginal')}
        </button>
      </div>
    </>
  )
}
