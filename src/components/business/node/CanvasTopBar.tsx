'use client'

import { Archive, Bot, ClipboardCheck, Workflow } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { CanvasAppearance } from '@/types/node-workflow'

import { CanvasAppearancePanel } from './CanvasAppearancePanel'

interface CanvasTopBarProps {
  nodeCount: number
  projectName: string
  canvasAppearance: CanvasAppearance | undefined
  onCanvasAppearanceChange(value: CanvasAppearance | undefined): void
  /** 保存是自动的；这里只用来在片名旁显示进行态。 */
  isSaving?: boolean
  /** 包 6 片 2：还有几张待审。0 时徽标整个不渲染。 */
  reviewPendingCount?: number
  /** 点徽标 = 进入显式审阅模式（三条入口之二）。 */
  onStartReview?: () => void
  onOpenProjects?: () => void
  onOpenAssistant?: () => void
  assistantOpen?: boolean
  className?: string
}

export function CanvasTopBar({
  nodeCount,
  projectName,
  canvasAppearance,
  onCanvasAppearanceChange,
  isSaving = false,
  reviewPendingCount = 0,
  onStartReview,
  onOpenProjects,
  onOpenAssistant,
  assistantOpen,
  className,
}: CanvasTopBarProps) {
  const t = useTranslations('StudioNode')

  return (
    <header
      className={cn(
        'pointer-events-none absolute inset-x-4 top-2 flex items-center justify-between gap-3 canvas-topbar',
        onOpenProjects,
        onOpenAssistant,
        assistantOpen,
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenProjects}
        aria-label={t('projectMenu.current')}
        className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-xl border border-node-panel-inner px-2 py-1 canvas-glass"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-node-paint">
          <Workflow className="size-4" />
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 min-w-0 items-center gap-1.5 px-2">
            <span className="truncate text-sm font-semibold text-node-foreground">
              {projectName}
            </span>
            {isSaving ? (
              <Spinner size="sm" className="text-node-muted" />
            ) : null}
          </span>
          <span className="hidden items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-medium text-node-muted sm:inline-flex">
            <Archive className="size-3" />
            {t('nodeCount', { count: nodeCount })}
          </span>
        </span>
      </button>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2">
        {/* 包 6 片 2：待审计数徽标 = 进入审阅模式的第二条入口。**队列为空时整个
            消失**，不是变灰 —— 常驻一个「0 张待审」等于每次开画布都提醒你有件事
            没做完，而其实没有。 */}
        {reviewPendingCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onStartReview}
            aria-label={t('topbar.startReview', { count: reviewPendingCount })}
            title={t('topbar.startReview', { count: reviewPendingCount })}
            className="h-8 gap-1.5 rounded-2xl px-2.5 text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
          >
            <ClipboardCheck className="size-4" />
            <span className="text-xs font-semibold tabular-nums">
              {reviewPendingCount}
            </span>
          </Button>
        ) : null}
        {/* 2026-08-02（owner）：「整理画布」搬进底部编辑栏（CanvasBottomDock）
            —— 它重排的是节点位置，跟缩放/适应/关系线同属「看画布」，不是项目
            级 chrome。顶栏这边只剩外观设置。 */}
        <CanvasAppearancePanel
          appearance={canvasAppearance}
          onChange={onCanvasAppearanceChange}
        />
        {!assistantOpen && onOpenAssistant ? (
          <button
            type="button"
            onClick={onOpenAssistant}
            className="hidden h-10 items-center gap-2 rounded-lg border border-node-panel-inner px-3 text-xs font-medium text-node-foreground lg:inline-flex canvas-glass"
          >
            <Bot className="size-4" aria-hidden />
            {t('assistant.toggle')}
          </button>
        ) : null}
      </div>
    </header>
  )
}
