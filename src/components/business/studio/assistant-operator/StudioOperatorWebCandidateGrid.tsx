'use client'

/**
 * **找到的图**（联网候选 · 拍板 21 → 搜索期 → P4 第 12 项，owner 2026-10-16）。
 *
 * ── 它是答案的一部分，⛔ 不是过程 ────────────────────────────────
 * 附录 I §四：搜到的东西摆在**回答正文下面**（与来源同一格，面板经
 * `StudioOperatorMessageBody.webFinds` 交进来；找到的视频**另起一块**排在它下面，
 * 见 `StudioOperatorWebVideoRow` —— owner：图和视频要分开，⛔ 不混在一处）。
 * 过程那一行只剩一句「搜索 Google 图片：… · 8 张」（`StudioOperatorLogItem`）。
 *
 * ── 两种排法（owner 2026-10-16 12:34–12:50）──────────────────────
 *  · **电脑**：按原比例一行行铺满（`useJustifiedGrid`，与素材页同一套排法），先露
 *    两行，多了点「还有 N 张」原地长出来；站名**悬停才浮出来**。
 *  · **手机**：仍是胶片条（一条横排、左右滑），站名写在格子下面（手机没有悬停）。
 *  · 图上只留两样：左上 `#n`（与回复里的 `#3` 对得上）、右上**选择圈**；回复点名的
 *    那张常驻一圈细黑框（`operatorFindRingClass`），⛔ 不再贴「回复提到」字样。
 *
 * ── 拍板 21：看与选是两件事 ──────────────────────────────────────
 *  · 点图 = 开灯箱看**原图**（取不到退缩略图），零入库；
 *  · 点圈 = 只是**选上**（这一格自己的状态，⛔ 不发请求）；
 *  · 选了才浮出一条「选了 N 张 · #7 #11 / 清空 / 保存」（贴着这一组底下，往下滚
 *    也跟着），按「保存」才收进素材库。存好的那张圈变 ✓、不能再点，之后 `@` 引用。
 *    ⛔ 保存不再塞进输入框（以前叫「附上」，见 `use-studio-operator-web-import`）。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ImageOff } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS,
  STUDIO_OPERATOR_WEB_GRID,
} from '@/constants/studio-assistant-operator'
import { WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS } from '@/constants/web-image-sources'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import {
  operatorFindCardProps,
  operatorFindRingClass,
  useOperatorFindHighlighted,
} from '@/components/business/studio/assistant-operator/StudioOperatorFindRef'
import { revealStep, useMediaReveal } from '@/components/ui/load-reveal'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { toLayoutAspectRatio } from '@/lib/justified-layout'
import { operatorFindKey } from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'
import { useJustifiedGrid } from '@/hooks/use-justified-grid'
import { useIsMobile } from '@/hooks/use-mobile'
import { useThirdPartyImage } from '@/hooks/use-third-party-image'
import type {
  StudioOperatorWebImportPick,
  StudioOperatorWebImportState,
} from '@/hooks/use-studio-operator-web-import'

/** 一张都没存时共用这一份，⛔ 别写成行内 `[]`（每次 render 换引用）。 */
const NO_PICKS: readonly StudioOperatorWebImportPick[] = []
const NO_NAMED: ReadonlySet<string> = new Set()

/** 长宽比差多少算竖 / 横（宽 / 高）；中间那一段都画成方的。 */
const PORTRAIT_BELOW = 0.87
const LANDSCAPE_ABOVE = 1.15

/**
 * 手机胶片条：同一个高度（`h-44`），宽按原比例落三档：竖 `w-32` · 方 `w-44` · 横 `w-64`；
 * 量不到尺寸的按竖图（找参考图多半是立绘）。
 */
function tileWidthClass(image: AssistantOperatorWebImage): string {
  if (!image.width || !image.height) return 'w-32'
  const ratio = image.width / image.height
  if (ratio < PORTRAIT_BELOW) return 'w-32'
  if (ratio > LANDSCAPE_ABOVE) return 'w-64'
  return 'w-44'
}

/** 量不到尺寸的按 3:4 排（与胶片条「按竖图」同一个假定）。 */
const UNKNOWN_ASPECT = 3 / 4

type TileState = 'idle' | 'staged' | 'saving' | 'saved' | 'error'

