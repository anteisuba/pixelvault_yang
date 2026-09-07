/**
 * **上下文卡**的 schema 层（第三期 K1）。
 *
 * 词表与上限住 `constants/context-cards.ts`，分工与
 * `constants/assistant-persona.ts` ↔ `types/assistant-persona.ts` 同构。
 *
 * ── 读写分离，逐条 ──────────────────────────────────────────────
 * ① **写入严格**：`CreateContextCardSchema` / `UpdateContextCardSchema` 一个多余
 *    字段都不收（`.strict()`），因为客户端递进来的每一格都会落库。
 * ② **读取回落**：`ContextCardSchema` 是「库里那一行长什么样」。存量行的 `images`
 *    是一列 Json —— 词表改过而存量没跟上时，坏掉的**那一张图**被丢掉，
 *    ⛔ 不连累整张卡读不出来（判据与 persona 的 `avatarPreset` 单独回落同源）。
 * ③ **参考图 URL 不在写入 schema 里**：它由上传那条腿自己写
 *    （`/api/context-cards/[id]/images`）。客户端递一条 URL 进来等于绕开 R2 生命
 *    周期 —— 与 persona 的 `avatarUrl` 逐字同一条判据。
 */

import { z } from 'zod'

import {
  CONTEXT_CARD_IMAGE_ROLES,
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_KINDS,
  CONTEXT_CARD_LIMITS,
} from '@/constants/context-cards'

export const ContextCardKindSchema = z.enum(CONTEXT_CARD_KINDS)
export const ContextCardImageRoleSchema = z.enum(CONTEXT_CARD_IMAGE_ROLES)

/**
 * 常挂目标 —— **域 id 或工作台 id**，一段自由但收窄的短字符串。
 *
 * ⛔ 有意不写成 `z.enum(ASSISTANT_OPERATOR_DOMAINS)`：常挂的粒度比域更细
 * （「这台 LoRA 工作台」而不是「所有 LoRA 工作台」），而工作台 id 是运行时才有的
 * 东西。收窄靠字符集与长度，⛔ 不靠一份必然漂移的第二词表。
 */
export const ContextCardScopeSchema = z
  .string()
  .trim()
  .min(1)
  .max(CONTEXT_CARD_LIMITS.maxScopeChars)
  .regex(/^[a-zA-Z0-9:_-]+$/, 'scope must be a plain id')

/**
 * 一张参考图。
 *
 * ⚠ `url` 必须是已经落在 R2 上的地址 —— ⛔ 不接受 `data:`（Hard Rule：不 base64
 * 落库）。校验在这里，而不是等到拼系统提示时才发现塞了 200 KB 进去。
 */
export const ContextCardImageSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (value) => !value.startsWith('data:'),
      'Reference images must be uploaded first — no data URLs.',
    ),
  role: ContextCardImageRoleSchema,
  /** 来源标注（原页 URL / 出处 / 时间码）。owner 的 S2 溯源字段里的那一格。 */
  sourceRef: z
    .string()
    .trim()
    .min(1)
    .max(CONTEXT_CARD_LIMITS.maxSourceRefChars)
    .nullish(),
})

export type ContextCardImage = z.infer<typeof ContextCardImageSchema>

