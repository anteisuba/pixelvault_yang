'use client'

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import dynamic from 'next/dynamic'
import { motion, useReducedMotion } from 'motion/react'
import {
  Ban,
  Bot,
  Check,
  Download,
  Maximize2,
  Images,
  Wand2,
  X,
} from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { isBuiltInModel, getModelMessageKey } from '@/constants/models'
import { EASE_STANDARD, LIQUID_TIMING } from '@/constants/motion'
import type { GenerationRecord, RunItem } from '@/types'
import { BlurSwap } from '@/components/ui/blur-swap'
import { OptimizedImage } from '@/components/ui/optimized-image'
import {
  toMediaTransitionOrigin,
  type MediaTransitionOrigin,
} from '@/components/business/MediaDetailViewer'
import {
  StudioGeneratingProgress,
  type StudioGenerationFailure,
} from '@/components/business/studio-shared'
import { Button } from '@/components/ui/button'
import { useAskAssistantAboutImage } from '@/hooks/use-ask-assistant-about-image'
import { downloadRemoteAsset } from '@/lib/api-client'
import {
  getApiErrorMessage,
  getGenerationErrorMessage,
} from '@/lib/api-error-message'
import { flyImageToComposer } from '@/lib/fly-to-composer'
import { resolveGeneratingStageKey } from '@/lib/generation-progress'
import { flyTileFromGenerate } from '@/lib/studio-workbench-motion'
import { cn } from '@/lib/utils'

// 详情弹窗按需异步加载，和 ImageCard 里同样的理由：它拖着 VideoPlayer /
// ImageCompare / 图片编辑 hook，一共 500+ 行。
// ⚠ 与旧版的差别：只有聚焦结果后才挂载，而且整片图墙只挂**一份**，
// 不再每格一份。
const ImageDetailModal = dynamic(
  () =>
    import('@/components/business/ImageDetailModal').then(
      (m) => m.ImageDetailModal,
    ),
  { ssr: false },
)

interface CompareGridProps {
  items: RunItem[]
  /** 已定为最佳的那张的 generationId（服务端会落库）。 */
  selectedItemId: string | null
  onSelect: (generationId: string) => void
  /** 本轮已用秒数（父级的 1s 计时器），透传给 StudioGeneratingProgress。 */
  elapsedSeconds: number
  onEdit: (generation: GenerationRecord) => void
  onUseAsReference: (url: string) => void
  /** 取消格里正在跑的这一条。给了才画每格右上角的取消按钮。 */
  onCancel?: (itemId: string) => void
  /** 取消这一轮里所有还没结束的条目。给了且确有条目在跑才画「全部取消」。 */
  onCancelAll?: () => void
  /** 失败的那一格原地再来一次（加载态 A）。给了才画格子里的「重试」。 */
  onRetry?: (itemId: string) => void
  /**
   * 挂在某一行行首条和图之间的东西（手机上「先搜再画」的资料条挂进开着搜索的
   * 那一行，换位时跟着那一行走）。
   */
  rowLead?: (row: { modelId: string; items: RunItem[] }) => ReactNode
}

interface ModelRow {
  modelId: string
  items: RunItem[]
}

/**
 * 结果图墙 —— 方向 A「对照台」（owner 2026-08-23 拍板）。
 *
 * 三条结构性规矩，每一条都对着一个真机量到的问题：
 *
 * 1. **一行一个模型**。列数以前只看总格数（`4 格 → 3 列`），于是
 *    「2 模型 × 2 张」被排成 `3 + 1`，同一个模型的两张被拆到两行 ——
 *    矩阵的两个轴在版面上直接丢了。现在行 = 模型，行内 = 第几张。
 *
 * 2. **图上不放任何东西**。旧版每格是画廊形态的 `ImageCard`（自带右上角
 *    收藏 + 下载）叠上本组件的「问助手」，三颗按钮抢同一个角：探针实测
 *    「下载」的正中心点下去命中的是「问助手」。彻底的修法不是挪位置，是
 *    让图上一颗按钮都没有。
 *
 * 3. **元信息尾巴全删**。旧版单格 767px 里图只占 494px，剩下 269px 是日期 /
 *    完整提示词 / 模型 / 提供商 / 请求数 —— 四格并排就是同一段话印四遍。
 *    比较时要看的是图，出处去详情里看。
 *
 * ⚠ 点击语义变了：**点格子 = 聚焦，不再直接定为最佳**。`selectWinner` 是
 * 服务端写入，旧版「点哪张就落库哪张」让浏览的代价等于提交的代价。现在
 * 聚焦是本地态，定最佳要在动作栏上按一次。
 */
