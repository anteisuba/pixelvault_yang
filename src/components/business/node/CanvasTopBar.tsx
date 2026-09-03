'use client'

import { Archive, ClipboardCheck, Workflow } from 'lucide-react'
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
  className,
}: CanvasTopBarProps) {
  const t = useTranslations('StudioNode')

  return (
    <header
      className={cn(
        // S2a（2026-07-26）：从「浮在画布上的深色圆角块」改成贴边通栏玻璃。
        // canvas-glass + canvas-topbar 在 .domain-canvas 作用域内接管背景/边/
        // 投影/高度（特异度 0,2,0 高于工具类），旧皮 bg-node-panel 那套只在
        // 作用域外还生效。inset 归零 —— 顶栏是「这一屏的框」不是浮层。
        'pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between gap-3 border border-node-panel-inner bg-node-panel px-3 canvas-glass canvas-topbar',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-node-paint">
          <Workflow className="size-4" />
        </span>
        <div className="flex min-w-0 items-center gap-2">
          {/* 2026-08-02（owner「移出统一」）：项目名从下拉触发器降为**只读
              面包屑** —— 项目管理整体搬进了左侧面板（CanvasProjectPanel），
              顶栏不再承担它。保存也是自动的，所以这里只留「正在保存」的
              spinner，独立的保存按钮一并移除。 */}
          <div className="flex h-8 min-w-0 items-center gap-1.5 px-2">
            <span className="truncate text-sm font-semibold text-node-foreground">
              {projectName}
            </span>
            {isSaving ? (
              <Spinner size="sm" className="text-node-muted" />
            ) : null}
          </div>
          <span className="hidden items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-medium text-node-muted sm:inline-flex">
            <Archive className="size-3" />
            {t('nodeCount', { count: nodeCount })}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
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
      </div>
    </header>
  )
}