/** 一张卡读回来的样子。 */
export const ContextCardSchema = z.object({
  id: z.string().min(1),
  kind: ContextCardKindSchema,
  name: z.string().trim().min(1).max(CONTEXT_CARD_LIMITS.maxNameChars),
  summary: z.string().trim().max(CONTEXT_CARD_LIMITS.maxSummaryChars),
  body: z.string().max(CONTEXT_CARD_LIMITS.maxBodyChars),
  images: z.array(ContextCardImageSchema).max(CONTEXT_CARD_LIMITS.maxImages),
  negative: z
    .string()
    .trim()
    .max(CONTEXT_CARD_LIMITS.maxNegativeChars)
    .nullable(),
  pinnedScopes: z
    .array(ContextCardScopeSchema)
    .max(CONTEXT_CARD_LIMITS.maxPinnedScopes),
  /** ISO 串。 */
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ContextCard = z.infer<typeof ContextCardSchema>

/**
 * 写入用的**列本体**。两个写入 schema 都从它派生 —— 写两遍字段的表现是
 * 「新建时能填的字段和编辑时能改的字段悄悄不一样」。
 */
const ContextCardWritableShape = {
  kind: ContextCardKindSchema,
  name: z.string().trim().min(1).max(CONTEXT_CARD_LIMITS.maxNameChars),
  summary: z
    .string()
    .trim()
    .max(CONTEXT_CARD_LIMITS.maxSummaryChars)
    .default(''),
  body: z.string().max(CONTEXT_CARD_LIMITS.maxBodyChars).default(''),
  negative: z
    .string()
    .trim()
    .max(CONTEXT_CARD_LIMITS.maxNegativeChars)
    .nullish(),
  pinnedScopes: z
    .array(ContextCardScopeSchema)
    .max(CONTEXT_CARD_LIMITS.maxPinnedScopes)
    .default([]),
} as const

/** POST `/api/context-cards`。⚠ `images` 不在这里 —— 见文件头注 ③。 */
export const CreateContextCardSchema = z
  .object(ContextCardWritableShape)
  .strict()

export type CreateContextCardRequest = z.infer<typeof CreateContextCardSchema>

/**
 * PATCH `/api/context-cards/[id]` —— 每一格都可省。
 *
 * ⚠ `kind` **可以改**：用户把一张误建成「风格」的卡改成「角色」是一个真实动作，
 * 而三档共用同一套列，改它不需要搬任何数据。
 */
export const UpdateContextCardSchema = z
  .object({
    kind: ContextCardKindSchema.optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(CONTEXT_CARD_LIMITS.maxNameChars)
      .optional(),
    summary: z
      .string()
      .trim()
      .max(CONTEXT_CARD_LIMITS.maxSummaryChars)
      .optional(),
    body: z.string().max(CONTEXT_CARD_LIMITS.maxBodyChars).optional(),
    negative: z
      .string()
      .trim()
      .max(CONTEXT_CARD_LIMITS.maxNegativeChars)
      .nullish(),
    pinnedScopes: z
      .array(ContextCardScopeSchema)
      .max(CONTEXT_CARD_LIMITS.maxPinnedScopes)
      .optional(),
    /**
     * 常挂开关的**原子式**改法（对话框上那颗「挂到当前工作台」）。
     *
     * ⭐ 为什么不让客户端读出数组、加一项、整份写回：那是一次典型的丢失更新 ——
     * 用户在图片工作台上挂这张卡的同时，另一个标签页正在视频工作台上挂它，
     * 后写的那一份会把前一个的常挂**抹掉**，而两边都显示成功。服务端读改写一次
     * 就没有这回事。
     * ⛔ 与 `pinnedScopes` 互斥：同一次请求里既整份覆盖又切一格，语义没有答案。
     */
    pin: z
      .object({ scope: ContextCardScopeSchema, pinned: z.boolean() })
      .strict()
      .optional(),
  })
  .strict()
  /** 空 PATCH 是调用方的 bug，⛔ 不静默当成一次成功的空操作。 */
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be given',
  )
  .refine(
    (value) => !(value.pin && value.pinnedScopes),
    'Send either pinnedScopes or pin, not both',
  )

export type UpdateContextCardRequest = z.infer<typeof UpdateContextCardSchema>

/** GET `/api/context-cards` 的查询串。 */
export const ListContextCardsQuerySchema = z.object({
  kind: ContextCardKindSchema.optional(),
  /** 给了就只返回**常挂在这个域**的卡（系统提示注入走的就是这一条）。 */
  pinnedScope: ContextCardScopeSchema.optional(),
})

export type ListContextCardsQuery = z.infer<typeof ListContextCardsQuerySchema>

/**
 * POST `/api/context-cards/[id]/images` —— 与 persona 头像那条路同形
 * （data URL / http 地址进来，落 R2 之后回一张 `ContextCardImage`）。
 */
export const AddContextCardImageSchema = z
  .object({
    imageData: z.string().min(1, 'Image data is required'),
    role: ContextCardImageRoleSchema.default(
      CONTEXT_CARD_IMAGE_ROLE_IDS.reference,
    ),
    sourceRef: z
      .string()
      .trim()
      .min(1)
      .max(CONTEXT_CARD_LIMITS.maxSourceRefChars)
      .nullish(),
  })
  .strict()

export type AddContextCardImageRequest = z.infer<
  typeof AddContextCardImageSchema
>

/** DELETE `/api/context-cards/[id]/images` —— 按 URL 摘，⛔ 不按下标。 */
export const RemoveContextCardImageSchema = z
  .object({ url: z.string().url() })
  .strict()

export type RemoveContextCardImageRequest = z.infer<
  typeof RemoveContextCardImageSchema
>

/**
 * 一张卡在 `list_context_cards` 结果里的**摘要形态**。
 *
 * ⭐ ⛔ **没有 `body`**：正文四千字，塞进列表结果等于让每一条日志都拖着一整份
 * 设定过网，而模型十次里有九次只需要「有哪些卡、叫什么」。正文由
 * `read_context_card` 单独拉 —— 与 `read_url` 的 `focus` 截段同一条判据。
 * ⚠ `hasNegative` / `imageCount` 是**给模型的路标**：它据此决定值不值得为这张卡
 * 再花一步去读全文。
 */
export const ContextCardDigestSchema = z.object({
  id: z.string().min(1),
  kind: ContextCardKindSchema,
  name: z.string().min(1).max(CONTEXT_CARD_LIMITS.maxNameChars),
  summary: z.string().max(CONTEXT_CARD_LIMITS.maxSummaryChars),
  hasNegative: z.boolean(),
  imageCount: z.number().int().min(0).max(CONTEXT_CARD_LIMITS.maxImages),
  pinnedScopes: z
    .array(ContextCardScopeSchema)
    .max(CONTEXT_CARD_LIMITS.maxPinnedScopes),
})

export type ContextCardDigest = z.infer<typeof ContextCardDigestSchema>

/** 一张卡 → 它的摘要形态。⛔ 别在两处各拼一份。 */
export function toContextCardDigest(card: ContextCard): ContextCardDigest {
  return {
    id: card.id,
    kind: card.kind,
    name: card.name,
    summary: card.summary,
    hasNegative: Boolean(card.negative),
    imageCount: card.images.length,
    pinnedScopes: card.pinnedScopes,
  }
}
