'use client'

import { memo, useLayoutEffect, useRef, type ReactNode } from 'react'
import { STUDIO_PROMPT_SCROLL_ANCHOR_ID } from '@/constants/studio-mobile'
import { cn } from '@/lib/utils'
import { StudioTagsComposer } from './StudioTagsComposer'
import type { TagWorkbenchPanel } from './StudioTagsWorkbench'

export const StudioTagsPromptArea = memo(function StudioTagsPromptArea({
  onOpenPanel,
  activePanel,
  restoring,
  overlay,
}: {
  onOpenPanel: (panel: TagWorkbenchPanel | null) => void
  activePanel: TagWorkbenchPanel | null
  restoring?: boolean
  overlay?: ReactNode
}) {
  const composerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const composer = composerRef.current
    const layout = composer?.closest<HTMLElement>('.studio-layout-v2')
    if (!composer || !layout) return
    const update = () =>
      layout.style.setProperty(
        '--studio-mobile-composer-height',
        `${Math.ceil(composer.getBoundingClientRect().height)}px`,
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(composer)
    return () => {
      observer.disconnect()
      layout.style.removeProperty('--studio-mobile-composer-height')
    }
  }, [])

  // 与 PC 一样上下两张卡（owner 2026-10-04）：底部一条地台灰，里面浮一张白卡；
  // 舞台卡在它上方结束（`.studio-mobile-stage` 的下外边距）。
  return (
    <div
      ref={composerRef}
      id={STUDIO_PROMPT_SCROLL_ANCHOR_ID}
      tabIndex={-1}
      className="studio-mobile-composer studio-tags-mobile-composer fixed inset-x-0 z-40 flex min-h-0 flex-col bg-surface-workbench px-2.5 pt-2.5 outline-none"
    >
      {overlay}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col rounded-2xl bg-card px-3 pt-2 shadow-float',
          restoring &&
            'animate-in fade-in-40 duration-base ease-standard motion-reduce:animate-none',
        )}
      >
        <StudioTagsComposer
          mobile
          onOpenPanel={onOpenPanel}
          activePanel={activePanel}
        />
      </div>
    </div>
  )
})
