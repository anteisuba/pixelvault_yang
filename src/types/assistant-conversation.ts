import { z } from 'zod'

import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import {
  ASSISTANT_LORA_PICK_LIMITS,
  ASSISTANT_PROTOCOL_DOMAIN_IDS,
  type AssistantProtocolDomain,
} from '@/constants/assistant-protocol'
import { AssistantMediaReferenceSchema } from '@/types/assistant-media'
import {
  AssistantLoraPickSchema,
  AssistantPromptBlockSchema,
  AssistantSetupBlockSchema,
} from '@/types/assistant-protocol'
import { LoraCandidateSchema } from '@/types/lora-candidate'
import { StudioOperatorHistoryEntrySchema } from '@/types/studio-operator-history'

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
  /**
   * LoRA 推荐（`[[lora]]` 块）—— 模型给的那一半：挑了哪个 candidateId、为什么、
   * 建议多少权重。
   *
   * 持久化的判据与 `promptDraft` 一字不差：**交付物 vs 交互态**。推荐卡是交付物
   * ——三轮前推荐的那把 LoRA，今天点「导入并挂载」依然是对的那一把，和「复制」
   * 按钮一个道理。不存的代价是刷新一次整段推荐变成一句白话。
   */
  loraPicks: z
    .array(AssistantLoraPickSchema)
    .max(ASSISTANT_LORA_PICK_LIMITS.maxPicks)
    .optional(),
  /**
   * 这一轮**被挑中的**那几条候选本体 —— 卡面上的名字/作者/许可/触发词/导入载荷
   * 全在这里，模型输出里一个事实字段都没有。
   *
   * ⚠ **只存被挑中的（≤3），不存整轮候选（≤6）**：没被挑中的那几条在界面上不
   * 出现，存了只是让每条历史消息多背几 KB。与 `researchRunId` 那条「证据本体不
   * 进 messages」是同一个取舍，只是这里没有可以按 id 水合的库表 —— 候选是那一
   * 刻的上游快照，重搜一次拿到的不是同一份，所以本体必须跟着走。
   */
  loraCandidates: z
    .array(LoraCandidateSchema)
    .max(ASSISTANT_LORA_PICK_LIMITS.maxPicks)
    .optional(),
  /**
   * 操作员线程的那一条**可读痕迹**（P4-B）。
   *
   * ⭐ 判据仍是 `promptDraft` 那条**交付物 vs 交互态**，只是这里的答案更狠：
   * 操作员线程里能点的东西（撤销 / 还原这轮 / 联网候选的「选用」/ primed 的生成键）
   * **一个都不存**。它们不是交付物，是「对当前表单的控制权」，而重新加载之后表单
   * 早就不是当时那张 —— 画布那边的原话是「一条几分钟前针对另一张图的提案，重新
   * 加载后再点应用只会做错事」。恢复一段历史 = 恢复**对话可读性**，不恢复控制权。
   * 结构上的保证见 `types/studio-operator-history.ts` 的头注：那个类型里没有任何
   * 字段装得下 `inverse`。
   *
   * ⚠ `.catch(undefined)`：这一格是**只读装饰**。载荷哪天读不出来（旧版本写的、
   * 或者协议改过），该退化成一条纯文本消息，⛔ 不该让整条消息在 `sanitizeMessages`
   * 里被判非法丢掉 —— 那是「用户的历史凭空少一段」，比少一个图标坏得多。
   */
  operator: StudioOperatorHistoryEntrySchema.optional().catch(undefined),
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
  /**
   * 这条会话是**操作员线程**（P4-B），不是旧助手那种纯对白。
   *
   * ⚠ 存在的理由是两套助手**共用同一个 surface**：音频工作台的旧助手（域回落到
   * `image`）与图片工作台的操作员，写进去的都是 `IMAGE_STUDIO`。不分开的表现是
   * 操作员的会话菜单里混着一串点开只有白文本的旧对话 —— 而「点不动的历史比没有
   * 历史更糟」这句话，P2 那颗壳的注释里已经写过一次。
   * ⚠ 可选：老客户端 / 测试里现造的 summary 不必给这个键。
   */
  operatorThread?: boolean
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
