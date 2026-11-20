'use client'

/**
 * 选中卡的提示词栏**停靠在画布区底部正中**（2026-11-21 定稿 `canvas-card.html`「改成」）。
 *
 * 做法是**传送门**：栏仍由卡自己渲染（草稿、@ 候选、模型 chip、发送都留在卡里，
 * 每张卡的草稿各存各的，换选不串），只是 DOM 落到工作台挂好的那块停靠区里
 * （`CanvasPromptDock`）。停靠区是屏幕空间的浮层 —— 不随画布缩放 / 平移。
 *
 * ⚠ 谁有资格停进来只有一条判据（`isPromptDockOwner`）：画中框开着 = 框里那张；
 * 否则 = 唯一选中的那张。多选 / 没选 → 没有栏。
 *
 * ⛔ 不改 `NodePromptBar` 自己的摆放：剪辑台重拍栏也用它，停靠只是画布节点这一侧的事。
 */

import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import { CANVAS_PROMPT_DOCK } from '@/constants/canvas-shell'
import { cn } from '@/lib/utils'

/** 工作台挂好的停靠区 DOM（`CanvasPromptDock` 报上来）。没有 = 不渲染栏。 */
const PromptDockTargetContext = createContext<HTMLElement | null>(null)

export const NodePromptDockTargetProvider = PromptDockTargetContext.Provider

/** 这张卡此刻该不该占底部那条栏。 */
export function isPromptDockOwner(input: {
  readonly nodeId: string
  readonly selected: boolean
  readonly selectedCount: number
  readonly expandedNodeId: string | null
}): boolean {
  if (input.expandedNodeId !== null)
    return input.expandedNodeId === input.nodeId
  return input.selected && input.selectedCount < 2
}

export function NodePromptDock({
  show,
  children,
}: {
  readonly show: boolean
  readonly children: ReactNode
}) {
  const target = useContext(PromptDockTargetContext)
  if (!show || !target) return null
  return createPortal(
    <div
      data-canvas-prompt-dock-bar
      style={{ maxWidth: CANVAS_PROMPT_DOCK.widthPx }}
      // 卡下面那一格（栏，或换上来的裁剪条 / 选帧条）原样搬过来：栏撑满这一格，
      // 自带定宽的裁剪条居中。
      className="pointer-events-auto flex w-full justify-center"
    >
      {children}
    </div>,
    target,
  )
}

/**
 * 栏最左那颗「对象」药丸：卡的缩略图 + 卡名，点了画布平移到那张卡。
 * 描边不实心 —— 整条里唯一实心深色只给发送键。
 */
export function NodePromptDockTarget({
  name,
  thumbnailUrl,
  onLocate,
}: {
  readonly name: string
  readonly thumbnailUrl?: string | undefined
  onLocate(): void
}) {
  const t = useTranslations('StudioNode.v4.chrome')
  return (
    <button
      type="button"
      data-prompt-dock-target
      aria-label={t('dockTarget', { name })}
      title={name}
      onClick={onLocate}
      className={cn(
        'canvas-prompt-dock-target touch-target-y inline-flex h-8 max-w-40 shrink-0 items-center gap-1.5 rounded-full bg-card text-2sm font-semibold text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus',
        thumbnailUrl ? 'pr-3 pl-1.5' : 'px-3',
      )}
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          draggable={false}
          className="h-5 w-7 shrink-0 rounded-sm object-cover"
        />
      ) : null}
      <span className="min-w-0 truncate">{name}</span>
    </button>
  )
}
