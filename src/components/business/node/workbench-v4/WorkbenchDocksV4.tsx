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
 * `edges` props 与 `CastDock` 的 `useNodes<NodeWorkflowNode>()`
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

  readonly assistantOpen: boolean
  readonly assistantExpanded: boolean
  onAssistantOpenChange(open: boolean): void
  onAssistantExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
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
    />
  )
}

/**
 * ⚠ S7 起桌面档的左栏不在这里 —— 44px 图标栏 + 264 浮起面板由
 * `shell/ShellSidePanels` 直接挂在 workbench 上（画板 `ChromePanels.dc.html`）。
 * ⚠ S12 起手机形态也不在这里 —— < 768 由 `NodeWorkbenchV4` 整棵换成
 * `mobile/CanvasMobileRail`（node-canvas-v2 §7.x），2026-08-26 的只读覆盖层
 * `CanvasMobileView` 随之删除，⛔ 不留兼容层。本文件只剩审阅条这一件摆放。
 */
export function WorkbenchDocksV4() {
  // 审阅模式条：组件自己判「在不在模式里」，不在就整个不渲染。
  return <ReviewModeBar />
}
