import { z } from 'zod'

import {
  RESEARCH_CONCLUSION_BASES,
  type ResearchConclusionBasis,
} from '@/constants/research'
import {
  VISION_BASIS_VALUES,
  VISION_CONCRETE_BASIS_VALUES,
  VISION_CONCRETE_VALUE_PATTERN,
  VISION_DEFECT_CATEGORY_VALUES,
  VISION_DEFECT_SEVERITY_VALUES,
  VISION_LIMITS,
  VISION_TASKS,
  VISION_TASK_MIN_MEDIA,
  VISION_TASK_VALUES,
  type VisionTask,
} from '@/constants/vision'
import { AssistantSurfaceSchema } from '@/types/assistant-conversation'

// ─── 断言的两种形状 ─────────────────────────────────────────────

const claimText = z.string().trim().min(1).max(VISION_LIMITS.claimChars)

/**
 * §3.4 第 3 闸的结构实现：**带具体数字的断言不许标 `inference`**。
 *
 * 🔬 实测的坏样本长这样：先声明「我无法确认」，然后照样给出「大约 1,500 到 2,500」
 * （真值 3,644）。对冲不豁免编造 —— 所以数字出现时 basis 只剩「看见了」和「不知道」。
 *
 * 三个任务 schema 共用这一个，不是各写各的正则：判据分三份的下场是某天只改了一份。
 */
function refuteHedgedNumber(
  ctx: z.RefinementCtx,
  basis: ResearchConclusionBasis,
  texts: readonly string[],
): void {
  if (basis !== RESEARCH_CONCLUSION_BASES.inference) return
  if (!texts.some((text) => VISION_CONCRETE_VALUE_PATTERN.test(text))) return
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['basis'],
    message:
      'A claim containing a concrete number must be basis "observation" or "unknown", never "inference"',
  })
}

/**
 * 一条自由描述型断言。三态 basis 全开。
 *
 * ⚠ 但**带数字的自由描述仍按具体断言处理**：`superRefine` 里那道闸拦的是
 * 「这张图大约有 1,500 个粒子（推断）」这种句子 —— 编造具体量级的时候加个
 * 「大约」不会让它变成合法推断，只会让它更容易被信。
 */
export const VisionClaimSchema = z
  .object({
    /** 这条说的是哪一面（如 `lighting` / `pose`）。给 UI 当小标题用。 */
    label: z.string().trim().min(1).max(80),
    text: claimText,
    basis: z.enum(VISION_BASIS_VALUES),
  })
  .superRefine((claim, ctx) => {
    refuteHedgedNumber(ctx, claim.basis, [claim.text])
  })

export type VisionClaim = z.infer<typeof VisionClaimSchema>

/**
 * 具体名称 / 数值类断言 —— **basis 在类型上就只有两档**。
 *
 * 发色、瞳色、名字、称号、色板：这些要么你在图上看见了（`observation`），
 * 要么你不知道（`unknown`）。「我推断她大概是粉发」是本管线要挡的东西，
 * 所以不给它一个能填的格子，而不是在提示词里请求它别填。
 */
export const VisionNamedClaimSchema = z.object({
  label: z.string().trim().min(1).max(80),
  text: claimText,
  basis: z.enum(VISION_CONCRETE_BASIS_VALUES),
})

export type VisionNamedClaim = z.infer<typeof VisionNamedClaimSchema>

const uncertaintiesSchema = z
  .array(z.string().trim().min(1).max(VISION_LIMITS.claimChars))
  .max(VISION_LIMITS.maxUncertainties)
  .default([])

// ─── 任务 1：character_identity ─────────────────────────────────

/**
 * 身份特征（稳定层）—— 换个场景、换个姿势也不该变的那些。
 *
 * 槽位是**具名的**而不是一个自由数组：`extractCharacterAttributes` 要把它无损映射
 * 回 `CharacterAttributes` 的 13 个字段（调用方与返回形状不变，避免 141 文件级联）。
 * 自由数组意味着映射时要靠 label 字符串猜，猜错就是静默丢字段。
 */
export const VisionIdentityLayerSchema = z.object({
  hairColor: VisionNamedClaimSchema.optional(),
  hairStyle: VisionNamedClaimSchema.optional(),
  eyeColor: VisionNamedClaimSchema.optional(),
  skinTone: VisionNamedClaimSchema.optional(),
  bodyType: VisionClaimSchema.optional(),
  distinguishingFeatures: VisionClaimSchema.optional(),
  colorPalette: VisionNamedClaimSchema.optional(),
})

/** 可变层 —— 只属于这一张图的：这次穿了什么、摆了什么姿势。 */
export const VisionVariableLayerSchema = z.object({
  outfit: VisionClaimSchema.optional(),
  accessories: VisionClaimSchema.optional(),
  pose: VisionClaimSchema.optional(),
  expression: VisionClaimSchema.optional(),
})