interface StudioOperatorWebCandidateGridProps {
  /** ⚠ 保存认的是**线程里这一条的 id**，不是 `step.id`。 */
  entryId: string
  /** 这一次搜的什么 —— 头上那一行「搜索 Google 图片：… · N 张」。 */
  query: string
  /** 找到的图；`null` = **还在搜**：画同形状的灰块（`placeholderCount` 格）。 */
  images: readonly AssistantOperatorWebImage[] | null
  /** 还在搜时画几格灰块 —— 这一步要了几张（`payload.limit`）。 */
  placeholderCount?: number
  /** 这一条上的保存态。`undefined` = 一张都还没存。 */
  webImport: StudioOperatorWebImportState | undefined
  /** 「保存」：把选上的几张收进素材库。缺席 = 只能看（⛔ 不画圈）。 */
  onSave?(entryId: string, images: readonly AssistantOperatorWebImage[]): void
  /** 回复点名的那几张（`operatorFindKey`）：常驻一圈细黑框。 */
  namedFinds?: ReadonlySet<string>
}

export function StudioOperatorWebCandidateGrid({
  entryId,
  query,
  images,
  placeholderCount = ASSISTANT_OPERATOR_LIMITS.maxWebImageResults,
  webImport,
  onSave,
  namedFinds = NO_NAMED,
}: StudioOperatorWebCandidateGridProps) {
  const t = useTranslations('StudioOperator')
  const isMobile = useIsMobile()
  /** 选上、还没存的那几张（原图地址），按选的先后。 */
  const [staged, setStaged] = useState<readonly string[]>([])
  const [expanded, setExpanded] = useState(false)

  /** §四「先给 8 张」。 */
  const shown = images?.slice(0, ASSISTANT_OPERATOR_LIMITS.maxWebImageResults)
  const picks = webImport?.picks ?? NO_PICKS
  const pickOf = (image: AssistantOperatorWebImage) =>
    picks.find((pick) => pick.imageUrl === image.imageUrl)
  const savingCount = picks.filter((pick) => pick.status === 'saving').length
  /** 已存 / 在存的不算「选上」；搜索结果换了，旧的选择作废。 */
  const stagedImages = staged.flatMap((url) => {
    const image = shown?.find((item) => item.imageUrl === url)
    if (!image) return []
    const status = pickOf(image)?.status
    return status === 'saved' || status === 'saving' ? [] : [image]
  })
  const stagedSet = new Set(stagedImages.map((image) => image.imageUrl))

  if (shown && shown.length === 0) return null

  const toggleStage = (image: AssistantOperatorWebImage) => {
    const status = pickOf(image)?.status
    if (status === 'saved' || status === 'saving') return
    setStaged((current) =>
      current.includes(image.imageUrl)
        ? current.filter((url) => url !== image.imageUrl)
        : [...current, image.imageUrl],
    )
  }

  const save = () => {
    if (!onSave || !stagedImages.length) return
    onSave(entryId, stagedImages)
    setStaged([])
  }

  const stateOf = (image: AssistantOperatorWebImage): TileState => {
    const status = pickOf(image)?.status
    if (status === 'saving') return 'saving'
    if (status === 'saved') return 'saved'
    if (stagedSet.has(image.imageUrl)) return 'staged'
    if (status === 'error') return 'error'
    return 'idle'
  }

  /** 不可作输入的理由，按判据合并：一种理由一行，前面写是哪几个站。 */
  const blockedNotes = new Map<string, string[]>()
  if (onSave) {
    for (const image of shown ?? []) {
      if (image.usableAsInput) continue
      const key = WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS[image.sourceVerdict]
      const domain = image.domain ?? t('web.publisherUnknown')
      const domains = blockedNotes.get(key) ?? []
      if (!domains.includes(domain)) domains.push(domain)
      blockedNotes.set(key, domains)
    }
  }
  const failed = (shown ?? []).flatMap((image) => {
    const pick = pickOf(image)
    return pick?.status === 'error' && !stagedSet.has(image.imageUrl)
      ? [{ image, error: pick.error ?? t('web.importFailed') }]
      : []
  })

  const renderTile = (
    image: AssistantOperatorWebImage,
    index: number,
    layout: TileLayout,
  ) => (
    <WebCandidateTile
      key={image.imageUrl}
      image={image}
      index={index}
      layout={layout}
      findKey={image.n ? operatorFindKey(entryId, image.n) : null}
      named={
        image.n !== undefined &&
        namedFinds.has(operatorFindKey(entryId, image.n))
      }
      state={stateOf(image)}
      pickable={Boolean(onSave)}
      onSelect={() => toggleStage(image)}
      onReveal={() => setExpanded(true)}
    />
  )

  return (
    <section
      className="min-w-0"
      data-testid="operator-web-candidates"
      data-entry-id={entryId}
      data-state={shown ? 'ready' : 'loading'}
      data-layout={isMobile ? 'strip' : 'rows'}
      aria-busy={shown ? undefined : true}
    >
      {shown ? (
        <p
          data-testid="operator-web-candidates-caption"
          className="mb-1.5 truncate text-2sm text-muted-foreground"
        >
          {t('web.found', { query, count: shown.length })}
        </p>
      ) : (
        <Skeleton className="mb-1.5 h-5 w-48 max-w-full" />
      )}

      {!shown ? (
        <ul className="flex gap-1.5 overflow-hidden">
          {Array.from(
            {
              length: Math.min(
                Math.max(placeholderCount, 1),
                ASSISTANT_OPERATOR_LIMITS.maxWebImageResults,
              ),
            },
            (_, index) => (
              <li key={index} className="shrink-0">
                <Skeleton
                  data-testid="operator-web-candidate-skeleton"
                  className="h-28 w-24 rounded-lg"
                />
              </li>
            ),
          )}
        </ul>
      ) : isMobile ? (
        <ul
          data-testid="operator-web-candidate-strip"
          aria-label={t('web.stripLabel', { count: shown.length })}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-1"
        >
          {shown.map((image, index) => renderTile(image, index, 'strip'))}
        </ul>
      ) : (
        <JustifiedRows
          images={shown}
          expanded={expanded}
          onExpand={() => setExpanded(true)}
          renderTile={renderTile}
        />
      )}

      {/* 选了才出这一条（贴着这一组底下，往下滚也跟着）。 */}
      {shown && onSave && (stagedImages.length > 0 || savingCount > 0) ? (
        <div
          data-testid="operator-web-bar"
          className="sticky bottom-2 z-10 mt-2 flex h-9 min-w-0 items-center gap-2 rounded-xl bg-foreground pr-1 pl-3 text-2sm text-background shadow-assistant-overlay animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
        >
          <p
            role="status"
            data-testid="operator-web-bar-title"
            className="min-w-0 flex-1 truncate"
          >
            {stagedImages.length
              ? t('web.barSelected', { count: stagedImages.length })
              : t('web.barSaving', { count: savingCount })}
            {stagedImages.map((image) =>
              image.n ? (
                <span
                  key={image.imageUrl}
                  className="ml-1 font-mono text-xs tabular-nums"
                >
                  #{image.n}
                </span>
              ) : null,
            )}
          </p>
          {stagedImages.length ? (
            <>
              <button
                type="button"
                data-testid="operator-web-clear"
                onClick={() => setStaged([])}
                className="h-7 shrink-0 rounded-lg px-2.5 text-background/70 transition-colors duration-fast ease-standard hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {t('web.clear')}
              </button>
              <button
                type="button"
                data-testid="operator-web-save"
                onClick={save}
                className="h-7 shrink-0 rounded-lg bg-background px-3 font-medium text-foreground transition-transform duration-fast ease-standard active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {t('web.save')}
              </button>
            </>
          ) : (
            <Spinner size="sm" className="mr-2 text-background" />
          )}
        </div>
      ) : null}

      {failed.map(({ image, error }) => (
        <p
          key={image.imageUrl}
          data-testid="operator-web-candidate-error"
          className="mt-1.5 text-xs text-status-risk"
        >
          {t('web.saveFailed', {
            handle: image.n
              ? `#${image.n}`
              : (image.domain ?? t('web.publisherUnknown')),
            reason: error,
          })}
        </p>
      ))}
      {[...blockedNotes].map(([key, domains]) => (
        <p
          key={key}
          data-testid="operator-web-candidate-blocked"
          className="mt-1.5 text-xs text-muted-foreground"
        >
          {t('web.blockedNote', {
            domains: domains.join(', '),
            reason: t(key),
          })}
        </p>
      ))}
      {webImport?.refusalError ? (
        <p
          data-testid="operator-web-refusal-error"
          className="mt-1.5 text-2sm text-status-risk"
        >
          {webImport.refusalError}
        </p>
      ) : null}
    </section>
  )
}

