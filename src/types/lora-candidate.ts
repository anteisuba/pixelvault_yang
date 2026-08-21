/**
 * LoRA 推荐候选的统一形状（切片 3「一次确认链」，任务包 §5）。
 *
 * ── 这个文件为什么存在 ─────────────────────────────────────────────
 * ⭐ **模型绝不自己写 LoRA 的 id / URL / 任何元数据。** 它只能从服务端检索回来的
 * 候选里挑一个 `candidateId`，并说出为什么推荐；卡上显示的一切事实来自这里的
 * 对象，不来自模型输出。
 *
 * 依据是 `[[setup]]` 那批的实证：不给模型可选列表，它就编了一个工作区里不存在
 * 的「Animagine XL」——表现是「功能坏了」，不是「模型答错了」。LoRA 的代价更大：
 * 编一个 civitai 下载链接，用户点确认之后拿到的是 404 或者别人的模型。
 *
 * ── 为什么两个源归一成一个形状 ─────────────────────────────────────
 * Civitai 与 HF 的元数据密度差得很远（HF 拿不到样图列表和推荐权重，Civitai 拿
 * 不到 SPDX 许可）。归一**不是**把两边补齐成一样 —— 那需要猜。归一是让「不知道」
 * 有一个统一的表示（null）+ 一个统一的说明（`metadataCompleteness`），让卡面
 * 一套渲染逻辑就能如实显示两种密度。
 */

import { z } from 'zod'

import {
  LORA_CANDIDATE_LIMITS,
  LORA_CANDIDATE_NOT_IMPORTABLE_REASON_VALUES,
  LORA_CANDIDATE_SOURCE_STATUS_VALUES,
  LORA_CANDIDATE_SOURCE_VALUES,
  LORA_METADATA_COMPLETENESS_VALUES,
} from '@/constants/lora-candidate'
import {
  FavoriteLoraRequestSchema,
  LoraAssetTypeSchema,
  LoraCandidateLicenseSchema,
  LoraSourceSnapshotSchema,
} from '@/types'

/**
 * 一次确认之后要发给导入链的东西 —— 逐字是 `favoriteExternalLora` 的入参，
 * 外加**必填**的来源快照。
 *
 * ⚠ **候选自带导入载荷，而不是让确认时按 id 再搜一次。** 再搜一次有两个真问题：
 * 上游随时可能改（用户看到的卡和实际导入的不是同一版），以及一次确认要等两次
 * 外部请求。载荷跟着候选走，确认那一下只碰我们自己的库。
 *
 * ⛔ **这个对象不进提示词**。模型看到的候选投影只有 id / 名字 / 作者 / 家族 /
 * 触发词 / 许可 / 是否已挂载，见 `buildLoraCandidateBlock`。
 */
export const LoraCandidateImportPayloadSchema =
  FavoriteLoraRequestSchema.extend({
    sourceSnapshot: LoraSourceSnapshotSchema,
  })
export type LoraCandidateImportPayload = z.infer<
  typeof LoraCandidateImportPayloadSchema
>

export const LoraCandidateSchema = z.object({
  /**
   * 本轮候选列表里的唯一键，也是模型在 `[[lora]]` 里**唯一被允许写的东西**。
   * 形如 `civitai:<modelId>:<versionId>` / `hf:<repoId>@<revision>#<filename>`。
   */
  candidateId: z.string().min(1),
  source: z.enum(LORA_CANDIDATE_SOURCE_VALUES),
  name: z.string().min(1),
  /** null = 取不到作者（Civitai 作者注销 / HF repoId 没有命名空间段）。 */
  author: z.string().nullable(),
  license: LoraCandidateLicenseSchema,
  /**
   * 底模家族。**null = 定不出来**（不是 `'unknown'` 字符串）—— 导入门槛判的
   * 就是这一位，见 `importable`。
   */
  baseModelFamily: z.string().nullable(),
  type: LoraAssetTypeSchema,
  triggerWords: z.array(z.string()),
  /** 作者推荐权重。两个源目前都拿不到结构化的推荐值，恒 undefined —— 留着是
   *  因为 Civitai description 解析（已有引擎）以后能补上，不是预防性抽象。 */
  recommendedWeight: z.number().positive().optional(),
  sampleImageUrls: z.array(z.string()),
  fileSizeBytes: z.number().int().nonnegative().nullable(),
  pageUrl: z.string(),
  downloads: z.number().int().nonnegative().nullable(),
  metadataCompleteness: z.enum(LORA_METADATA_COMPLETENESS_VALUES),
  /**
   * 能不能走导入链。门槛（任务包 §5）：**定得出 baseModelFamily + 有权重文件**。
   * false 的候选**照样展示**（策略 C：不阻断，如实说明），只是确认按钮禁用。
   */
  importable: z.boolean(),
  /** `importable:false` 时必有 —— 原因码，不是文案，三语在 UI 侧。 */
  notImportableReason: z
    .enum(LORA_CANDIDATE_NOT_IMPORTABLE_REASON_VALUES)
    .optional(),
  /**
   * 工作台上已经挂着这一把（按名字归一比对挂载栈）。
   * ⚠ 推荐一个用户已经挂着的 LoRA 是最刺眼的「助手没看见我的屏幕」。
   */
  alreadyMounted: z.boolean(),
  /** 用户库里已经有这一把（按 loraUrl / civitaiModelVersionId 精确比对）。 */
  alreadyImported: z.boolean(),
  /** `importable:false` 时为 null。 */
  importPayload: LoraCandidateImportPayloadSchema.nullable(),
})
export type LoraCandidate = z.infer<typeof LoraCandidateSchema>

/** 单源回执 —— 与检索线同一套语义：**空不是挂**，两者卡面说法不同。 */
export const LoraCandidateSourceReceiptSchema = z.object({
  source: z.enum(LORA_CANDIDATE_SOURCE_VALUES),
  status: z.enum(LORA_CANDIDATE_SOURCE_STATUS_VALUES),
  count: z.number().int().nonnegative(),
  tookMs: z.number().int().nonnegative(),
  error: z.string().optional(),
})
export type LoraCandidateSourceReceipt = z.infer<
  typeof LoraCandidateSourceReceiptSchema
>

export const LoraCandidateSearchResultSchema = z.object({
  candidates: z.array(LoraCandidateSchema).max(
    // 上限就是喂给模型的上限：搜回来更多也没有第二个消费者。
    LORA_CANDIDATE_LIMITS.maxCandidates,
  ),
  /** 本轮实际用的检索词（去掉客套/问句脚手架后的）。 */
  query: z.string(),
  /** 每个源都要有一条 —— 没打的源也要有（status='skipped' 之外的四态见常量）。 */
  sources: z.array(LoraCandidateSourceReceiptSchema),
})
export type LoraCandidateSearchResult = z.infer<
  typeof LoraCandidateSearchResultSchema
>