export const VisionCharacterIdentitySchema = z.object({
  identity: VisionIdentityLayerSchema,
  variableLayer: VisionVariableLayerSchema,
  artStyle: VisionClaimSchema.optional(),
  /** 整体描述。下游拼提示词时当兜底段落用。 */
  summary: VisionClaimSchema.optional(),
  uncertainties: uncertaintiesSchema,
})

export type VisionCharacterIdentity = z.infer<
  typeof VisionCharacterIdentitySchema
>

// ─── 任务 2：style_study ────────────────────────────────────────

export const VisionStyleStudySchema = z.object({
  /** 画风轴：媒介 / 笔触 / 线条 / 色彩 / 光照 / 构图 / 质感。 */
  axes: z.array(VisionClaimSchema).max(VISION_LIMITS.maxListItems).default([]),
  /** 色板。具体色名与十六进制都是具体断言 —— 只能看见或不知道。 */
  palette: z
    .array(VisionNamedClaimSchema)
    .max(VISION_LIMITS.maxListItems)
    .default([]),
  /** 「看起来像什么流派 / 受什么影响」—— 这一档本来就是推断，允许 inference。 */
  influences: z
    .array(VisionClaimSchema)
    .max(VISION_LIMITS.maxListItems)
    .default([]),
  uncertainties: uncertaintiesSchema,
})

export type VisionStyleStudy = z.infer<typeof VisionStyleStudySchema>

// ─── 任务 3：quality_review ─────────────────────────────────────

export const VisionDefectSchema = z
  .object({
    category: z.enum(VISION_DEFECT_CATEGORY_VALUES),
    severity: z.enum(VISION_DEFECT_SEVERITY_VALUES),
    text: claimText,
    basis: z.enum(VISION_BASIS_VALUES),
  })
  .superRefine((defect, ctx) => {
    refuteHedgedNumber(ctx, defect.basis, [defect.text])
  })

export type VisionDefect = z.infer<typeof VisionDefectSchema>

export const VisionQualityReviewSchema = z.object({
  defects: z
    .array(VisionDefectSchema)
    .max(VISION_LIMITS.maxListItems)
    .default([]),
  strengths: z
    .array(VisionClaimSchema)
    .max(VISION_LIMITS.maxListItems)
    .default([]),
  /** 一句话结论。没有把握时它自己就该是 `unknown`。 */
  verdict: VisionClaimSchema.optional(),
  uncertainties: uncertaintiesSchema,
})

export type VisionQualityReview = z.infer<typeof VisionQualityReviewSchema>

// ─── 任务 4：compare ────────────────────────────────────────────

/**
 * 一条差异。
 *
 * `imageIndex` 是**输入序号**（0-based，指向 `mediaUrls` 的下标），不是断言 ——
 * 它由我们发起、模型只是引用，所以不受「具体数值只能 observation」那道闸约束。
 * 落 `ResearchRun.conclusions` 时它会变成 1-based 的 `evidenceRefs`。
 */
export const VisionComparePointSchema = z
  .object({
    aspect: z.string().trim().min(1).max(80),
    perImage: z
      .array(
        z.object({
          imageIndex: z
            .number()
            .int()
            .nonnegative()
            .max(VISION_LIMITS.maxMedia),
          text: claimText,
        }),
      )
      .min(1)
      .max(VISION_LIMITS.maxMedia),
    basis: z.enum(VISION_BASIS_VALUES),
  })
  .superRefine((point, ctx) => {
    refuteHedgedNumber(
      ctx,
      point.basis,
      point.perImage.map((entry) => entry.text),
    )
  })

export type VisionComparePoint = z.infer<typeof VisionComparePointSchema>

export const VisionCompareSchema = z.object({
  differences: z
    .array(VisionComparePointSchema)
    .max(VISION_LIMITS.maxListItems)
    .default([]),
  /** 所有图都成立的共性 —— 「哪里一致」跟「哪里不一致」同样是结论。 */
  shared: z
    .array(VisionClaimSchema)
    .max(VISION_LIMITS.maxListItems)
    .default([]),
  uncertainties: uncertaintiesSchema,
})

export type VisionCompare = z.infer<typeof VisionCompareSchema>

// ─── 任务 → schema（穷举 Record，无兜底）───────────────────────

/**
 * 每个任务一个 Zod schema —— 结构化输出就是拿这张表去校验的。
 *
 * ⛔ 不写 `default:` / 不写索引签名：加了任务却忘了给 schema，**编译期红**。
 * 兜底只会把「漏配了」变成「按别的任务的形状校验，然后安静地全字段丢失」。
 */
