'use client'

import { memo } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { isBuiltInModel, getModelMessageKey } from '@/constants/models'
import type { RunItem } from '@/types'
import { ImageCard } from '@/components/business/ImageCard'
import { StudioGeneratingProgress } from '@/components/business/studio-shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CompareGridProps {
  items: RunItem[]
  selectedItemId: string | null
  onSelect: (generationId: string) => void
  /** 本轮已用秒数（父级的 1s 计时器），透传给 StudioGeneratingProgress。 */
  elapsedSeconds: number
}

export const CompareGrid = memo(function CompareGrid({
  items,
  selectedItemId,
  onSelect,
  elapsedSeconds,
}: CompareGridProps) {
  const t = useTranslations('StudioV3')
  const tModels = useTranslations('Models')

  // 列数跟总张数走（对标原型：并排铺开，不是固定两列）。矩阵下一轮可能有
  // 8 张（4 模型 × 2），三列会把它压得太高。
  const cols =
    items.length <= 2
      ? 'sm:grid-cols-2'
      : items.length <= 6
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-4'

  // 同一个模型出多张时给个 `1/2` 序号 —— 否则一屏里几行同名，分不清哪张是哪张。
  // 只在该模型确实有多张时出现；单张时保持干净的模型名。
  const takesByModel = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.modelId] = (acc[item.modelId] ?? 0) + 1
    return acc
  }, {})
  const seenByModel: Record<string, number> = {}

  return (
    <div
      className={cn('grid grid-cols-1 gap-3', cols)}
      role="radiogroup"
      aria-label={t('variantSelectWinner')}
    >
      {items.map((item) => {
        const isSelected =
          selectedItemId != null && item.generation?.id === selectedItemId
        const isCompleted =
          item.status === 'completed' && item.generation != null

        // Resolve model display name
        const modelLabel = isBuiltInModel(item.modelId)
          ? tModels(`${getModelMessageKey(item.modelId)}.label`)
          : item.modelId
        const takes = takesByModel[item.modelId] ?? 1
        seenByModel[item.modelId] = (seenByModel[item.modelId] ?? 0) + 1
        const takeIndex = seenByModel[item.modelId]

        return (
          <div
            key={item.id}
            role="radio"
            aria-checked={isSelected}
            aria-label={`${modelLabel}: ${item.status}`}
            className={cn(
              'group relative overflow-hidden rounded-xl border border-border/60 bg-muted/10 transition-all',
              isSelected && 'ring-2 ring-primary border-primary/40',
              isCompleted &&
                !isSelected &&
                'hover:border-primary/30 cursor-pointer',
            )}
            onClick={() => {
              if (isCompleted && item.generation) {
                onSelect(item.generation.id)
              }
            }}
          >
            {/* Model label badge — always visible */}
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-2xs font-medium text-foreground shadow-sm backdrop-blur-sm">
              {modelLabel}
              {takes > 1 ? (
                <span className="font-normal tabular-nums text-muted-foreground">
                  {takeIndex}/{takes}
                </span>
              ) : null}
            </div>

            {/* Generating —— 复用既存的 StudioGeneratingProgress（同一套显影
                节奏与 shimmer 底），不再在这里另拼一份 Spinner + 文案。
                compact 变体：格子里放不下大号数字与参数行。 */}
            {item.status === 'generating' && (
              <div className="relative aspect-square w-full overflow-hidden">
                <div className="studio-reveal-shimmer absolute inset-0" />
                <StudioGeneratingProgress
                  elapsedSeconds={elapsedSeconds}
                  stageLabel={t('generating')}
                  variant="compact"
                />
              </div>
            )}

            {/* Failed */}
            {item.status === 'failed' && (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-20">
                <AlertTriangle className="size-5 text-destructive/60" />
                <p className="text-center text-xs text-muted-foreground font-serif">
                  {item.error ?? t('generateFailed')}
                </p>
              </div>
            )}

            {/* Completed */}
            {isCompleted && item.generation && (
              <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                <div className="[&_img]:object-contain">
                  <ImageCard generation={item.generation} />
                </div>

                {/* Hover select button */}
                {!isSelected && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-background/80 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full bg-background/90 backdrop-blur-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (item.generation) {
                          onSelect(item.generation.id)
                        }
                      }}
                    >
                      <Check className="size-3.5" />
                      {t('variantSelectWinner')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
