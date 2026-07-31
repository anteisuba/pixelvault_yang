import { z } from 'zod'

import {
  NODE_ASSISTANT_ADD_INTENTS,
  NODE_ASSISTANT_OP_IDS,
  NODE_ASSISTANT_OP_LIMITS,
} from '@/constants/node-assistant-ops'
import { NODE_REVIEW_STATES } from '@/constants/node-types'

/**
 * 一个节点引用：要么是画布上已有节点的 id（助手在 `[[node:id]]` 里读到的那个），
 * 要么是**本批** `add_node` 声明的别名 `ref`。解析顺序在规划器里（别名优先），
 * 这里只管形状。
 *
 * ⚠ 有意**不**做成 `{ nodeId } | { ref }` 的联合：模型每多一层嵌套就多一分写错
 * 的概率，而这里的歧义成本很低 —— 别名由本批自己声明，冲突可以在规划期查出来。
 */
const NodeAssistantOpTargetSchema = z
  .string()
  .trim()
  .min(1)
  .max(NODE_ASSISTANT_OP_LIMITS.maxTargetLength)

const NodeAssistantOpNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NODE_ASSISTANT_OP_LIMITS.maxNameLength)

export const NodeAssistantAddNodeOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.addNode),
  /** ＋添加 菜单的意图 id —— 族与 role 的唯一定义处，见 canvas-add-catalog。 */
  intent: z.enum(NODE_ASSISTANT_ADD_INTENTS),
  /** 批内别名，供同一批的 connect / rename 引用这个还没有 id 的新节点。 */
  ref: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxRefLength)
    .optional(),
  /** 建好就起名。省略则是未命名节点，和人手从菜单建出来的一样。 */
  name: NodeAssistantOpNameSchema.optional(),
})

export const NodeAssistantConnectOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.connect),
  source: NodeAssistantOpTargetSchema,
  target: NodeAssistantOpTargetSchema,
})

export const NodeAssistantRenameOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.rename),
  target: NodeAssistantOpTargetSchema,
  name: NodeAssistantOpNameSchema,
})

/**
 * ⚠ `state` 这里收**全部三态**，包括 `approved` —— 然后由规划器按
 * `canAssistantSetReviewState` 拒掉它。
 *
 * 看起来绕，但这是有意的：schema 层直接把 `approved` 从枚举里删掉，模型写了就
 * 变成「整条 op 形状不对」，用户看到的是一句笼统的解析失败；留到规划层拒，用户
 * 看到的是「助手不能替你放行」。**同一个禁令，后者可教。**
 */
export const NodeAssistantSetReviewStateOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.setReviewState),
  target: NodeAssistantOpTargetSchema,
  state: z.enum(NODE_REVIEW_STATES),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxReasonLength)
    .optional(),
})

export const NodeAssistantGenerateOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.generate),
  target: NodeAssistantOpTargetSchema,
})

export const NodeAssistantOpSchema = z.discriminatedUnion('op', [
  NodeAssistantAddNodeOpSchema,
  NodeAssistantConnectOpSchema,
  NodeAssistantRenameOpSchema,
  NodeAssistantSetReviewStateOpSchema,
  NodeAssistantGenerateOpSchema,
])

export const NodeAssistantOpBatchSchema = z.object({
  ops: z
    .array(NodeAssistantOpSchema)
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxOps),
})

export type NodeAssistantAddNodeOp = z.infer<
  typeof NodeAssistantAddNodeOpSchema
>
export type NodeAssistantConnectOp = z.infer<
  typeof NodeAssistantConnectOpSchema
>
export type NodeAssistantRenameOp = z.infer<typeof NodeAssistantRenameOpSchema>
export type NodeAssistantSetReviewStateOp = z.infer<
  typeof NodeAssistantSetReviewStateOpSchema
>
export type NodeAssistantGenerateOp = z.infer<
  typeof NodeAssistantGenerateOpSchema
>
export type NodeAssistantOp = z.infer<typeof NodeAssistantOpSchema>
export type NodeAssistantOpBatch = z.infer<typeof NodeAssistantOpBatchSchema>
