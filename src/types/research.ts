import { z } from 'zod'

import {
  EVIDENCE_SOURCE_TIER_VALUES,
  RESEARCH_CONCLUSION_BASIS_VALUES,
  RESEARCH_FRESHNESS_VALUES,
  RESEARCH_GOAL_VALUES,
  RESEARCH_LIMITS,
  RESEARCH_RUN_STATUS_VALUES,
  RESEARCH_SOURCE_GROUP_VALUES,
  RESEARCH_SOURCE_ID_VALUES,
  RESEARCH_SOURCE_STATUS_VALUES,
} from '@/constants/research'

// ─── EvidenceItem ───────────────────────────────────────────────

export const EvidenceSourceTierSchema = z.enum(EVIDENCE_SOURCE_TIER_VALUES)
export const ResearchSourceIdSchema = z.enum(RESEARCH_SOURCE_ID_VALUES)

/**
 * 每条证据都带的四件事。
 *
 * - `sourceId` / `sourceTier`：UI 要露层级（「官方文档说的」≠「推上有人说」）。
 * - `retrievedAt`：§3.4 第 4 闸「新鲜度」全链的那一环。**一定要取到这条证据的
 *   时刻，不是 run 的时刻** —— 复用旧 run 的缓存证据时两者会差好几个小时。
 * - `title` / `url`：引用点开可达原文（§3.6 验收）。
 */
const EvidenceBaseSchema = z.object({
  /** run 内稳定的条目 id。`[n]` 引用用的是包内序号，这个是给去重/回填用的。 */
  id: z.string().trim().min(1).max(120),
  sourceId: ResearchSourceIdSchema,
  sourceTier: EvidenceSourceTierSchema,
  retrievedAt: z.string().datetime(),
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().max(2000).optional(),
  /** 该证据的语言，规划器按源选语言时用（萌百中文、danbooru 英文）。 */
  lang: z.enum(['zh', 'en', 'ja']).optional(),
  /**
   * 命中 `prompt-guard` 注入模式 → 标记并降级（excerpt 换成警示占位），
   * **不整体丢弃**：一条 wiki 页面里混进一句「ignore previous instructions」
   * 不代表这个页面没有事实价值，但也不能原样喂进去。
   */
  untrusted: z.boolean().optional(),
})

export const EvidenceTextItemSchema = EvidenceBaseSchema.extend({
  kind: z.literal('text'),
  excerpt: z.string().max(RESEARCH_LIMITS.excerptChars * 2),
})

/**
 * 🔬 **已结构化的标签**（切片 0 实测追加）。萌百 `prop=categories`、danbooru 共现
 * tag 本身就是标签，**不需要再过一次 LLM 提取** —— 长离的「粉发 · 挑染 · 金瞳 ·
 * 下双马尾」是分类名直出。少一次提取就少一处幻觉面，而幻觉恰恰发生在这道题上
 * （两臂都答错发色）。UI 渲染成 chip，不是引文段落。
 */
export const EvidenceTagsItemSchema = EvidenceBaseSchema.extend({
  kind: z.literal('tags'),
  tags: z.array(z.string().trim().min(1).max(120)).max(200),
  /** 标签的出处说明（如「萌百分类」「danbooru 100 张样本共现」）。 */
  provenance: z.string().trim().min(1).max(200),
})

