/**
 * 保存前在客户端用**服务端同一份** Zod schema 先过一遍（`NodeWorkflowPersistedStateSchema`
 * = `UpdateNodeWorkflowProjectRequestSchema.state`）。
 *
 * ── 为什么 ────────────────────────────────────────────────────────────
 * 台账 V（2026-08-29 真机）：一张卡的某个字段超了 160 字上限，服务端 400 拒收整份
 * state，用户看到的只有「云端拒绝了这次保存」+ 一行 Zod 原文 —— 不知道是哪张卡、
 * 哪个字段。这里在发出去之前就定位到「第几张卡的哪个字段、上限多少」。
 *
 * ⚠ 只读第一条问题：一次说清一处，改完下一次自动保存会把下一处报出来。
 */

import {
  NodeWorkflowPersistedStateSchema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

export interface NodeWorkflowSaveIssue {
  /** 出问题的卡（不在某张卡上 = 项目级字段，如边表 / 镜头表）。 */
  readonly nodeId?: string
  readonly nodeName?: string
  /** 卡内字段路径（`prompt` / `params.advanced.negativePrompt`），或项目级路径。 */
  readonly field: string
  /** 超长时的上限（字数）；其他类问题不给。 */
  readonly maximum?: number
}

export function findNodeWorkflowSaveIssue(
  state: NodeWorkflowStateV4,
): NodeWorkflowSaveIssue | null {
  const parsed = NodeWorkflowPersistedStateSchema.safeParse(state)
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  if (!issue) return null
  const maximum = issue.code === 'too_big' ? Number(issue.maximum) : undefined
  const path = issue.path.map(String)
  const limit = maximum === undefined ? {} : { maximum }
  if (path[0] === 'nodes' && path[1] !== undefined) {
    const node = state.nodes[Number(path[1])]
    // nodes.<i>.data.<field…>：卡上的字段只报 data 之后那一截。
    const fieldPath = path[2] === 'data' ? path.slice(3) : path.slice(2)
    return {
      ...(node ? { nodeId: node.id, nodeName: node.data.name } : {}),
      field: fieldPath.join('.') || 'data',
      ...limit,
    }
  }
  return { field: path.join('.'), ...limit }
}
