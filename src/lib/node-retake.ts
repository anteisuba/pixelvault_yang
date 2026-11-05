/**
 * 重生成 = 新卡（node-canvas-v2 §1 第 18 条，owner 2026-11-03 定；连法 owner
 * 2026-11-05 定）。
 *
 * 一张已经有产物的图 / 视频卡再按一次生成：⛔ 不在原卡上叠版本，而是在它右边长一张
 * **同条件**的新卡 —— 同子型、同镜号、同正文、同档位、同景别运镜、同一批输入线 ——
 * 再由新卡自己发这一枪（`retake-autostart`）。旧卡原地不动。
 *
 * ⚠ 旧卡 → 新卡**不连线**（owner 11-05）：图片卡没有「来源」入口，唯一接得上的是
 * `reference`，那会把旧图当参考喂进新请求，出来的就不是「再抽一次」而是「照着它改」。
 * 视频同理（`reference` 槽会进 `videoUrls`）。新旧两张卡因此是并排的兄弟：上游同一组。
 *
 * ⚠ 正文里 `@` 落的边（`data.via === 'mention'`）**不抄**：批里最后那条 `set_prompt`
 * 会按正文重新落一遍；先抄再落会在同一个槽里出现两条一模一样的边。
 *
 * ⛔ 模型不在这一批里：`set_model` 只收 modelId、由画布按目录展开成默认渠道，会把用户
 * 选的那条线路（自己的 key / 中转）换掉。完整的模型选择由新卡起跑时自己写
 * （`retake-autostart` 的载荷），那一刻用的是新卡渲染时的最新图。
 */

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_EDGE_VIA_IDS,
  NODE_SLOT_IDS,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4,
  NodeV4SlotBinding,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

/** 新卡在批内的别名（只在这一批之内有效）。 */
export const NODE_RETAKE_REF = 'retake'

export interface NodeRetakeInput {
  readonly node: NodeV4
  readonly edges: readonly NodeWorkflowEdgeV4[]
  /** 这一枪用的正文（输入框里的草稿，可能还没落库）。 */
  readonly prompt: string
  /** `onPlaceBeside` 给的落点；缺席 = 交给 `add_node` 的默认摆放。 */
  readonly position?: { readonly x: number; readonly y: number }
}

/** 只有图片 / 视频卡有「重生成」；有产物才长新卡，没产物就在原卡上生成。 */
export function shouldRetakeAsNewCard(node: NodeV4 | undefined): boolean {
  if (!node) return false
  const { data } = node
  if (
    data.kind !== NODE_MEDIA_KIND_IDS.image &&
    data.kind !== NODE_MEDIA_KIND_IDS.video
  )
    return false
  return typeof data.url === 'string' && data.url.length > 0
}

/**
 * 旧卡的输入线按槽抄一份：每个槽里的版本照原顺序，但**当前版排最后**——`connect`
 * 把新落的那条设为当前，排最后它就仍是当前。停用（`blocked`）的版本不抄。
 */
function copyInputOps(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
): NodeAssistantOpV4[] {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const slots = (node.data.slots ?? {}) as Partial<
    Record<string, NodeV4SlotBinding>
  >
  const ops: NodeAssistantOpV4[] = []
  for (const binding of Object.values(slots)) {
    if (!binding) continue
    const live = binding.versions.filter((version) => !version.blocked)
    const ordered = [
      ...live.filter((version) => version.id !== binding.cur),
      ...live.filter((version) => version.id === binding.cur),
    ]
    for (const version of ordered) {
      const edge = edgeById.get(version.edgeId)
      if (!edge || edge.target !== node.id) continue
      if (edge.data?.via === NODE_EDGE_VIA_IDS.mention) continue
      const role: NodeSlotTextRole | undefined =
        binding.slot === NODE_SLOT_IDS.text ? version.role : undefined
      ops.push({
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: NODE_RETAKE_REF,
        slot: binding.slot,
        ...(role ? { role } : {}),
      })
    }
  }
  return ops
}

/** 长新卡的那一批 op（一批 = 一个撤销）。不是图 / 视频卡时返回空。 */
export function buildRetakeOps({
  node,
  edges,
  prompt,
  position,
}: NodeRetakeInput): readonly NodeAssistantOpV4[] {
  const { data } = node
  if (
    data.kind !== NODE_MEDIA_KIND_IDS.image &&
    data.kind !== NODE_MEDIA_KIND_IDS.video
  )
    return []
  const isShot =
    data.kind === NODE_MEDIA_KIND_IDS.video &&
    data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
  const ops: NodeAssistantOpV4[] = [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: data.kind,
      subtype: data.subtype,
      ref: NODE_RETAKE_REF,
      ...(data.shotNo === undefined ? {} : { shotNo: data.shotNo }),
      // 镜头卡的稳定名是 label：给原名，`buildShotLabel` 自己避开重名。其余子型
      // 不给名，由 `buildStableNodeName` 按子型 + 镜号另起一个不重的。
      ...(isShot && data.kind === NODE_MEDIA_KIND_IDS.video && data.label
        ? { name: data.label }
        : {}),
      ...(position ? { position: { x: position.x, y: position.y } } : {}),
    },
    ...copyInputOps(node, edges),
  ]
  if (data.params) {
    ops.push({
      op: NODE_ASSISTANT_OP_V4_IDS.setParams,
      target: NODE_RETAKE_REF,
      params: data.params,
    } as NodeAssistantOpV4)
  }
  if (
    data.kind === NODE_MEDIA_KIND_IDS.video &&
    data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot &&
    data.shot
  ) {
    const { size, move, look } = data.shot
    ops.push({
      op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
      target: NODE_RETAKE_REF,
      spec: {
        ...(size ? { size } : {}),
        ...(move ? { move } : {}),
        ...(look ? { look } : {}),
      },
    } as NodeAssistantOpV4)
  }
  const text = prompt.trim()
  if (text) {
    ops.push({
      op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
      target: NODE_RETAKE_REF,
      prompt: text,
      mode: 'replace',
    })
  }
  return ops
}
