'use client'

import { useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import {
  StudioSpecFields,
  useStudioSpecSummary,
} from '@/components/business/studio/StudioSpecFields'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioSpecPopoverProps {
  disabled?: boolean
}

/**
 * StudioSpecPopover —— 桌面参数栏专用的「规格」单一触发器：比例 · 清晰度 ·
 * 每模型几张收进一个下拉，触发器上写全（`16:9 · 自动 · 每模型 1 张`）。
 *
 * 对标 LibTV 把生成数量做成与比例、分辨率同级的常规参数、压在一个下拉里；
 * owner 2026-08-14 拍板照此做。
 *
 * ⚠ 三档的**内容**住在 `StudioSpecFields`（2026-09-03 抽出）：移动端底部
 * composer 的规格 sheet 用的是同一颗，两处不再各写一份取值域。这里只剩
 * 「触发器 + 锚定浮层」这层壳。
 */
export function StudioSpecPopover({ disabled }: StudioSpecPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const { full: summary } = useStudioSpecSummary()

  const triggerRef = useRef<HTMLButtonElement>(null)
  const open = state.panels.spec

  return (
    <StudioToolSurface
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'spec',
        })
      }
    >
      <StudioToolSurfaceTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={t('specLabel')}
          className={cn(
            'touch-target-y flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
            'transition-colors duration-fast ease-standard hover:border-primary/25',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            'disabled:pointer-events-none disabled:opacity-50',
            open && 'border-primary/30 bg-muted/45',
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown
            className={cn(
              'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
              open && 'rotate-180',
            )}
          />
        </button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="small"
        className="w-64"
        side="bottom"
        align="start"
        label={t('specLabel')}
      >
        <StudioSpecFields />
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
