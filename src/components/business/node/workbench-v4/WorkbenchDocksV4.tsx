'use client'

/**
 * v4 workbench 的**外壳组件挂载点**（第三期 · 画布）。
 *
 * ── 这些组件为什么一行都不用改 ──────────────────────────────────────────
 * ③b 已经把它们全部换到 `useNodeCanvasActions()`（薄动作出口）与 ReactFlow 的
 * store（`useNodes()`）上，两者都与图的版本无关。所以本文件只负责**摆放**：
 * 动作出口由外层的 `NodeCanvasActionsProvider` 给（v4 实现，⛔ 不再走
 * ③d-4 之前那个 v3 适配器），节点由外层的 `<ReactFlow>` 给。
 *
 * ⚠ 已知缺口（③d-4 的接线清单里点名）：`StudioNodeAssistantDock` 的 `nodes` /
 * `edges` props 与 `CanvasMobileView` / `CastDock` 的 `useNodes<NodeWorkflowNode>()`
 * 仍是 **v3 形状的类型**。运行时它们拿到的是 v4 节点（RF store 里就是这一份），
 * 读 `data.type` / `data.role` 这类 v3 字段会读到 `undefined` —— 不是崩，是**降级**。
 * 本片不给它们套形状转换层：那正是「给旧签名留垫片」。它们各自的 v4 props 改造
 * 是 ③d-4 / ③e 的独立条目。
 */

import type { ReactNode } from 'react'
import type { AppLocale } from '@/i18n/routing'
import type {
  NodeV4,
  NodeWorkflowEdgeV4,
  NodeWorkflowModelOptionsByType,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import { CanvasLeftPanel, type CanvasLeftPanelView } from '../CanvasLeftPanel'
import { CanvasMobileView } from '../CanvasMobileView'
import { CanvasRosterRail } from '../CanvasRosterRail'
import { ReviewModeBar } from '../ReviewModeBar'
import { StudioNodeAssistantDock } from '../StudioNodeAssistantDock'

export interface WorkbenchDocksV4Props {
  readonly projectId: string
  readonly projectName: string
  readonly projectPanel: ReactNode
  readonly modelOptionsByType: NodeWorkflowModelOptionsByType
  readonly scriptDoc: ScriptDoc | undefined
  readonly locale: AppLocale
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]

  readonly leftPanelExpanded: boolean
  onLeftPanelExpandedChange(expanded: boolean): void
  readonly leftPanelView: CanvasLeftPanelView
  onLeftPanelViewChange(view: CanvasLeftPanelView): void
  readonly nodeCount: number
  onAddClick(event: React.MouseEvent<HTMLButtonElement>): void

  readonly assistantOpen: boolean
  readonly assistantExpanded: boolean
  onAssistantOpenChange(open: boolean): void
  onAssistantExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
  readonly assistantHistoryHost: HTMLDivElement | null
  setAssistantHistoryHost(el: HTMLDivElement | null): void

  readonly isMobile: boolean
  readonly canvasPeek: boolean
  onEnterPeek(): void
  onExitPeek(): void
}

/** 助手 dock 单独摘出来：它是 `CanvasWorkspaceLayout` 的 `assistant` 插槽内容。 */
export function WorkbenchAssistantDockV4({
  projectId,
  projectName,
  scriptDoc,
  locale,
  nodes,
  edges,
  assistantOpen,
  assistantExpanded,
  onAssistantOpenChange,
  onAssistantExpandedChange,
  onFocusNode,
  assistantHistoryHost,
}: Pick<
  WorkbenchDocksV4Props,
  | 'projectId'
  | 'projectName'
  | 'scriptDoc'
  | 'locale'
  | 'nodes'
  | 'edges'
  | 'assistantOpen'
  | 'assistantExpanded'
  | 'onAssistantOpenChange'
  | 'onAssistantExpandedChange'
  | 'onFocusNode'
  | 'assistantHistoryHost'
>) {
  return (
    <StudioNodeAssistantDock
      open={assistantOpen}
      expanded={assistantExpanded}
      projectId={projectId}
      projectName={projectName}
      nodes={nodes}
      edges={edges}
      scriptDoc={scriptDoc}
      locale={locale}
      onOpenChange={onAssistantOpenChange}
      onExpandedChange={onAssistantExpandedChange}
      onFocusNode={onFocusNode}
      historyPortalTarget={assistantHistoryHost}
    />
  )
}

export function WorkbenchDocksV4({
  projectPanel,
  leftPanelExpanded,
  onLeftPanelExpandedChange,
  leftPanelView,
  onLeftPanelViewChange,
  nodeCount,
  onAddClick,
  setAssistantHistoryHost,
  isMobile,
  canvasPeek,
  onEnterPeek,
  onExitPeek,
  projectId,
}: WorkbenchDocksV4Props) {
  return (
    <>
      {/* 审阅模式条：组件自己判「在不在模式里」，不在就整个不渲染。 */}
      <ReviewModeBar />
      <CanvasLeftPanel
        expanded={leftPanelExpanded}
        onExpandedChange={onLeftPanelExpandedChange}
        view={leftPanelView}
        onViewChange={onLeftPanelViewChange}
        nodeCount={nodeCount}
        onAddClick={onAddClick}
        projectPanel={projectPanel}
        assistantHistoryPanel={
          <div
            ref={isMobile ? undefined : setAssistantHistoryHost}
            className="h-full"
          />
        }
      >
        <CanvasRosterRail />
      </CanvasLeftPanel>
      {isMobile ? (
        <CanvasMobileView
          // 切项目要整块重挂：手机形态里它是**唯一**的内容视图，留着旧项目的
          // 局部状态会让用户以为项目没切过去。
          key={projectId}
          peeking={canvasPeek}
          onEnterPeek={onEnterPeek}
          onExitPeek={onExitPeek}
          projectPanel={projectPanel}
          assistantHistoryPanel={
            <div ref={setAssistantHistoryHost} className="h-full" />
          }
        />
      ) : null}
    </>
  )
}
