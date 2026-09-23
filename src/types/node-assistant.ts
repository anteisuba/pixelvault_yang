import { z } from 'zod'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_MESSAGE_ROLES,
} from '@/constants/node-studio'
import {
  EditProjectSchema,
  NodeV4Schema,
  NodeWorkflowEdgeV4Schema,
} from '@/types/node-workflow'
import { AssistantMediaReferenceSchema } from '@/types/assistant-media'
import { LOCALES } from '@/i18n/routing'

export const NodeAssistantMessageRoleSchema = z.enum(
  NODE_STUDIO_ASSISTANT_MESSAGE_ROLES,
)

export const NodeAssistantMessageSchema = z.object({
  role: NodeAssistantMessageRoleSchema,
  content: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxMessageLength),
})

/**
 * Media that is already present on the canvas and can be attached to an
 * assistant turn. URLs are deliberately persisted as references, never as
 * data URLs, so the assistant request stays bounded and share/history rows do
 * not accidentally contain binary payloads.
 */
export const NodeAssistantMediaReferenceSchema = AssistantMediaReferenceSchema

export const NodeAssistantRequestSchema = z.object({
  messages: z
    .array(NodeAssistantMessageSchema)
    .min(1)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxMessages),
  /**
   * v4 整图（③e）。**助手只认 v4** —— legacy 快照与 `canvasV4` 可选格一并删了：
   * 画布已在 ③d 原子翻转，客户端再没有第二种图可发，留一格可选就等于留一条永远
   * 走不到、却要在服务端分叉一次的路径。
   */
  nodes: z.array(NodeV4Schema).max(NODE_STUDIO_ASSISTANT_LIMITS.maxV4Nodes),
  edges: z
    .array(NodeWorkflowEdgeV4Schema)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxV4Edges)
    .default([]),
  /** 用户当前所在的镜号 —— 它与相邻两镜进完整档。 */
  currentShotNo: z.number().int().min(1).max(999).optional(),
  selectedNodeIds: z
    .array(z.string().trim().min(1).max(160))
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes)
    .default([]),
  references: z
    .array(NodeAssistantMediaReferenceSchema)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxReferences)
    .optional(),
  locale: z.enum(LOCALES),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
  /**
   * LLM tier the user picked in the route selector (e.g. gpt-6-sol).
   * Distinct from any node's generation modelId. Validated server-side
   * against NODE_STUDIO_ASSISTANT_ROUTE_MODELS; unknown values fall back to
   * the adapter's default tier.
   */
  llmModelId: z.string().trim().min(1).max(160).optional(),
  /**
   * Reference-research turn: study an existing film/anime/short and return
   * structural analysis + original script suggestions + prompt seeds. Routed
   * through a grounding-capable provider (Gemini/OpenAI) when one is available,
   * otherwise degrades to the model's own knowledge.
   */
  research: z.boolean().optional(),
  /**
   * 一句话排片（S10）：这一轮走 `plan_timeline` 而不是聊天。
   *
   * ⚠ 只读、免费 —— 它一个生成都不发。⛔ 服务端不因为这一格跳过任何校验，它只是
   * 换一条产出（结构化提案）而不是换一套权限。
   */
  deskPlan: z.boolean().optional(),
  /** 当前时间线。排片是在它的基础上改，缺席 = 这个项目还没进过剪辑台。 */
  edit: EditProjectSchema.optional(),
})

export type NodeAssistantMessageRole = z.infer<
  typeof NodeAssistantMessageRoleSchema
>
export type NodeAssistantMessage = z.infer<typeof NodeAssistantMessageSchema>
export type NodeAssistantMediaReference = z.infer<
  typeof AssistantMediaReferenceSchema
>
export type NodeAssistantRequest = z.infer<typeof NodeAssistantRequestSchema>
