'use client'

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { ListTree, PanelLeftClose, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

/**
 * S2b（2026-07-26）左侧合体面板 —— 规格 §8 / 分段计划 §1 S2。
 *
 * 56px 图标轨 + 240px 内容区共用**一个**浮起玻璃容器、一条投影。两者功能上
 * 本是一体（图标轨的每一项就是内容区要显示的分类），拆成两个并排浮起物会显得
 * 零碎、也讲不清从属关系。结构等价于 VS Code 的 activity bar + side bar，
 * 用户认知成本为零。
 *
 * ⚠ 图标轨**只放真实存在的分类**。规格里写过素材/模板/历史，但画布上目前只有
 * 班底架是真的——画出另外三个图标就是伪装能力（域定义 §1.8 禁区）。它们各自
 * 的功能片落地时再进来。
 */

/** 展开态总宽 = 图标轨 56 + 内容区 240（规格 §8）。 */
export const CANVAS_LEFT_PANEL_WIDTH_PX = 296
export const CANVAS_LEFT_PANEL_RAIL_PX = 56

interface CanvasLeftPanelProps {
  /** 展开 = 轨 + 内容区；收起 = 只剩 56px 轨（窄屏与开助手时自动收）。 */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /** 画布上现有的全部节点数，渲在标题右侧。 */
  nodeCount: number
  /** ＋添加：图标轨上唯一的墨色实底主按钮（规格 §0.6 —— 全画面唯一实底重色）。
   *  收事件是因为添加菜单要按按钮位置弹出（复用顶栏那个 handler）。 */
  onAddClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  /** 内容区当前托管的全部节点定位器。 */
  children: ReactNode
}

export function CanvasLeftPanel({
  expanded,
  onExpandedChange,
  nodeCount,
  onAddClick,
  children,
}: CanvasLeftPanelProps) {
  const t = useTranslations('StudioNode.castDock')
  // 复用顶栏那条已有的「添加节点」文案，不新建三语键——这个按钮和顶栏的
  // ＋添加是同一个动作，只是换了位置。
  const tTopbar = useTranslations('StudioNode.topbar')

  return (
    <aside
      data-testid="canvas-left-panel"
      data-expanded={expanded ? 'true' : 'false'}
      // 展开态用 16px 圆角而不是全胶囊：一块高而宽的面板做成胶囊会把顶底内容
      // 啃掉；只有收起成窄轨时才回到全圆角（见 canvas.css .canvas-left-panel）。
      className="pointer-events-auto absolute bottom-4 left-4 z-canvas-chrome hidden flex-col md:flex canvas-glass canvas-left-panel"
      // 宽度走内联值而不是 CSS 类：真机上同一条 [data-expanded='false'] 规则里
      // border-radius 生效了、width 没生效（级联被别处压掉），与其猜不如钉死。
      // 过渡仍由 .canvas-left-panel 的 transition: width 负责。
      style={{
        top: 'calc(var(--canvas-topbar-h) + 16px)',
        width: expanded
          ? CANVAS_LEFT_PANEL_WIDTH_PX
          : CANVAS_LEFT_PANEL_RAIL_PX,
      }}
    >
      <div className="flex min-h-0 flex-1">
        {/* 图标轨 */}
        <div
          className="flex shrink-0 flex-col items-center gap-2 border-r border-node-panel-inner py-2"
          style={{ width: CANVAS_LEFT_PANEL_RAIL_PX }}
        >
          <button
            type="button"
            aria-label={tTopbar('addNode')}
            title={tTopbar('addNode')}
            onClick={onAddClick}
            className="canvas-rail-action flex size-8 items-center justify-center rounded-lg"
          >
            <Plus className="size-4" aria-hidden />
          </button>
          <div className="h-px w-7 shrink-0 bg-node-panel-inner" aria-hidden />
          <button
            type="button"
            aria-label={t('title')}
            title={t('title')}
            aria-pressed={expanded}
            onClick={() => onExpandedChange(!expanded)}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg text-node-muted transition-colors hover:text-node-foreground',
              expanded && 'bg-node-panel-inner text-node-foreground',
            )}
          >
            <ListTree className="size-4" aria-hidden />
          </button>
        </div>

        {/* 内容区：展开才渲染，收起时整块不占宽（不是 hidden，是不存在，
            免得内部的滚动容器还在测量一个 0 宽的盒子）。 */}
        {expanded ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-node-panel-inner px-3">
              <span className="truncate text-node-foreground canvas-panel-title">
                {t('title')}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <span className="tabular-nums text-2xs text-node-subtle">
                  {nodeCount}
                </span>
                <button
                  type="button"
                  aria-label={t('collapse')}
                  title={t('collapse')}
                  onClick={() => onExpandedChange(false)}
                  className="flex size-6 items-center justify-center rounded-md text-node-muted transition-colors hover:text-node-foreground"
                >
                  <PanelLeftClose className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