export const CompareGrid = memo(function CompareGrid({
  items,
  selectedItemId,
  onSelect,
  elapsedSeconds,
  onEdit,
  onUseAsReference,
  onCancel,
  onCancelAll,
  onRetry,
  rowLead,
}: CompareGridProps) {
  const t = useTranslations('StudioV3')
  const tCancel = useTranslations('GenerationCancel')
  const tModels = useTranslations('Models')
  const tGallery = useTranslations('GalleryCard')
  const tErrors = useTranslations('Errors')
  const tOperator = useTranslations('StudioOperator')
  const askAssistantAboutImage = useAskAssistantAboutImage()
  const reduceMotion = useReducedMotion()

  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrigin, setDetailOrigin] =
    useState<MediaTransitionOrigin | null>(null)

  /**
   * 工作台出图动效（owner 2026-10-07 工作台原型）要知道每一格在哪：
   * 新一轮的格子从生成键散开、详情从这一格长出来、「当参考图」从这一格飞走。
   * `flownTiles`：已经出现过的格子（含挂载时就在的旧结果）⛔ 再飞一次 —— 只有这一轮
   * 新起的、还在生成中的格子才从生成键散开；逐格重试是同一个 id，原地重跑。
   */
  const tileEls = useRef(new Map<string, HTMLElement>())
  const flownTiles = useRef(new Set<string>())
  /** 挂载时就已定为最佳的那张不补播勾的弹出（刷新后重画那一屏 ⛔ 一起动）。 */
  const [winnerAtMount] = useState(selectedItemId)
  const [isDownloading, setIsDownloading] = useState(false)

  /**
   * 按模型分行。`generateCompare` 摊平 items 时同一个模型的 N 张是连续的，
   * 所以「相邻同名合并」既保住了模型顺序，也保住了每个模型内部的张序 ——
   * 不用 groupBy（那会按 key 重排，第 2 张可能跑到第 1 张前面）。
   */
  const rows = useMemo(
    () =>
      items.reduce<ModelRow[]>((acc, item) => {
        const last = acc[acc.length - 1]
        if (last && last.modelId === item.modelId) last.items.push(item)
        else acc.push({ modelId: item.modelId, items: [item] })
        return acc
      }, []),
    [items],
  )

  const focused = items.find(
    (item) => item.id === focusedItemId && item.status === 'completed',
  )
  const focusedGeneration = focused?.generation ?? null
  const tabStopId =
    focusedGeneration !== null
      ? focusedItemId
      : items.find((item) => item.status === 'completed' && item.generation)?.id

  /**
   * 聚焦项在它那一行里是第几张 —— 动作栏要说清「我在操作哪一张」。
   *
   * ⚠ 缺了它的后果：同一个模型的两张，动作栏印的「模型名 + 1024×1536」完全
   * 一样，于是那条栏对两张图长得一模一样，看不出对谁生效。行内只有一张时不印
   * 序号（`第 1 张 / 共 1 张` 是废话）。
   */
  const focusedPosition = useMemo(() => {
    for (const row of rows) {
      const index = row.items.findIndex((item) => item.id === focusedItemId)
      if (index >= 0 && row.items.length > 1) return index + 1
    }
    return null
  }, [rows, focusedItemId])

  // 重新生成一轮后旧的聚焦项已经不在 items 里了，动作栏必须跟着清掉，
  // 否则它会停在上一轮那张图上（按钮还能按，操作的是已经不在屏上的图）。
  useEffect(() => {
    if (focusedItemId && !items.some((item) => item.id === focusedItemId)) {
      setFocusedItemId(null)
    }
  }, [items, focusedItemId])

  const handleDownload = useCallback(async () => {
    if (!focusedGeneration || isDownloading) return
    setIsDownloading(true)
    try {
      const ext = focusedGeneration.mimeType?.split('/')[1] || 'png'
      const result = await downloadRemoteAsset(
        focusedGeneration.url,
        `pixelvault-${focusedGeneration.id.slice(0, 8)}.${ext}`,
      )
      if (!result.success) {
        toast.error(
          getApiErrorMessage(tErrors, result, tGallery('downloadFailed')),
        )
        window.open(focusedGeneration.url, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setIsDownloading(false)
    }
  }, [focusedGeneration, isDownloading, tErrors, tGallery])

  const hasRunning = items.some((item) => item.status === 'generating')
  const doneCount = items.filter((item) => item.status === 'completed').length

  // 逐格重试的那一格自己计时（`startedAt`，整轮早已停表）；只在真有这样的格子在
  // 跑时才起秒表。整轮一起跑的格子仍用批次的计时。
  const hasRetrying = items.some(
    (item) => item.status === 'generating' && item.startedAt !== undefined,
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!hasRetrying) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [hasRetrying])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasRunning && (
        // 顶部进度胶囊（工作台原型「生成键变形 + 顶部胶囊」）：跑着才在，数字换时糊一下。
        <div className="relative mb-3 flex min-h-8 items-center justify-center">
          <motion.span
            data-testid="compare-grid-progress"
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    scale: 0.9,
                    filter: `blur(${LIQUID_TIMING.blurPx}px)`,
                  }
            }
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{
              duration: LIQUID_TIMING.swapInS,
              ease: EASE_STANDARD,
            }}
            className="inline-flex h-7 items-center rounded-full bg-foreground px-3 font-mono text-xs tabular-nums text-background"
          >
            <BlurSwap swapKey={String(doneCount)}>
              {tOperator('result.generating', {
                done: doneCount,
                total: items.length,
              })}
            </BlurSwap>
          </motion.span>
          {onCancelAll && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-0 rounded-full text-muted-foreground"
              onClick={onCancelAll}
            >
              <Ban className="size-3.5" />
              {tCancel('cancelAll')}
            </Button>
          )}
        </div>
      )}
      <div
        className="studio-result-row flex flex-col gap-5"
        role="listbox"
        aria-label={t('variantSelectWinner')}
      >
        {rows.map((row) => {
          const modelLabel = isBuiltInModel(row.modelId)
            ? tModels(`${getModelMessageKey(row.modelId)}.label`)
            : row.modelId
          const takes = row.items.length

          return (
            <div key={row.modelId} className="flex flex-col gap-2">
              {/* 行首条：模型名长在图外面。旧版把它做成压在图上的徽章，
                  那正是右上角三按钮相撞的另一半原因。 */}
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-medium text-foreground">
                  {modelLabel}
                </span>
                {takes > 1 ? (
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {takes}
                  </span>
                ) : null}
                <span className="h-px flex-1 bg-border/60" />
              </div>

              {rowLead?.(row)}

              {/* ⚠ `studio-result-tiles` 不是装饰：桌面这条行是「等高 + 宽度按
                  各自长宽比推」的横排（`--studio-tile-h`），在 375 宽的手机上
                  一行只放得下一张。globals.css 里那条 `<1024` 的媒体查询把它换成
                  真栅格（<640 两列 / 640–1023 三列），桌面 ≥1024 一个像素不变。 */}
              <div className="studio-result-tiles flex flex-wrap items-start gap-3">
                {row.items.map((item, takeIndex) => {
                  const isCompleted =
                    item.status === 'completed' && item.generation != null
                  const isWinner =
                    selectedItemId != null &&
                    item.generation?.id === selectedItemId
                  const isFocused = item.id === focusedItemId
                  const tileElapsed =
                    item.startedAt !== undefined
                      ? Math.max(0, (now - item.startedAt) / 1000)
                      : elapsedSeconds

                  const aspectRatio =
                    item.generation != null
                      ? `${Math.max(item.generation.width, 1)} / ${Math.max(
                          item.generation.height,
                          1,
                        )}`
                      : undefined

                  return (
                    <div
                      key={item.id}
                      ref={(el) => {
                        if (!el) {
                          tileEls.current.delete(item.id)
                          return
                        }
                        tileEls.current.set(item.id, el)
                        if (flownTiles.current.has(item.id)) return
                        flownTiles.current.add(item.id)
                        if (item.status === 'generating')
                          flyTileFromGenerate(el, items.indexOf(item))
                      }}
                      role="option"
                      aria-selected={isFocused}
                      aria-disabled={!isCompleted}
                      aria-label={`${modelLabel} ${takeIndex + 1}/${takes}`}
                      // 「先搜再画」的出线只接开着搜索的格子（桌面资料列找它）。
                      data-search-grounding-tile={
                        item.searchGrounding ? 'true' : undefined
                      }
                      tabIndex={isCompleted && item.id === tabStopId ? 0 : -1}
                      onFocus={() => {
                        if (isCompleted) setFocusedItemId(item.id)
                      }}
                      onClick={() => {
                        if (isCompleted) setFocusedItemId(item.id)
                      }}
                      onKeyDown={(event) => {
                        if (!isCompleted) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setFocusedItemId(item.id)
                          return
                        }
                        const options = Array.from(
                          event.currentTarget
                            .closest('[role="listbox"]')
                            ?.querySelectorAll<HTMLElement>(
                              '[role="option"][aria-disabled="false"]',
                            ) ?? [],
                        )
                        const currentIndex = options.indexOf(
                          event.currentTarget,
                        )
                        let nextIndex: number
                        switch (event.key) {
                          case 'ArrowRight':
                          case 'ArrowDown':
                            nextIndex = Math.min(
                              currentIndex + 1,
                              options.length - 1,
                            )
                            break
                          case 'ArrowLeft':
                          case 'ArrowUp':
                            nextIndex = Math.max(currentIndex - 1, 0)
                            break
                          case 'Home':
                            nextIndex = 0
                            break
                          case 'End':
                            nextIndex = options.length - 1
                            break
                          default:
                            return
                        }
                        event.preventDefault()
                        options[nextIndex]?.focus()
                      }}
                      className={cn(
                        'studio-result-tile relative overflow-hidden rounded-xl bg-muted/10 transition-shadow',
                        aspectRatio ? undefined : 'studio-result-tile--pending',
                        isCompleted && 'cursor-pointer',
                        // ⚠ 聚焦态**不能只用内描边**。这套样式原本是参考轨那
                        // 44×44 缩略图用的：2px 内描边占它宽度的 4.5%，很显眼；
                        // 搬到 190px+ 的结果大图上只占 1%，还压在满幅彩图的边缘
                        // 像素里 —— owner 2026-08-24 实拍「没有选中的感觉」。
                        // 改成画在**图外侧**的 ring + offset：不与图片内容抢像素，
                        // 在任何底色的图上都立得住；未选中保持一条极淡的内描边。
                        isFocused
                          ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                          : cn(
                              'outline outline-1 -outline-offset-1 transition-[outline-color] duration-base ease-linear',
                              // 生成中 / 失败：格子的边交给进度线（⛔ 线旁边再一圈细边）。
                              item.status === 'generating' ||
                                item.status === 'failed'
                                ? 'outline-transparent'
                                : 'outline-border/60',
                            ),
                        'focus-visible:outline-2 focus-visible:outline-primary',
                      )}
                      style={aspectRatio ? { aspectRatio } : undefined}
                    >
                      {item.status === 'generating' && item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt={t('generating')}
                          className="absolute inset-0 size-full object-contain"
                        />
                      ) : null}

                      {item.status === 'cancelled' && (
                        <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
                          <Ban className="size-5 text-muted-foreground/60" />
                          <p className="text-center text-xs">
                            {tCancel('cancelled')}
                          </p>
                        </div>
                      )}

                      {isCompleted && item.generation && (
                        <OptimizedImage
                          src={item.generation.url}
                          alt={modelLabel}
                          fill
                          sizes="320px"
                          containerClassName="studio-result-reveal-in size-full"
                          className="object-cover"
                        />
                      )}

                      {/* 格子自己的边就是进度（加载态 A）：生成中线在格边上走，
                          失败就停住变灰、就地说原因 +「重试」，出图时补满合拢再淡掉。 */}
                      <CompareGridTileEdge
                        item={item}
                        elapsedSeconds={tileElapsed}
                        stageLabel={t(
                          `generatingOverlayStages.${resolveGeneratingStageKey(
                            tileElapsed,
                            'executionStage' in item
                              ? item.executionStage
                              : undefined,
                            Boolean(item.searchGrounding),
                          )}` as const,
                        )}
                        failure={
                          item.status === 'failed'
                            ? {
                                message: getGenerationErrorMessage(
                                  tErrors,
                                  { error: item.error },
                                  t('generateFailed'),
                                ),
                                shortMessage: t('generateFailed'),
                                retryLabel: t('retry'),
                                ...(onRetry
                                  ? { onRetry: () => onRetry(item.id) }
                                  : {}),
                              }
                            : null
                        }
                      />

                      {item.status === 'generating' && onCancel && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onCancel(item.id)
                          }}
                          aria-label={tCancel('cancel')}
                          data-testid="compare-grid-cancel"
                          className="absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-full bg-background/85 text-muted-foreground backdrop-blur-sm transition-colors duration-fast ease-standard hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}

                      {/* 已定为最佳：一个角标，不是按钮 —— 图上依旧零可点元素。 */}
                      {isWinner && (
                        <span
                          className={cn(
                            'pointer-events-none absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background',
                            selectedItemId !== winnerAtMount &&
                              'studio-winner-badge-in',
                          )}
                        >
                          <Check className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">
                            {t('variantSelected')}
                          </span>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 动作栏 —— 全屏唯一一份，永远在图外面。
          `sticky bottom-0`：图墙比一屏长时它跟着停在底边，不用滚回去找。 */}
      {focusedGeneration && (
        // 点一张，动作栏从下面浮上来（工作台原型）；换聚焦的那一张不重播。
        <motion.div
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  y: 12,
                  filter: `blur(${LIQUID_TIMING.blurPx}px)`,
                }
          }
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: LIQUID_TIMING.swapInS * 1.5,
            ease: EASE_STANDARD,
          }}
          className="studio-touch-actions sticky bottom-0 z-20 mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/95 py-3 backdrop-blur-sm"
        >
          <div className="mr-auto flex min-w-0 items-center gap-2.5">
            <span className="truncate text-sm font-medium">
              {isBuiltInModel(focusedGeneration.model)
                ? tModels(
                    `${getModelMessageKey(focusedGeneration.model)}.label`,
                  )
                : focusedGeneration.model}
            </span>
            {focusedPosition !== null ? (
              <span className="text-2xs tabular-nums text-muted-foreground">
                {t('takeLabel', { index: focusedPosition })}
              </span>
            ) : null}
            <span className="text-2xs tabular-nums text-muted-foreground">
              {focusedGeneration.width}×{focusedGeneration.height}
            </span>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              // 详情从这一格长出来（`MediaDetailViewer` 的 transitionOrigin）。
              const tile = focusedItemId
                ? tileEls.current.get(focusedItemId)
                : undefined
              setDetailOrigin(
                tile
                  ? toMediaTransitionOrigin(tile.getBoundingClientRect())
                  : null,
              )
              setDetailOpen(true)
            }}
          >
            <Maximize2 className="size-3.5" />
            {t('openDetail')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => onEdit(focusedGeneration)}
          >
            <Wand2 className="size-3.5" />
            {t('toolEdit')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              // 图飞进输入框（纯装饰，挂载照常立刻做）。
              const tile = focusedItemId
                ? tileEls.current.get(focusedItemId)
                : undefined
              const prompt = document.getElementById('studio-prompt')
              if (tile && prompt)
                flyImageToComposer(tile, prompt, focusedGeneration.url)
              onUseAsReference(focusedGeneration.url)
            }}
          >
            <Images className="size-3.5" />
            {t('useAsReference')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isDownloading}
            onClick={() => void handleDownload()}
          >
            <Download className="size-3.5" />
            {t('toolDownload')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => askAssistantAboutImage(focusedGeneration.url)}
          >
            <Bot className="size-3.5" />
            {t('toolAskAssistant')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={focusedGeneration.id === selectedItemId}
            onClick={() => onSelect(focusedGeneration.id)}
          >
            <BlurSwap
              swapKey={
                focusedGeneration.id === selectedItemId ? 'selected' : 'select'
              }
              className="gap-1.5"
            >
              <Check className="size-3.5" />
              {focusedGeneration.id === selectedItemId
                ? t('variantSelected')
                : t('variantSelectWinner')}
            </BlurSwap>
          </Button>
        </motion.div>
      )}

      {focusedGeneration && (
        <ImageDetailModal
          generation={focusedGeneration}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          transitionOrigin={detailOrigin}
        />
      )}
    </div>
  )
})

