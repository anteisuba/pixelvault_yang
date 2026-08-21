import { z } from 'zod'

import { NODE_ASSISTANT_OP_LIMITS } from '@/constants/node-assistant-ops'
import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_MESSAGE_ROLES,
  NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID,
  NODE_STUDIO_REFERENCE_ROLES,
} from '@/constants/node-studio'
import {
  NodeStatusSchema,
  NodeWorkflowNodeTypeSchema,
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
 * 助手看得见的**一个节点的当前值**（切片 5 第一批扩容）。
 *
 * ── 为什么要扩 ──────────────────────────────────────────────────────
 * 助手能写一个字段，就必须先看得见那个字段的现值，否则它只能盲写。盲写的后果
 * 是有实证的：工作台那边不给模型可选模型列表，它就编了个工作区里根本不存在的
 * 「Animagine XL」——用户看到的是「功能坏了」，而不是「模型答错了」。
 *
 * ── 加什么、不加什么 ────────────────────────────────────────────────
 * 只加**这一批的 op 真的要用**的现值，先窄后宽：第一批是 `set_prompt` /
 * `set_image_category`，第二批补上 `set_model` / `set_params` / `attach_asset`
 * 各自的现值（`model` / `params` / `references`）。
 * ⛔ 始终不塞 `referenceAssets` 的 URL：那是纯 token 消耗，模型也用不上（要看图
 * 走 references 那条正路），第二批只喂计数、role 与源节点 id。
 * ⛔ 也不塞「能换成哪些模型」那张目录：它是**画布级**的一份表，逐节点重复 32 遍
 * 是纯浪费。那段由 service 从模型常量生成一次（`buildModelCatalogInstructions`）。
 *
 * ── token 预算（`maxNodes` = 32 已在截断，这里算的是每节点增量）────────
 * · `promptExcerpt`：**不是新增开销**，它就是原来的 `summary`（旧实现里
 *   `getNodeSummary` 返回的一直是 `node.data.prompt`）改名 + 说清它是什么。
 *   同样受 `maxNodeSummaryLength`（900）截断。改名的收益是模型知道「这段字就是
 *   那个可写的 prompt 字段」，而不是一段来路不明的描述。
 * · `imageCategory`：≤ 11 字符的枚举值 + 渲染成 ` · category: frameStart`
 *   ≈ 23 字符 / ~8 token，**只出现在能标分类的节点上**（图片节点，非身份卡）。
 *   32 个节点全是图片的极端情况 ≈ 736 字符 / ~250 token。
 * · `imageCategoryLabel`：只在 `custom` 时出现，≤ 80 字符。
 * · `model`（第二批）：一个模型 id + 渲染成 ` · model: seedance-2.0` ≈ 30 字符 /
 *   ~10 token，**只出现在选得了模型的节点上**。32 个节点全都选得了模型的极端情况
 *   ≈ 960 字符 / ~320 token。
 * · `params`（第二批）：只出现在视频生成节点上，全设满 ≈ 60 字符 / ~20 token。
 *   一张画布上视频节点通常个位数，实测量级远小于上面那条。
 * · `references`（第二批）：只出现在收集器卡上，每条 ≈ 一个 role + 一个节点 id
 *   ≈ 30 字符，上限 `maxNodeReferences`（6）→ 单卡最坏 ≈ 200 字符 / ~70 token。
 */
export const NodeAssistantNodeContextSchema = z.object({
  id: z.string().trim().min(1).max(160),
  type: NodeWorkflowNodeTypeSchema,
  status: NodeStatusSchema,
  title: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength),
  /**
   * 节点**当前的提示词**，按 `maxNodeSummaryLength` 截断。空提示词直接缺席 ——
   * 「这个节点还没有提示词」由字段不在来表达，不塞空串占位。
   */
  promptExcerpt: z
    .string()
    .trim()
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength)
    .optional(),
  /**
   * 图片分类的现值。三态**都有意义**，别把 `unset` 优化掉：
   *   · 字段缺席 = 这个节点**没有分类这回事**（视频 / 音色 / 镜头文本 / 身份卡）。
   *   · `unset`  = 有这个字段，但还没标。复用 Select 那颗哨兵
   *     （`NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID`），语义完全一致：「字段在、值为空」。
   *   · 其余     = 11 个分类之一，就是模型该写回 `set_image_category` 的那个值。
   *
   * ⚠ 光靠 `type` 分不出来：身份卡（角色卡 / 背景卡）的 `type` 也是 `image`，
   * 只有 `data.role` 才能区分，而 role 不在这份 payload 里。所以「能不能标分类」
   * 必须由这个字段在不在**直接说出来**，否则模型只能拿身份卡去试，然后吃一条
   * `notCategorizable`。
   */
  imageCategory: z
    .enum([...NODE_STUDIO_REFERENCE_ROLES, NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID])
    .optional(),
  /** `imageCategory === 'custom'` 时的展示名，与数据层成对。 */
  imageCategoryLabel: z
    .string()
    .trim()
    .max(NODE_ASSISTANT_OP_LIMITS.maxCategoryLabelLength)
    .optional(),
  /**
   * 节点当前选的**模型 id**（切片 5 第二批，`set_model` 的现值）。三态与
   * `imageCategory` 完全同构：
   *   · 字段缺席 = 这个节点不选模型（身份卡 / 镜头文本 / 参考视频 / 合并节点）。
   *   · `unset`  = 能选，但还没选。共用同一颗哨兵，见
   *     `NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID` 的第三个消费者那段。
   *   · 其余     = 模型 id 本身，也就是模型该写回 `set_model` 的那个值。
   *
   * ⛔ 只喂 id，不喂 `providerConfig`：baseUrl / label 那一坨对模型没有任何用处，
   * 纯 token 消耗（一个 provider 的 baseUrl 就够 40 字符）。
   */
  model: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxModelIdLength)
    .optional(),
  /**
   * 生成档位的现值（`set_params` 的现值）。**字段在 = 这个节点有档位可调**
   * （今天只有视频生成节点），空对象 = 有档位但一个都没设，让模型分得清
   * 「没有这回事」和「还没设」。
   *
   * 值原样带出：`duration` 在数据层就是字符串（`'6'` / `'auto'`），这里不做
   * 美化 —— 模型写回时要写的也是同一套值。
   */
  params: z
    .object({
      aspectRatio: z
        .string()
        .trim()
        .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
        .optional(),
      resolution: z
        .string()
        .trim()
        .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
        .optional(),
      duration: z
        .string()
        .trim()
        .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
        .optional(),
      generateAudio: z.boolean().optional(),
      seed: z.number().optional(),
    })
    .optional(),
  /**
   * 参考图集的现值（`attach_asset` 的现值）。**字段在 = 这个节点收参考图**
   * （收集器卡：角色卡 / 背景卡），空 `items` = 收但还没挂。
   *
   * ⛔ **绝不带 URL**：模型拿一条 R2 长地址没有任何用处，而它恰恰是最贵的那种
   * token。带 `sourceId`（画布上那个源节点的 id）是有用的 —— 模型据此知道「这张
   * 卡已经收了 A 节点的图」，不会再提一条注定被 `duplicate` 拒掉的挂载。
   */
  references: z
    .object({
      /** 还能放几条的那个上限（`resolveReferenceAssetLimit`）。 */
      limit: z.number().int().nonnegative(),
      items: z
        .array(
          z.object({
            role: z.enum(NODE_STUDIO_REFERENCE_ROLES),
            sourceId: z.string().trim().min(1).max(160).optional(),
          }),
        )
        .max(NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences),
    })
    .optional(),
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
  nodes: z
    .array(NodeAssistantNodeContextSchema)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxNodes),
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
   * Reference-research turn: study an existing film/anime/short and return
   * structural analysis + original script suggestions + prompt seeds. Routed
   * through a grounding-capable provider (Gemini/OpenAI) when one is available,
   * otherwise degrades to the model's own knowledge.
   */
  research: z.boolean().optional(),
})

export type NodeAssistantMessageRole = z.infer<
  typeof NodeAssistantMessageRoleSchema
>
export type NodeAssistantMessage = z.infer<typeof NodeAssistantMessageSchema>
export type NodeAssistantNodeContext = z.infer<
  typeof NodeAssistantNodeContextSchema
>
export type NodeAssistantMediaReference = z.infer<
  typeof AssistantMediaReferenceSchema
>
export type NodeAssistantRequest = z.infer<typeof NodeAssistantRequestSchema>