export const VISION_TASK_SCHEMAS = {
  [VISION_TASKS.characterIdentity]: VisionCharacterIdentitySchema,
  [VISION_TASKS.styleStudy]: VisionStyleStudySchema,
  [VISION_TASKS.qualityReview]: VisionQualityReviewSchema,
  [VISION_TASKS.compare]: VisionCompareSchema,
} as const satisfies Record<VisionTask, z.ZodType>

/**
 * 落库 / 回传形态 —— 带上 `task` 判别式。
 *
 * ⚠ `task` **不是模型吐的**，是我们发起这一轮时就知道的事。让模型回声一遍
 * 只会多一个它可能填错的字段，而填错的表现是「拿角色 schema 校验画风输出」。
 */
export const VisionObservationsSchema = z.discriminatedUnion('task', [
  VisionCharacterIdentitySchema.extend({
    task: z.literal(VISION_TASKS.characterIdentity),
  }),
  VisionStyleStudySchema.extend({ task: z.literal(VISION_TASKS.styleStudy) }),
  VisionQualityReviewSchema.extend({
    task: z.literal(VISION_TASKS.qualityReview),
  }),
  VisionCompareSchema.extend({ task: z.literal(VISION_TASKS.compare) }),
])

export type VisionObservations = z.infer<typeof VisionObservationsSchema>

// ─── 请求 / 响应 ────────────────────────────────────────────────

const mediaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(VISION_LIMITS.maxUrlLength)
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'Media must be an http(s) URL',
  })

/**
 * `POST /api/vision/analyze` 的入参。
 *
 * ⚠ **路由这一层只收 http(s) URL，不收 `data:`**：一是内联图会把请求体撑到几十 MB，
 * 二是 `data:` 进不了 `ResearchRun.evidence`（`imageUrl` 上限 2000 字符），
 * 落库时只能被跳过 —— 那等于「分析了一张事后查不到是哪张的图」。要分析本地文件
 * 先上传拿到 R2 URL。服务层仍容忍 `data:`，因为角色卡那条路在上传之前就要看图。
 */
export const VisionAnalyzeRequestSchema = z
  .object({
    task: z.enum(VISION_TASK_VALUES),
    mediaUrls: z.array(mediaUrlSchema).min(1).max(VISION_LIMITS.maxMedia),
    surface: AssistantSurfaceSchema,
    conversationId: z.string().trim().max(120).optional(),
    projectId: z.string().trim().max(120).optional(),
    /** 用户附加的一句话（「重点看手」）。仍会过 prompt-guard 的注入扫描。 */
    instruction: z
      .string()
      .trim()
      .max(VISION_LIMITS.instructionChars)
      .optional(),
    /** 用户当前选中的 key。看不了图时会借一条能看图的路。 */
    apiKeyId: z.string().trim().max(120).optional(),
  })
  .superRefine((input, ctx) => {
    const min = VISION_TASK_MIN_MEDIA[input.task]
    if (input.mediaUrls.length < min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mediaUrls'],
        message: `Task "${input.task}" needs at least ${min} image(s)`,
      })
    }
  })

export type VisionAnalyzeRequest = z.infer<typeof VisionAnalyzeRequestSchema>

/**
 * 摊平后的一条结论 —— 与检索线的 `ResearchConclusion` **同形但更窄**：
 * `basis` 少了 `'source'`（视觉线没有可点开的出处），所以它可以直接落进
 * `ResearchRun.conclusions` 那一列，反过来不行。
 *
 * `evidenceRefs` 是 1-based 的输入图序号，和检索线正文里的 `[n]` 同一套编号。
 */
export const VisionConclusionSchema = z.object({
  statement: z.string(),
  basis: z.enum(VISION_BASIS_VALUES),
  evidenceRefs: z.array(z.number().int().positive()),
})

export type VisionConclusion = z.infer<typeof VisionConclusionSchema>

/**
 * 一次视觉分析的结果。
 *
 * `grounded` 恒为 `false` 且**写死成字面量类型** —— 视觉线不联网是硬语义，
 * 不是这次恰好没搜到。类型上就不给它变成 `true` 的机会。
 */
export const VisionAnalysisResultSchema = z.object({
  /** `ResearchRun` 行 id。落库失败时是 `null`（分析本身已经成功，别连结果一起丢）。 */
  runId: z.string().nullable(),
  task: z.enum(VISION_TASK_VALUES),
  grounded: z.literal(false),
  observations: VisionObservationsSchema,
  conclusions: z.array(VisionConclusionSchema),
  /** 实际吃图的 adapter。 */
  model: z.string(),
  /** 用户选的路看不了图，借了一条 —— UI 要能如实说「这轮换了模型看图」。 */
  borrowedRoute: z.boolean(),
})

export type VisionAnalysisResult = z.infer<typeof VisionAnalysisResultSchema>
