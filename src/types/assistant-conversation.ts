import { z } from 'zod'

import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import {
  ASSISTANT_PROTOCOL_DOMAIN_IDS,
  type AssistantProtocolDomain,
} from '@/constants/assistant-protocol'
import { AssistantMediaReferenceSchema } from '@/types/assistant-media'
import {
  AssistantPromptBlockSchema,
  AssistantSetupBlockSchema,
} from '@/types/assistant-protocol'

/**
 * 一段对话归谁 —— **每个域一个槽**（A1，owner 2026-08-08 拍板「四档」）。
 *
 * ⚠ 改之前只有 `STUDIO` / `NODE_CANVAS` 两档：画布确实是隔离的（还额外按
 * `projectId` 分槽），但**图片 Studio / 视频 Studio / LoRA 三处全挤在 `STUDIO`
 * 这一个值里**——历史列表混着，而且 `use-prompt-assistant` 的模块级单例让切页面
 * 连内存里的对话都是同一份。两层都要分，只改一层等于没改。
 */
export const ASSISTANT_SURFACE_IDS = {
  imageStudio: 'IMAGE_STUDIO',
  videoStudio: 'VIDEO_STUDIO',
  lora: 'LORA',
  nodeCanvas: 'NODE_CANVAS',
} as const

export const ASSISTANT_SURFACES = [
  ASSISTANT_SURFACE_IDS.imageStudio,
  ASSISTANT_SURFACE_IDS.videoStudio,
  ASSISTANT_SURFACE_IDS.lora,
  ASSISTANT_SURFACE_IDS.nodeCanvas,
] as const
export type AssistantSurfaceId = (typeof ASSISTANT_SURFACES)[number]

export const AssistantSurfaceSchema = z.enum(ASSISTANT_SURFACES)

/**
 * 对话域 → 存储槽。写成 `Record<AssistantProtocolDomain, …>`：协议那边加一个域而
 * 这里没跟上，编译期就红，不会安静地把新域的对话倒进旧槽。
 */
export const ASSISTANT_SURFACE_BY_DOMAIN: Record<
  AssistantProtocolDomain,
  AssistantSurfaceId
> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: ASSISTANT_SURFACE_IDS.imageStudio,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: ASSISTANT_SURFACE_IDS.videoStudio,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: ASSISTANT_SURFACE_IDS.lora,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: ASSISTANT_SURFACE_IDS.nodeCanvas,
}

/**
 * Canvas / studio assistant persistence. Conversation is not product-capped —
 * values below are hard DoS guards only (must stay ≥ node-assistant request
 * limits so a successful turn never fails on the next upsert).
 */
export const ASSISTANT_CONVERSATION_LIMITS = {
  maxMessages: 500,
  maxContentLength: 100_000,
  titleMaxLength: 80,
  /** Soft window for non-canvas surfaces that still replay a short history. */
  replayWindow: 12,
} as const

export const AssistantConversationMessageSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  role: z.enum(['user', 'assistant']),
  content: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_CONVERSATION_LIMITS.maxContentLength),
  createdAt: z.string().datetime().optional(),
  mediaReferences: z
    .array(AssistantMediaReferenceSchema)
    .max(ASSISTANT_MEDIA_LIMITS.maxReferences)
    .optional(),
  /**
   * 档 3 交付的提示词载荷（`[[prompt]]` 块）。
   *
   * ⚠ **它持久化，而 `ask` / `next` 故意不持久化** —— 这两类东西不同性质：
   * 反问选项和收敛按钮是**那一轮的交互态**，恢复历史时重新点亮它们，点下去只会
   * 把一句过期的答复发出去；而提示词是**交付物**，三轮前写的那版今天填进提示词框
   * 依然完全正确。判据和「复制」按钮一样——复制从来就是常驻的。
   *
   * 不存的代价 2026-08-20 真机见过：刷新一次，整段对话的「填入提示词 / 填入负面 /
   * 设为 16:9」三个按钮全消失，只剩复制。用户得自己从正文里手抄。
   */
  promptDraft: AssistantPromptBlockSchema.optional(),
  /** 工作台配置提案（`[[setup]]` 块）。持久化理由同 `promptDraft`：也是交付物。 */
  setup: AssistantSetupBlockSchema.optional(),
  /**
   * 这条回答背后那次检索的 `ResearchRun.id`。
   *
   * ⚠ **只存 id，不存证据本体**（§3.6 验收明写）。证据包动辄几十 KB，塞进
   * messages 会让每次会话读写都拖着它走，而且同一份证据会在历史里复制 N 份。
   * 加载会话时按需从 `ResearchRun` 水合，分享快照静态渲染（分享页不查库）。
   *
   * 持久化的判据和 `promptDraft` 一样是**交付物 vs 交互态**：三轮前那次检索的
   * 来源清单今天点开依然是那些来源，和「复制」按钮一个道理。
   */
  researchRunId: z.string().trim().min(1).max(120).optional(),
})

export type AssistantConversationMessageStored = z.infer<
  typeof AssistantConversationMessageSchema
>

export const UpsertAssistantConversationRequestSchema = z.object({
  id: z.string().uuid().optional(),
  surface: AssistantSurfaceSchema,
  projectId: z.string().trim().min(1).max(160).optional().nullable(),
  messages: z
    .array(AssistantConversationMessageSchema)
    .max(ASSISTANT_CONVERSATION_LIMITS.maxMessages),
})

export type UpsertAssistantConversationRequest = z.infer<
  typeof UpsertAssistantConversationRequestSchema
>

export const ListAssistantConversationsQuerySchema = z.object({
  surface: AssistantSurfaceSchema,
  projectId: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type ListAssistantConversationsQuery = z.infer<
  typeof ListAssistantConversationsQuerySchema
>

export const GetAssistantConversationQuerySchema = z.object({
  id: z.string().uuid().optional(),
  surface: AssistantSurfaceSchema.optional(),
  projectId: z.string().trim().min(1).max(160).optional(),
})

export type GetAssistantConversationQuery = z.infer<
  typeof GetAssistantConversationQuerySchema
>

export interface AssistantConversationRecord {
  id: string
  surface: AssistantSurfaceId
  projectId: string | null
  title: string | null
  messages: AssistantConversationMessageStored[]
  createdAt: string
  updatedAt: string
}

export interface AssistantConversationSummary {
  id: string
  surface: AssistantSurfaceId
  projectId: string | null
  title: string | null
  updatedAt: string
  messageCount: number
}

export interface AssistantConversationShare {
  token: string
  expiresAt: string
}

export interface SharedAssistantConversationRecord {
  id: string
  surface: AssistantSurfaceId
  title: string | null
  messages: AssistantConversationMessageStored[]
  createdAt: string
  updatedAt: string
}