/** 图片证据只存 URL（§3.1：用户挑中要用的才转存 R2）。 */
export const EvidenceImageItemSchema = EvidenceBaseSchema.extend({
  kind: z.literal('image'),
  imageUrl: z.string().trim().min(1).max(2000),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

export const EvidenceItemSchema = z.discriminatedUnion('kind', [
  EvidenceTextItemSchema,
  EvidenceTagsItemSchema,
  EvidenceImageItemSchema,
])

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>
export type EvidenceTextItem = z.infer<typeof EvidenceTextItemSchema>
export type EvidenceTagsItem = z.infer<typeof EvidenceTagsItemSchema>
export type EvidenceImageItem = z.infer<typeof EvidenceImageItemSchema>

// ─── 源级回执 ───────────────────────────────────────────────────

/**
 * 每个源一条回执。**部分成功是常态，单源静默失败不允许**（§3.5）—— UI 下一批
 * 把它渲染成 chip（「萌百 ✓ · danbooru ✗ 超时 · 网搜 ✓」），所以现在就落库。
 */
export const ResearchSourceReceiptSchema = z.object({
  sourceId: ResearchSourceIdSchema,
  status: z.enum(RESEARCH_SOURCE_STATUS_VALUES),
  count: z.number().int().nonnegative(),
  tookMs: z.number().int().nonnegative(),
  error: z.string().max(400).optional(),
  /**
   * 走了退路的话如实标注。目前唯一的用例：B站搜索被 412 风控挡住后退到
   * Serper `site:bilibili.com`（`via:'serper-fallback'`）。
   */
  via: z.string().trim().min(1).max(60).optional(),
})

export type ResearchSourceReceipt = z.infer<typeof ResearchSourceReceiptSchema>

// ─── 结论 ───────────────────────────────────────────────────────

/**
 * §3.4 第 3 闸。
 *
 * 🔬 **带对冲的编造也不许**：实测答案先声明「我无法实时联网获取」，然后仍给出
 * 「大约 1,500 到 2,500 张」（真值 3,644）。所以具体的数字/日期/名称只能
 * `basis:'source'`（有 `evidenceRefs`）或 `basis:'unknown'`，不能是「我推断大约」。
 */
export const ResearchConclusionSchema = z.object({
  statement: z.string().trim().min(1).max(2000),
  basis: z.enum(RESEARCH_CONCLUSION_BASIS_VALUES),
  /** 指向证据包内的 1-based 序号，与正文里的 `[n]` 同一套编号。 */
  evidenceRefs: z.array(z.number().int().positive()).max(24).default([]),
})

export type ResearchConclusion = z.infer<typeof ResearchConclusionSchema>

// ─── 规划器产出 ─────────────────────────────────────────────────

export const ResearchQuerySchema = z.object({
  text: z.string().trim().min(1).max(RESEARCH_LIMITS.maxQueryLength),
  /** 这条查询喂给哪个源；不填 = 喂给源组里的所有源。 */
  sourceId: ResearchSourceIdSchema.optional(),
  lang: z.enum(['zh', 'en', 'ja']).optional(),
})

export type ResearchQuery = z.infer<typeof ResearchQuerySchema>

export const ResearchPlanSchema = z.object({
  shouldSearch: z.boolean(),
  sourceGroup: z.enum(RESEARCH_SOURCE_GROUP_VALUES),
  goal: z.enum(RESEARCH_GOAL_VALUES),
  queries: z.array(ResearchQuerySchema).max(RESEARCH_LIMITS.maxQueries),
  freshness: z.enum(RESEARCH_FRESHNESS_VALUES),
  /** 用户消息里出现的 URL —— 有 URL 就直接读，不再打搜索。 */
  urls: z.array(z.string().trim().min(1).max(2000)).max(3).default([]),
  /** 为什么这么定（进日志，便于事后归因规划错误）。 */
  reason: z.string().trim().max(300).optional(),
})

export type ResearchPlan = z.infer<typeof ResearchPlanSchema>

/**
 * 便宜 LLM 规划器的结构化输出契约 —— 比 `ResearchPlanSchema` 窄：
 * `urls` / `goal` 由确定性启发定，不交给模型。
 */
export const ResearchPlannerOutputSchema = z.object({
  shouldSearch: z.boolean(),
  sourceGroup: z.enum(RESEARCH_SOURCE_GROUP_VALUES),
  queries: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(RESEARCH_LIMITS.maxQueryLength),
        lang: z.enum(['zh', 'en', 'ja']).optional(),
      }),
    )
    .max(RESEARCH_LIMITS.maxQueries)
    .default([]),
  freshness: z.enum(RESEARCH_FRESHNESS_VALUES).optional(),
  reason: z.string().trim().max(300).optional(),
})

export type ResearchPlannerOutput = z.infer<typeof ResearchPlannerOutputSchema>

// ─── 证据包 / run ───────────────────────────────────────────────

export const ResearchRunStatusSchema = z.enum(RESEARCH_RUN_STATUS_VALUES)
export type { ResearchRunStatus } from '@/constants/research'

// §3.2 里那个「EvidenceBundle」在实现里就是 `ResearchOutcome`
// （`services/research/research-run.service.ts`）—— 它比 bundle 多一个渲染好的
// 证据块，而证据块是助手侧才需要的东西。**一个东西不起两个名字**：再定义一个
// 同形状的 `EvidenceBundle` 只会让下一个人问「这两个有什么区别」。

/**
 * 回执 —— 跟着助手响应一起下发给客户端的那一小块。
 *
 * ⚠ 证据本体**不**进这里，也不进 `AssistantConversation.messages`（§3.6 验收）：
 * 消息里只存 `researchRunId`，要看证据从 `ResearchRun` 水合。
 */
export const ResearchReceiptSchema = z.object({
  runId: z.string().trim().min(1).max(120).nullable(),
  grounded: z.boolean(),
  status: ResearchRunStatusSchema,
  perSource: z.array(ResearchSourceReceiptSchema).max(12),
  /** 实际用了哪几条查询（UI 下一批要在检索卡上显示）。 */
  queries: z.array(z.string().max(RESEARCH_LIMITS.maxQueryLength)).max(6),
  evidenceCount: z.number().int().nonnegative(),
})

export type ResearchReceipt = z.infer<typeof ResearchReceiptSchema>

// ─── 单次 run 的回看载荷（GET /api/research-run/[id]）────────────

/**
 * 一次检索的可回看形态。
 *
 * **为什么必须有这条**：会话消息里只存 `researchRunId`（证据本体不进 messages，
 * §3.6 验收），所以**历史消息没有回执** —— 刷新一次、切一次会话，回执卡和引用
 * 弹层的数据源就只剩这个按 id 的懒加载。
 *
 * ⚠ **`queries` 不在这里，因为它没落库**：`ResearchRun` 行只有用户的原问题
 * `query`，规划器产出的那 2–3 条查询只活在当轮回执里。与其在这里造一个
 * 空数组让 UI 以为「这轮没查询」，不如如实只给 `query` —— 展开态的查询清单
 * 因此只对当轮（有 live 回执）显示，历史消息显示原问题。
 */
export const ResearchRunDetailSchema = z.object({
  id: z.string().trim().min(1).max(120),
  status: ResearchRunStatusSchema,
  grounded: z.boolean(),
  goal: z.string(),
  /** 用户那一轮的原问题（不是规划器改写后的查询）。 */
  query: z.string(),
  perSource: z.array(ResearchSourceReceiptSchema),
  evidence: z.array(EvidenceItemSchema),
  model: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})

export type ResearchRunDetail = z.infer<typeof ResearchRunDetailSchema>
