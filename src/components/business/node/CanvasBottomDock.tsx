'use client'

import type { ComponentType } from 'react'
import {
  Focus,
  Hand,
  LayoutTemplate,
  MousePointer2,
  Redo2,
  Undo2,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useReactFlow, useViewport } from '@xyflow/react'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_TOOL_MODES,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const TOOL_MODE_ICONS: Record<
  (typeof NODE_STUDIO_TOOL_MODES)[number],
  ComponentType<{ className?: string }>
> = {
  pointer: MousePointer2,
  hand: Hand,
}

// A3 → G2（画布修法 P2 收口，2026-08-26）：这份 options 原来喂给两处触发
// （zoom-level 文本按钮 + Focus 图标按钮），二者 onClick 与 aria-label 逐字
// 相同，读作「两颗同名同义的适应画布」（调查实测）。收口只留 Focus 图标按钮
// 这一颗门；zoom-level 文本退回纯只读展示，不再共享这份 options（见下方
// 渲染处的 `<span>`）。显式 maxZoom 本身的理由不变——让 fit 稳定停在 200%
// 舒适档（NODE_STUDIO_CANVAS.fitViewMaxZoom），不随手动滚轮上限
// （maxZoom: 4）一起被推高。
const FIT_VIEW_OPTIONS = {
  padding: 0.16,
  duration: 220,
  maxZoom: NODE_STUDIO_CANVAS.fitViewMaxZoom,
} as const

interface CanvasBottomDockProps {
  activeMode: NodeStudioToolMode
  canUndo: boolean
  canRedo: boolean
  onModeChange(mode: NodeStudioToolMode): void
  onUndo(): void
  onRedo(): void
  /**
   * R3-1「关系线」总开关（§2.5），反转 by FB-B（真机反馈）: 会话级双态，
   * **默认 `false` = 全显**（骨干+成分边都常显，成分选中时仍升级石绿）；
   * `true` = **收起**（回到骨干常显 / 成分仅选中或生成中显现的旧默认），
   * 给想要干净画布的时候用。
   */
  relationsCollapsed: boolean
  onRelationsCollapsedChange(next: boolean): void
  /**
   * 「整理画布」（owner 2026-08-02 从顶栏右上搬来）。它做的是**重排全部节点
   * 的位置**，跟这条胶囊里的缩放/适应/关系线是同一类「看画布」的操作，而不
   * 是顶栏那种项目级 chrome —— 顶栏经 E1 瘦身后已回归纯 chrome。
   */
  onArrange?: () => void
  /** 空画布没什么可整理的 —— 与顶栏原实现同一条禁用判据。 */
  nodeCount: number
}

/**
 * The tool pill itself — no self-positioning. S5b B0 merges this into the
 * same bottom row as the Cast dock handle ("紧贴工具条右侧同底座"), so the
 * shared `absolute bottom-*` + assistant-dock inset math now lives ONCE in
 * `StudioNodeWorkbench`'s wrapper instead of being duplicated in every dock
 * that sits on that row.
 */
export function CanvasBottomDock({
  activeMode,
  canUndo,
  canRedo,
  onModeChange,
  onUndo,
  onRedo,
  relationsCollapsed,
  onRelationsCollapsedChange,
  onArrange,
  nodeCount,
}: CanvasBottomDockProps) {
  const t = useTranslations('StudioNode')
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const { zoom } = useViewport()
  const zoomPercent = Math.round(zoom * 100)

  // 与顶栏原实现同源：onArrange 没接线时给一句「还没做」的 toast，而不是
  // 让按钮点了没反应。
  const showPlaceholderToast = () => {
    toast.info(t('toasts.notImplemented'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }

  return (
    <TooltipProvider delayDuration={250}>
      {/* S2a（2026-07-26）：视图控制收成底部中间的玻璃胶囊（规格 §8）。
          canvas-glass + canvas-toolbar-capsule 在 .domain-canvas 作用域内接管
          背景/边/投影/圆角；旧皮的 bg-node-panel + rounded-xl 只在作用域外生效。
          `md:flex` 保留——<768 不渲染完整画布是既有约定。 */}
      <div className="pointer-events-auto hidden w-fit items-center gap-1 rounded-xl border border-node-panel-inner bg-node-panel px-2 py-1.5 shadow-sm md:flex canvas-glass canvas-toolbar-capsule">
        <div className="flex items-center gap-1">
          {NODE_STUDIO_TOOL_MODES.map((mode) => {
            const Icon = TOOL_MODE_ICONS[mode]
            const selected = activeMode === mode
            return (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t(`bottomDock.${mode}`)}
                    aria-pressed={selected}
                    onClick={() => onModeChange(mode)}
                    className={cn(
                      'rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground',
                      selected &&
                        'bg-node-foreground text-node-canvas hover:bg-node-foreground hover:text-node-canvas',
                    )}
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t(`bottomDock.${mode}`)}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        <div className="h-6 w-px bg-node-panel-inner" aria-hidden />

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.zoomOut')}
                onClick={() => void zoomOut({ duration: 160 })}
                className="rounded-lg text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <ZoomOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('bottomDock.zoomOut')}
            </TooltipContent>
          </Tooltip>
          {/* G2：只读态的当前缩放展示，不再是「适应画布」的第二个触发——原来
              这颗按钮与下面的 Focus 图标共用同一个 fitView(FIT_VIEW_OPTIONS)
              调用、同一句 aria-label，两颗按钮点哪个都一样。适应画布现在唯一
              的入口是下面的 Focus 图标按钮；这里不再可点，也不需要
              aria-label/title——可见文字本身就是全部信息。 */}
          <span className="min-w-12 rounded-lg px-1.5 py-1 text-center text-xs font-semibold tabular-nums text-node-foreground">
            {t('bottomDock.zoomLevel', { percent: zoomPercent })}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.zoomIn')}
                onClick={() => void zoomIn({ duration: 160 })}
                className="rounded-lg text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <ZoomIn className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('bottomDock.zoomIn')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.fitView')}
                onClick={() => void fitView(FIT_VIEW_OPTIONS)}
                className="rounded-lg text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <Focus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('bottomDock.fitView')}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="h-6 w-px bg-node-panel-inner" aria-hidden />

        {/* R3-1「关系线」总开关（§2.5），反转 by FB-B（真机反馈）: 默认
            (aria-pressed=false) = 全显——骨干 + 成分墨线都常显，成分选中时
            仍升级石绿；按下 (aria-pressed=true) = 收起——回到骨干常显 / 成
            分仅选中或生成中显现的旧默认，给想要干净画布的时候用。 */}
        {/* 整理画布 —— 与关系线同组：两者都是「把这张画布整成看得懂的样子」 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t('topbar.arrange')}
              onClick={onArrange ?? showPlaceholderToast}
              disabled={nodeCount === 0}
              className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
            >
              <LayoutTemplate className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('topbar.arrange')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t('bottomDock.relationsCollapse')}
              aria-pressed={relationsCollapsed}
              onClick={() => onRelationsCollapsedChange(!relationsCollapsed)}
              className={cn(
                'rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground',
                relationsCollapsed &&
                  'bg-node-foreground text-node-canvas hover:bg-node-foreground hover:text-node-canvas',
              )}
            >
              <Waypoints className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {t('bottomDock.relationsCollapse')}
          </TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-node-panel-inner" aria-hidden />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.undo')}
                onClick={onUndo}
                disabled={!canUndo}
                className="rounded-xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
              >
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('bottomDock.undo')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.redo')}
                onClick={onRedo}
                disabled={!canRedo}
                className="rounded-xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
              >
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('bottomDock.redo')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
