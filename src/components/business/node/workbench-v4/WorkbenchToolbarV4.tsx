'use client'

/**
 * v4 workbench 的 chrome：顶栏 / 添加菜单 / 底部视图条 / 左侧面板
 * （第三期 · 画布）。
 *
 * ── 为什么是**复用**这几个既有组件而不是重画 ────────────────────────────
 * `CanvasTopBar` / `CanvasBottomDock` / `CanvasAddMenu` / `CanvasLeftPanel` 的
 * props 全是基本类型（计数、名字、回调），一个 v3 形状都没有 —— 它们从来就与图的
 * 版本无关。重画一遍等于把已经过了设计门的 chrome 复制一份，而 ③d-4 之后要维护
 * 两份。⛔ 只有真的读 v3 形状的组件才需要 v4 版。
 *
 * ── 添加菜单的词表 ──────────────────────────────────────────────────────
 * 走 `CANVAS_ADD_CATALOG` 的 `intent.v4`（`{kind, subtype}`），⚠ **文案仍是现有的
 * i18n 键**（`StudioNode.addCatalog.*`）。⛔ 不拿 `NODE_V4_SUBTYPE_LABELS` 当文案：
 * 那张表是**稳定名**的构件（`buildStableNodeName` 用它拼「镜头图 3」这类 id 化的
 * 名字），它一改，存量节点的名字就跟着漂。
 */

import { useCallback } from 'react'
import type { XYPosition } from '@xyflow/react'

import {
  CANVAS_ADD_CATALOG,
  getCanvasAddCatalogItem,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import type { NodeStudioToolMode } from '@/constants/node-studio'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { CanvasAppearance } from '@/types/node-workflow'

import { CanvasAddMenu } from '../CanvasAddMenu'
import { CanvasBottomDock } from '../CanvasBottomDock'
import { CanvasTopBar } from '../CanvasTopBar'

/** 添加菜单里一共有几项 —— 渲染快照用它断言「菜单没有静默掉项」。 */
export const WORKBENCH_V4_ADD_ITEM_COUNT = CANVAS_ADD_CATALOG.reduce(
  (total, group) => total + group.items.length,
  0,
)

export interface WorkbenchToolbarV4Props {
  readonly graph: NodeGraphV4
  readonly projectName: string
  readonly nodeCount: number
  readonly isSaving: boolean
  readonly canvasAppearance: CanvasAppearance | undefined
  onCanvasAppearanceChange(value: CanvasAppearance | undefined): void
  readonly reviewPendingCount: number
  onStartReview(): void
  readonly assistantOpen: boolean
  onOpenAssistant(): void
  onOpenProjects(): void

  readonly toolMode: NodeStudioToolMode
  onToolModeChange(mode: NodeStudioToolMode): void
  readonly relationsCollapsed: boolean
  onRelationsCollapsedChange(next: boolean): void

  /** 添加菜单的屏幕锚点；`null` = 菜单关着。 */
  readonly addMenuPosition: XYPosition | null
  /** 菜单里的落点（画布坐标）。 */
  readonly addNodePosition: XYPosition | null
  onCloseAddMenu(): void
  onUpload(): void
  onPickFromLibrary(): void
}

export function WorkbenchToolbarV4({
  graph,
  projectName,
  nodeCount,
  isSaving,
  canvasAppearance,
  onCanvasAppearanceChange,
  reviewPendingCount,
  onStartReview,
  assistantOpen,
  onOpenAssistant,
  onOpenProjects,
  toolMode,
  onToolModeChange,
  relationsCollapsed,
  onRelationsCollapsedChange,
  addMenuPosition,
  addNodePosition,
  onCloseAddMenu,
  onUpload,
  onPickFromLibrary,
}: WorkbenchToolbarV4Props) {
  /**
   * 菜单选项 → 一条 `add_node`。
   *
   * ⚠ 身份取 `item.v4` 那一栏 —— 真机 ② 的教训：菜单说 legacy 词表、v4 身份在
   * 另一头按 role 推，推错了也没人喊。这里直接读那颗钉子，⛔ 不再推一遍。
   */
  const handleSelect = useCallback(
    (intentId: CanvasAddIntentId) => {
      const item = getCanvasAddCatalogItem(intentId)
      graph.addNode(item.v4.kind, item.v4.subtype, {
        ...(addNodePosition ? { position: addNodePosition } : {}),
      })
      onCloseAddMenu()
    },
    [graph, addNodePosition, onCloseAddMenu],
  )

  return (
    <>
      <CanvasTopBar
        assistantOpen={assistantOpen}
        onOpenAssistant={onOpenAssistant}
        onOpenProjects={onOpenProjects}
        nodeCount={nodeCount}
        projectName={projectName}
        canvasAppearance={canvasAppearance}
        onCanvasAppearanceChange={onCanvasAppearanceChange}
        isSaving={isSaving}
        reviewPendingCount={reviewPendingCount}
        onStartReview={onStartReview}
      />
      <div className="canvas-bottom-row pointer-events-none absolute inset-x-0 bottom-3 z-canvas-chrome flex items-end justify-center gap-2">
        <CanvasBottomDock
          activeMode={toolMode}
          canUndo={graph.canUndo}
          canRedo={graph.canRedo}
          onModeChange={onToolModeChange}
          onUndo={graph.undo}
          onRedo={graph.redo}
          relationsCollapsed={relationsCollapsed}
          onRelationsCollapsedChange={onRelationsCollapsedChange}
          onArrange={graph.tidyLayout}
          nodeCount={nodeCount}
        />
      </div>
      <CanvasAddMenu
        open={addMenuPosition !== null}
        screenPosition={addMenuPosition}
        onSelect={handleSelect}
        onUpload={onUpload}
        onPickFromLibrary={onPickFromLibrary}
        onClose={onCloseAddMenu}
      />
    </>
  )
}