/**
 * 一格自己的边就是进度（加载态 A「边即进度」）：生成中线在格边上走；失败就停在
 * 原处变灰、就地说原因 +「重试」（窄于 160px 只写短句，原因留给读屏）；出图时线
 * 补满合拢、停一拍再淡掉（⛔ 格子一完成就把线抽走）。
 */
function CompareGridTileEdge({
  item,
  elapsedSeconds,
  stageLabel,
  failure,
}: {
  item: RunItem
  elapsedSeconds: number
  stageLabel: string
  failure: StudioGenerationFailure | null
}) {
  // 出图那一拍：这一格刚从生成中变成完成，进度层多留一拍（渲染期对齐自己的 props）。
  const [status, setStatus] = useState(item.status)
  const [completing, setCompleting] = useState(false)
  if (status !== item.status) {
    setStatus(item.status)
    setCompleting(status === 'generating' && item.status === 'completed')
  }
  if (item.status !== 'generating' && item.status !== 'failed' && !completing) {
    return null
  }
  return (
    <StudioGeneratingProgress
      elapsedSeconds={elapsedSeconds}
      stageLabel={stageLabel}
      variant="compact"
      isCompleting={completing}
      onCompleteAnimationDone={() => setCompleting(false)}
      failure={item.status === 'failed' ? failure : null}
    />
  )
}
