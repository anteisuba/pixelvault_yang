'use client'

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import {
  FolderTree,
  History,
  ListTree,
  PanelLeftClose,
  Plus,
} from 'lucide-react'
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
 * ⚠ 图标轨**只放真实存在的分类**。规格里写过素材/模板/历史，但画布上真实存在
 * 的只有班底架与项目管理——画出别的图标就是伪装能力（域定义 §1.8 禁区）。
 * 其余功能片落地时再进来。
 *
 * 2026-08-02（owner 拍板）：项目管理从顶栏的下拉搬进来，成为第二个视图。理由
 * 是 owner 给的——项目列表本来就需要列表空间，塞在下拉里反而挤；而收起态这根
 * 56px 的柱子当时是空的（台账 E4「与其把空柱子缩小，不如给它内容」）。
 * 2026-08-11：助手历史从助手头部迁入这里，成为第三个视图；会话引擎仍由助手
 * 宿主持有，左栏只承担导航和列表落点。
 */

/** 展开态总宽 = 图标轨 56 + 内容区 240（规格 §8）。 */
export const CANVAS_LEFT_PANEL_WIDTH_PX = 296
export const CANVAS_LEFT_PANEL_RAIL_PX = 56

/** 内容区当前显示哪个视图。图标轨每一项对应一个。 */
export const CANVAS_LEFT_PANEL_VIEW_IDS = {
  cast: 'cast',
  projects: 'projects',
  assistantHistory: 'assistantHistory',
} as const
export type CanvasLeftPanelView =
  (typeof CANVAS_LEFT_PANEL_VIEW_IDS)[keyof typeof CANVAS_LEFT_PANEL_VIEW_IDS]

interface CanvasLeftPanelProps {
  /** 展开 = 轨 + 内容区；收起 = 只剩 56px 轨（窄屏与开助手时自动收）。 */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /** 内容区显示哪个视图；点图标轨切换（并顺带展开）。 */
  view: CanvasLeftPanelView
  onViewChange: (view: CanvasLeftPanelView) => void
  /** 画布上现有的全部节点数，渲在班底架标题右侧。 */
  nodeCount: number
  /** ＋添加：图标轨上唯一的墨色实底主按钮（规格 §0.6 —— 全画面唯一实底重色）。
   *  收事件是因为添加菜单要按按钮位置弹出。
   *  ⚠ 2026-08-02 起这是「添加节点」在画布上的**唯一常驻入口** —— 顶栏那颗
   *  同源按钮已按 owner 意见移除（两者本来共用一个 handler）。 */
  onAddClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  /** 班底架视图的内容（节点定位器）。 */
  children: ReactNode
  /** 项目管理视图的内容。 */
  projectPanel: ReactNode
  /** 助手历史视图。会话状态仍由助手宿主持有，这里只提供侧栏落点。 */
  assistantHistoryPanel: ReactNode
}

