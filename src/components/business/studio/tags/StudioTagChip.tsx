'use client'

import { useTranslations } from 'next-intl'

import { X } from '@/components/icons'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolPopoverBaseClass,
  studioToolSurfaceMobileClass,
  studioToolSurfaceSizeClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { PROMPT_TAG_WEIGHT } from '@/constants/prompt-dialects'
import {
  formatTagWeight,
  isDefaultTagWeight,
  snapTagWeight,
} from '@/lib/tag-composer'
import { cn } from '@/lib/utils'
import type { TagChip } from '@/types/tag-composer'

interface StudioTagChipProps {
  chip: TagChip
  /**
   * `bench` = 标签台的描边格（缺省）；`plain` = 浅底等宽格（提示词页的标签模板，
   * 与卡片、详情里那一墙同一个样子）。
   */
  look?: 'bench' | 'plain'
  /** 刚加进来的这一格：落进来时放大一下、浅底褪掉（查资料 B 动效表）。 */
  landing?: boolean
  disabled?: boolean
  onChange: (next: TagChip) => void
  onRemove: () => void
}

/**
 * 编辑器里的一格标签。
 *
 * ⭐ 权重**统一显示成 `×1.2`**（D10 ④）—— 落 payload 时才按 provider 翻成
 * NAI 的 `{tag}` 或 PixAI 的 `(tag:1.2)`，⛔ 界面上不出现任何一家的原生语法。
 * 数字走等宽槽（`font-mono`）：它是机器读的数。
 *
 * 点标签本体开权重弹层（一档 0.05 的 ± 步进 + 归位），× 删掉这一格。
 */
export function StudioTagChip({
  chip,
  look = 'bench',
  landing,
  disabled,
  onChange,
  onRemove,
}: StudioTagChipProps) {
  const t = useTranslations('StudioTags')
  const weighted = !isDefaultTagWeight(chip.weight)

  const step = (delta: number) =>
    onChange({ ...chip, weight: snapTagWeight(chip.weight + delta) })

  return (
    <span
      className={cn(
        // `min-w-0`：否则最小宽度 = 整段字宽，压过 `max-w-full`，截断不生效。
        'inline-flex min-w-0 max-w-full items-center gap-1 rounded-md pr-1 max-lg:h-auto max-lg:min-h-11 max-lg:text-sm',
        look === 'plain'
          ? 'h-5.5 bg-muted pl-1.75 font-mono text-xs'
          : cn(
              'h-6 border bg-background pl-2 text-2xs',
              weighted ? 'border-foreground/40' : 'border-border',
            ),
        landing && 'animate-tag-land motion-reduce:animate-none',
      )}
    >
      <StudioToolSurface>
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            title={t('weightLabel')}
            className="inline-flex min-w-0 items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none max-lg:min-h-11 max-lg:min-w-11"
          >
            {/* 一整句带过来的那一格会很长 —— 截在栏宽里，全文放在 title 上。 */}
            <span className="truncate" title={chip.text}>
              {chip.text}
            </span>
            {weighted ? (
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground lg:text-3xs">
                {formatTagWeight(chip.weight)}
              </span>
            ) : null}
          </button>
        </StudioToolSurfaceTrigger>
        <ResponsivePopoverContent
          label={t('weightLabel')}
          align="start"
          side="top"
          sideOffset={8}
          className={cn(
            studioToolPopoverBaseClass,
            studioToolSurfaceSizeClass.small,
          )}
          mobileClassName={studioToolSurfaceMobileClass.small}
        >
          <div className="flex flex-col gap-2">
            <span className="text-2xs text-muted-foreground">
              {t('weightHint')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('weightDecrease')}
                disabled={chip.weight <= PROMPT_TAG_WEIGHT.MIN}
                onClick={() => step(-PROMPT_TAG_WEIGHT.STEP)}
                className="grid size-11 place-items-center rounded-md border border-border text-sm transition-colors duration-fast ease-standard hover:bg-accent disabled:pointer-events-none disabled:opacity-50 lg:size-7"
              >
                −
              </button>
              <span className="flex-1 text-center font-mono text-sm tabular-nums">
                {formatTagWeight(chip.weight)}
              </span>
              <button
                type="button"
                aria-label={t('weightIncrease')}
                disabled={chip.weight >= PROMPT_TAG_WEIGHT.MAX}
                onClick={() => step(PROMPT_TAG_WEIGHT.STEP)}
                className="grid size-11 place-items-center rounded-md border border-border text-sm transition-colors duration-fast ease-standard hover:bg-accent disabled:pointer-events-none disabled:opacity-50 lg:size-7"
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!weighted}
              onClick={() =>
                onChange({ ...chip, weight: PROMPT_TAG_WEIGHT.DEFAULT })
              }
              className="min-h-11 self-start text-sm text-muted-foreground underline-offset-2 transition-colors duration-fast ease-standard hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50 lg:min-h-0 lg:text-2xs"
            >
              {t('weightReset')}
            </button>
          </div>
        </ResponsivePopoverContent>
      </StudioToolSurface>
      <button
        type="button"
        disabled={disabled}
        aria-label={t('removeTag', { tag: chip.text })}
        onClick={onRemove}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none lg:size-4',
          look === 'plain' ? 'hover:bg-background' : 'hover:bg-muted',
        )}
      >
        <X className="size-3.5 lg:size-2.5" />
      </button>
    </span>
  )
}
