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
        'inline-flex h-6 max-w-full items-center gap-1 rounded-md border bg-background pl-2 pr-1 text-2xs',
        weighted ? 'border-foreground/40' : 'border-border',
      )}
    >
      <StudioToolSurface>
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            title={t('weightLabel')}
            className="inline-flex min-w-0 items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
          >
            <span className="truncate">{chip.text}</span>
            {weighted ? (
              <span className="font-mono text-3xs tabular-nums text-muted-foreground">
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
                className="grid size-7 place-items-center rounded-md border border-border text-sm transition-colors duration-fast ease-standard hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
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
                className="grid size-7 place-items-center rounded-md border border-border text-sm transition-colors duration-fast ease-standard hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
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
              className="self-start text-2xs text-muted-foreground underline-offset-2 transition-colors duration-fast ease-standard hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
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
        className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
      >
        <X className="size-2.5" />
      </button>
    </span>
  )
}