export function CanvasLeftPanel({
  expanded,
  onExpandedChange,
  view,
  onViewChange,
  nodeCount,
  onAddClick,
  children,
  projectPanel,
  assistantHistoryPanel,
}: CanvasLeftPanelProps) {
  const t = useTranslations('StudioNode.castDock')
  // 复用已有文案，不新建三语键 —— ＋添加与顶栏原来那颗是同一个动作，项目视图
  // 的标题也直接用项目菜单的。
  // ⚠ 两个命名空间：addNode 在 `StudioNode.topbar` 下，projectMenu.* 在
  // `StudioNode` 下（顶栏原实现就是用两个 t 拿的）。
  const tTopbar = useTranslations('StudioNode.topbar')
  const tNode = useTranslations('StudioNode')
  const tHistory = useTranslations('StudioNode.history')

  const viewTitle =
    view === CANVAS_LEFT_PANEL_VIEW_IDS.cast
      ? t('title')
      : view === CANVAS_LEFT_PANEL_VIEW_IDS.projects
        ? tNode('projectMenu.current')
        : tHistory('title')

  // 点图标轨：已经在这个视图就折叠/展开，否则切过去并保证展开 —— 与 VS Code
  // 的 activity bar 同一套手感。
  const handleViewClick = (next: CanvasLeftPanelView) => {
    if (expanded && view === next) {
      onExpandedChange(false)
      return
    }
    onViewChange(next)
    onExpandedChange(true)
  }

  return (
    <aside
      data-testid="canvas-left-panel"
      data-expanded={expanded ? 'true' : 'false'}
      // 展开 / 收起共用 16px 圆角：它们是同一个侧栏壳的两种宽度，不在一次
      // 展开手势前后切换成两套形状语言（见 canvas.css .canvas-left-panel）。
      className="pointer-events-auto absolute bottom-4 left-4 z-canvas-chrome hidden flex-col md:flex canvas-glass canvas-left-panel"
      // 宽度走内联值而不是 CSS 类：真机上旧的 [data-expanded='false'] 规则里
      // width 曾被别处级联压掉，与其猜不如钉死。
      // ⚠ 宽度过渡在 canvas.css 的 `.canvas-left-panel` 上（批 4 补的）。
      // 这行注释翻过两次，经过写在那边：曾经写「故意不写 transition: width，
      // 带上它过渡永远不推进」，2026-08-03 实测推翻 —— 真正的原因是那时宽度还由
      // CSS 类给、压根没生效，而不是内容区被卸载。改成内联之后两个方向都跑得动
      // （实测 56→152.75→270.73→296 / 296→233.22→91.17→56）。
      // 内容区另有一层进场（.canvas-left-panel-body），与宽度同属一个手势。
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
            aria-pressed={expanded && view === CANVAS_LEFT_PANEL_VIEW_IDS.cast}
            onClick={() => handleViewClick(CANVAS_LEFT_PANEL_VIEW_IDS.cast)}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg text-node-muted transition-colors hover:text-node-foreground',
              expanded &&
                view === CANVAS_LEFT_PANEL_VIEW_IDS.cast &&
                'bg-node-panel-inner text-node-foreground',
            )}
          >
            <ListTree className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={tNode('projectMenu.current')}
            title={tNode('projectMenu.current')}
            aria-pressed={
              expanded && view === CANVAS_LEFT_PANEL_VIEW_IDS.projects
            }
            onClick={() => handleViewClick(CANVAS_LEFT_PANEL_VIEW_IDS.projects)}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg text-node-muted transition-colors hover:text-node-foreground',
              expanded &&
                view === CANVAS_LEFT_PANEL_VIEW_IDS.projects &&
                'bg-node-panel-inner text-node-foreground',
            )}
          >
            <FolderTree className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={tHistory('title')}
            title={tHistory('title')}
            aria-pressed={
              expanded && view === CANVAS_LEFT_PANEL_VIEW_IDS.assistantHistory
            }
            onClick={() =>
              handleViewClick(CANVAS_LEFT_PANEL_VIEW_IDS.assistantHistory)
            }
            className={cn(
              'flex size-8 items-center justify-center rounded-lg text-node-muted transition-colors hover:text-node-foreground',
              expanded &&
                view === CANVAS_LEFT_PANEL_VIEW_IDS.assistantHistory &&
                'bg-node-panel-inner text-node-foreground',
            )}
          >
            <History className="size-4" aria-hidden />
          </button>
        </div>

        {/* 内容区：展开才渲染，收起时整块不占宽（不是 hidden，是不存在，
            免得内部的滚动容器还在测量一个 0 宽的盒子）。 */}
        {expanded ? (
          <div className="canvas-left-panel-body flex min-w-0 flex-1 flex-col">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-node-panel-inner px-3">
              <span className="truncate text-node-foreground canvas-panel-title">
                {viewTitle}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {/* 节点数只对班底架有意义 —— 项目视图里每个项目各有自己的计数 */}
                {view === CANVAS_LEFT_PANEL_VIEW_IDS.cast ? (
                  <span className="tabular-nums text-2xs text-node-subtle">
                    {nodeCount}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={t('collapsePanel')}
                  title={t('collapsePanel')}
                  onClick={() => onExpandedChange(false)}
                  className="flex size-6 items-center justify-center rounded-md text-node-muted transition-colors hover:text-node-foreground"
                >
                  <PanelLeftClose className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === CANVAS_LEFT_PANEL_VIEW_IDS.cast
                ? children
                : view === CANVAS_LEFT_PANEL_VIEW_IDS.projects
                  ? projectPanel
                  : assistantHistoryPanel}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
