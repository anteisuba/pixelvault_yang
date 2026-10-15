'use client'

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { STUDIO_PROMPT_SCROLL_ANCHOR_ID } from '@/constants/studio-mobile'
import { useStudioMobileComposerHeight } from '@/hooks/use-studio-mobile-composer-height'
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
  /**
   * 手机标签台默认收起：一行摘要 + 工具行，图 / 查资料占满舞台
   * （owner 2026-10-15「看图片作为重点 · 标签那边被挤压的看不到内容」）。
   * 点摘要展开；点舞台、打开面板时收回去。展开时盖在舞台上，⛔ 不把图挤小。
   */
  const [expanded, setExpanded] = useState(false)
  /** 点摘要展开后，编辑区挂上的那一拍把焦点交给标签输入。 */
  const focusOnExpand = useRef(false)
  useStudioMobileComposerHeight(composerRef, expanded)

  useLayoutEffect(() => {
    if (!expanded || !focusOnExpand.current) return
    focusOnExpand.current = false
    composerRef.current
      ?.querySelector<HTMLInputElement>('[data-assistant-field="prompt"] input')
      ?.focus()
  }, [expanded])

  useEffect(() => {
    if (!expanded) return
    const stage = composerRef.current
      ?.closest('.studio-layout-v2')
      ?.querySelector('.studio-mobile-stage')
    if (!stage) return
    const collapse = () => setExpanded(false)
    stage.addEventListener('pointerdown', collapse)
    return () => stage.removeEventListener('pointerdown', collapse)
  }, [expanded])

  const openPanel = (panel: TagWorkbenchPanel | null) => {
    if (panel) setExpanded(false)
    onOpenPanel(panel)
  }

  // 与 PC 一样上下两张卡（owner 2026-10-04）：底部一条地台灰，里面浮一张白卡；
  // 舞台卡在它上方结束（`.studio-mobile-stage` 的下外边距）。
  return (
    <div
      ref={composerRef}
      id={STUDIO_PROMPT_SCROLL_ANCHOR_ID}
      tabIndex={-1}
      data-expanded={expanded}
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
          compact={!expanded}
          onExpand={() => {
            focusOnExpand.current = true
            setExpanded(true)
          }}
          onOpenPanel={openPanel}
          activePanel={activePanel}
        />
      </div>
    </div>
  )
})