type TileLayout = 'strip' | { width: number; height: number; hidden: boolean }

/**
 * 电脑上的排法：按原比例一行行铺满，先露两行；多出来的行**照样挂在 DOM 上只是藏着**
 * —— 回复里的 `#n` 点到藏着的那张时，格子自己叫一声把它们放出来再滚过去。
 */
function JustifiedRows({
  images,
  expanded,
  onExpand,
  renderTile,
}: {
  images: readonly AssistantOperatorWebImage[]
  expanded: boolean
  onExpand(): void
  renderTile(
    image: AssistantOperatorWebImage,
    index: number,
    layout: TileLayout,
  ): ReactNode
}) {
  const t = useTranslations('StudioOperator')
  const aspectRatios = useMemo(
    () =>
      images.map((image) =>
        image.width && image.height
          ? toLayoutAspectRatio(image.width, image.height)
          : UNKNOWN_ASPECT,
      ),
    [images],
  )
  const { containerRef, rows } = useJustifiedGrid({
    aspectRatios,
    targetRowHeight: STUDIO_OPERATOR_WEB_GRID.targetRowHeight,
    gap: STUDIO_OPERATOR_WEB_GRID.gap,
  })
  const hiddenCount = expanded
    ? 0
    : rows
        .slice(STUDIO_OPERATOR_WEB_GRID.collapsedRows)
        .reduce((sum, row) => sum + row.boxes.length, 0)

  return (
    <div
      ref={containerRef}
      data-testid="operator-web-candidate-rows"
      className="flex min-w-0 flex-col"
      style={{ gap: STUDIO_OPERATOR_WEB_GRID.gap }}
    >
      {rows.map((row, rowIndex) => {
        const hidden =
          !expanded && rowIndex >= STUDIO_OPERATOR_WEB_GRID.collapsedRows
        return (
          <ul
            key={rowIndex}
            hidden={hidden}
            className="flex"
            style={{ gap: STUDIO_OPERATOR_WEB_GRID.gap }}
          >
            {row.boxes.map((box) => {
              const image = images[box.index]
              return image
                ? renderTile(image, box.index, {
                    width: box.width,
                    height: box.height,
                    hidden,
                  })
                : null
            })}
          </ul>
        )
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          data-testid="operator-web-more"
          onClick={onExpand}
          className="h-7 self-start rounded-full px-2.5 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          {t('web.moreImages', { count: hiddenCount })}
        </button>
      ) : null}
    </div>
  )
}

function WebCandidateTile({
  image,
  index,
  layout,
  findKey,
  named,
  state,
  pickable,
  onSelect,
  onReveal,
}: {
  image: AssistantOperatorWebImage
  index: number
  layout: TileLayout
  /** 这一格的 `#n` 键（`operatorFindKey`）；没编号（旧内核）= `null`。 */
  findKey: string | null
  /** 回复点名了这一张：常驻细黑框。 */
  named: boolean
  state: TileState
  pickable: boolean
  onSelect(): void
  /** 藏在「还有 N 张」后面时被回复里的 `#n` 点到了：把藏着的行放出来。 */
  onReveal(): void
}) {
  const t = useTranslations('StudioOperator')
  const highlighted = useOperatorFindHighlighted(findKey)
  const itemRef = useRef<HTMLLIElement>(null)
  const hidden = layout !== 'strip' && layout.hidden
  useEffect(() => {
    if (!highlighted || !hidden) return
    onReveal()
  }, [highlighted, hidden, onReveal])
  useEffect(() => {
    if (!highlighted || hidden) return
    itemRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [highlighted, hidden])
  /**
   * 格子里画**缩略图**（gstatic，稳）；取不到再试原图（能走热链代理就先走代理）。
   * 🔬 原图直链约三成 403 —— 格子里先画原图会得到一半碎图。
   */
  const thumb = useThirdPartyImage(image.thumbnailUrl, image.imageUrl)
  const {
    imageRef: revealRef,
    onLoad: onRevealLoad,
    style: revealStyle,
    className: revealClassName,
  } = useMediaReveal({ src: thumb.src ?? '', step: revealStep(index, 0) })

  /** 灯箱底下那一行 / 悬停提示：标题 · 发布者。 */
  const caption =
    [image.title, image.publisher].filter(Boolean).join(' · ') ||
    image.domain ||
    image.pageUrl ||
    image.imageUrl
  const site = image.publisher ?? image.domain ?? t('web.publisherUnknown')
  const handle = image.n ? `#${image.n}` : site
  const viewOnly = !image.usableAsInput
  const selectLabel =
    state === 'saved'
      ? t('web.savedCandidate', { handle })
      : state === 'staged'
        ? t('web.unselectCandidate', { handle })
        : t('web.selectCandidate', { handle })
  const strip = layout === 'strip'

  return (
    <li
      ref={itemRef}
      data-testid="operator-web-candidate-tile"
      {...operatorFindCardProps(findKey, image.n, named, highlighted)}
      style={strip ? undefined : { width: layout.width }}
      className={cn(
        'group flex shrink-0 scroll-m-2 flex-col gap-1',
        strip && 'snap-start',
        strip && tileWidthClass(image),
      )}
    >
      <div
        style={strip ? undefined : { height: layout.height }}
        className={cn(
          'relative w-full overflow-hidden rounded-lg bg-accent',
          strip && 'h-44',
          state === 'error' && 'ring-1 ring-status-risk',
          operatorFindRingClass(named, highlighted),
        )}
      >
        {/* 看 —— ⛔ 这一颗不发任何导入，它只开灯箱（吃**原图**，取不到退缩略图）。 */}
        <button
          type="button"
          data-testid="operator-web-candidate"
          data-state={state}
          data-verdict={image.sourceVerdict}
          onClick={() =>
            openOperatorLightbox(image.imageUrl, caption, {
              thirdParty: true,
              ...(image.thumbnailUrl
                ? { fallbackUrl: image.thumbnailUrl }
                : {}),
            })
          }
          title={caption}
          aria-label={`${t('web.viewLarge')} · ${caption}`}
          className="absolute inset-0 grid cursor-zoom-in place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {thumb.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- 任意第三方图床，进不了 next.config 的 remotePatterns 白名单。
            <img
              key={thumb.src}
              ref={revealRef}
              src={thumb.src}
              alt={image.title ?? image.domain ?? ''}
              width={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
              height={STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS}
              loading="lazy"
              referrerPolicy={thumb.referrerPolicy}
              onLoad={onRevealLoad}
              onError={thumb.onError}
              style={revealStyle}
              className={cn(
                'size-full object-cover',
                viewOnly && 'opacity-60',
                revealClassName,
              )}
            />
          ) : (
            <ImageOff
              data-testid="operator-web-candidate-unavailable"
              className="size-5 text-muted-foreground"
              aria-hidden
            />
          )}
        </button>

        {/* 左上：编号 `#n`（与回复里的 `#3` 对得上）。 */}
        {image.n ? (
          <span
            data-testid="operator-web-candidate-number"
            className="pointer-events-none absolute left-1.5 top-1.5 rounded-sm bg-foreground/75 px-1 font-mono text-2xs font-semibold tabular-nums leading-4 text-background"
          >
            #{image.n}
          </span>
        ) : null}
        {named ? <span className="sr-only">{t('web.findNamed')}</span> : null}

        {/* 电脑：站名悬停才浮出来（点它新窗开原页）。手机写在格子下面。 */}
        {!strip ? (
          <SiteLink
            image={image}
            site={site}
            className="absolute inset-x-1.5 bottom-1.5 w-fit max-w-full rounded-md bg-foreground/75 px-1.5 py-0.5 text-2xs text-background opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
          />
        ) : null}

        {/* 右上：选择圈 —— 只是选上，「保存」才导入；存好了变 ✓、不能再点。
            ⛔ 只能看的（站点不让取图 / 不许当输入）不画圈：底下那行写着理由。 */}
        {pickable && !viewOnly ? (
          <button
            type="button"
            data-testid="operator-web-candidate-use"
            data-state={state}
            aria-pressed={state === 'staged'}
            aria-label={selectLabel}
            disabled={state === 'saving' || state === 'saved'}
            onClick={onSelect}
            className="absolute right-0 top-0 grid size-11 place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring disabled:cursor-default"
          >
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full border-2 border-background transition-[background-color,transform] duration-fast ease-standard motion-reduce:transition-none',
                state === 'idle' && 'bg-foreground/25',
                state === 'error' && 'border-status-risk bg-foreground/25',
                state === 'staged' && 'scale-110 bg-background',
                (state === 'saving' || state === 'saved') &&
                  'bg-background text-foreground',
              )}
            >
              {state === 'staged' ? (
                <span className="size-2 rounded-full bg-foreground" />
              ) : state === 'saved' ? (
                <Check className="size-3" aria-hidden />
              ) : state === 'saving' ? (
                <Spinner size="sm" />
              ) : null}
            </span>
          </button>
        ) : null}
      </div>

      {strip ? (
        <SiteLink
          image={image}
          site={site}
          className="min-w-0 truncate px-0.5 text-xs text-muted-foreground"
        />
      ) : null}
    </li>
  )
}

/** 来源网站：点它新窗开原页；⛔ 没有 `pageUrl` 就只写字（一颗点不开的链接比没有坏）。 */
function SiteLink({
  image,
  site,
  className,
}: {
  image: AssistantOperatorWebImage
  site: string
  className: string
}) {
  const t = useTranslations('StudioOperator')
  return image.pageUrl ? (
    <a
      href={image.pageUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="operator-web-candidate-source"
      title={t('web.openPage')}
      aria-label={t('web.openPageOf', { site })}
      className={cn('block truncate', className)}
    >
      {site}
    </a>
  ) : (
    <span
      data-testid="operator-web-candidate-source"
      className={cn('block truncate', className)}
    >
      {site}
    </span>
  )
}
