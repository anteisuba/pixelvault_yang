'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  AlertTriangle,
  Bot,
  Check,
  Download,
  Maximize2,
  Images,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { isBuiltInModel, getModelMessageKey } from '@/constants/models'
import type { GenerationRecord, RunItem } from '@/types'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { StudioGeneratingProgress } from '@/components/business/studio-shared'
import { Button } from '@/components/ui/button'
import { useAskAssistantAboutImage } from '@/hooks/use-ask-assistant-about-image'
import { downloadRemoteAsset } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
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
}: CompareGridProps) {
  const t = useTranslations('StudioV3')
  const tModels = useTranslations('Models')
  const tGallery = useTranslations('GalleryCard')
  const tErrors = useTranslations('Errors')
  const askAssistantAboutImage = useAskAssistantAboutImage()

  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

              <div className="flex flex-wrap items-start gap-3">
                {row.items.map((item, takeIndex) => {
                  const isCompleted =
                    item.status === 'completed' && item.generation != null
                  const isWinner =
                    selectedItemId != null &&
                    item.generation?.id === selectedItemId
                  const isFocused = item.id === focusedItemId

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
                      role="option"
                      aria-selected={isFocused}
                      aria-label={`${modelLabel} ${takeIndex + 1}/${takes}`}
                      tabIndex={isCompleted ? 0 : -1}
                      onClick={() => {
                        if (isCompleted) setFocusedItemId(item.id)
                      }}
                      onKeyDown={(event) => {
                        if (!isCompleted) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setFocusedItemId(item.id)
                        }
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
                          : 'outline outline-1 -outline-offset-1 outline-border/60',
                        'focus-visible:outline-2 focus-visible:outline-primary',
                      )}
                      style={aspectRatio ? { aspectRatio } : undefined}
                    >
                      {item.status === 'generating' && (
                        <>
                          <div className="studio-reveal-shimmer absolute inset-0" />
                          <StudioGeneratingProgress
                            elapsedSeconds={elapsedSeconds}
                            stageLabel={t('generating')}
                            variant="compact"
                          />
                        </>
                      )}

                      {item.status === 'failed' && (
                        <div className="flex size-full flex-col items-center justify-center gap-2 px-4">
                          <AlertTriangle className="size-5 text-destructive/60" />
                          <p className="text-center font-serif text-xs text-muted-foreground">
                            {item.error ?? t('generateFailed')}
                          </p>
                        </div>
                      )}

                      {isCompleted && item.generation && (
                        <OptimizedImage
                          src={item.generation.url}
                          alt={modelLabel}
                          fill
                          sizes="320px"
                          containerClassName="size-full animate-in fade-in duration-300"
                          className="object-cover"
                        />
                      )}

                      {/* 已定为最佳：一个角标，不是按钮 —— 图上依旧零可点元素。 */}
                      {isWinner && (
                        <span className="pointer-events-none absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background">
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
        <div className="studio-touch-actions sticky bottom-0 z-20 mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/95 py-3 backdrop-blur-sm">
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
            onClick={() => setDetailOpen(true)}
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
            onClick={() => onUseAsReference(focusedGeneration.url)}
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
            <Check className="size-3.5" />
            {focusedGeneration.id === selectedItemId
              ? t('variantSelected')
              : t('variantSelectWinner')}
          </Button>
        </div>
      )}

      {focusedGeneration && (
        <ImageDetailModal
          generation={focusedGeneration}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
    </div>
  )
})
