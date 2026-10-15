/**
 * 回放基线的题目格式（附录M 五.6：每期做完跑一遍，修 A 不悄悄弄坏 B）。
 *
 * 一道题 = 一块起始画布 + 创作者这一句（带 `@` / 片子）+ 录好的模型回复（每次调用一条）
 * + 选定的助手路由 + 期望。跑的是真的 v3 环（见 `runner.ts`），只把网络那一圈换成录音。
 *
 * ⚠ 期望里的厂商 / 型号**照写**，⛔ 不从解析器抄：抄了就测不出「换了一家」。
 * ⚠ 期望里的卡一律按**名字**写（`哈利 · 黑袍`、`罗恩 · 黑袍 -> S01 礼堂门口 / reference`），
 *   句柄（`img-249e8b`）只出现在模型回复里 —— 那是模型真正看见、真正会写的东西。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { z } from 'zod'

import { ASSISTANT_PROVIDER_ORDER } from '@/constants/assistant'
import { ASSISTANT_V3_TOOLS } from '@/constants/assistant-v3'
import {
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_WEB_FIND_LIMITS,
} from '@/constants/assistant-operator'
import { NODE_SLOTS } from '@/constants/node-slots'
import { PromptAssistantResponseLanguageSchema } from '@/types'
import { AssistantWebFindSchema } from '@/types/assistant-web-finds'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url)

export const ReplayProviderSchema = z.enum(ASSISTANT_PROVIDER_ORDER)
export type ReplayProvider = z.infer<typeof ReplayProviderSchema>

/** 一块起始画布（`fixtures/boards/*.json`）：真的 v4 state，过真的 schema。 */
export const ReplayBoardSchema = z.object({
  projectId: z.string().min(1),
  /** 板上图 / 片子的地址都在这台假主机上，按扩展名现做字节（`fake-network.ts`）。 */
  assetHost: z.string().min(1),
  state: NodeWorkflowStateV4Schema,
})
export type ReplayBoard = z.infer<typeof ReplayBoardSchema>

/**
 * 选定的助手路由。`routeModel` 写进 persona（`auto` = 自动），`keys` 是这个人配了 key 的几家
 * （⭐ 有意多配几家当诱饵：只配一家的题测不出「花了别家的钱」）。
 * `expect: null` = 这一轮一次模型都不该碰（缺 key 那一类）。
 */
export const ReplayRouteSchema = z.object({
  routeModel: z.string().min(1),
  keys: z.array(ReplayProviderSchema),
  expect: z
    .object({ adapterType: ReplayProviderSchema, modelId: z.string().min(1) })
    .nullable(),
})
export type ReplayRoute = z.infer<typeof ReplayRouteSchema>

/** 模型的一次回复：一段话 + 几个工具调用（入参照模型的原样写，句柄而不是 id）。 */
export const ReplayReplySchema = z.object({
  text: z.string().default(''),
  calls: z
    .array(
      z.object({
        tool: z.enum(ASSISTANT_V3_TOOLS),
        input: z.record(z.string(), z.unknown()),
      }),
    )
    .default([]),
})
export type ReplayReply = z.infer<typeof ReplayReplySchema>

/** 联网查的那一跳（厂商自带搜索）录下来的答复。 */
export const ReplaySearchSchema = z.object({
  text: z.string().min(1),
  queries: z.array(z.string()).default([]),
  sources: z
    .array(z.object({ url: z.string().url(), title: z.string().min(1) }))
    .default([]),
})
export type ReplaySearch = z.infer<typeof ReplaySearchSchema>

const ReplayTurnSchema = z.object({
  /** 创作者这一句。`@{名字}` = 从 `@` 菜单点选了板上那张卡（真的走 mention 管线）。 */
  say: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .default([]),
  responseLanguage: PromptAssistantResponseLanguageSchema.default('chinese'),
  /** 选中的卡（按名字）。 */
  selected: z.array(z.string()).default([]),
  /** 浏览器抽好的帧：`@` 到的视频卡各带一组（按片长走 `planClipFrames`）。 */
  clipSeconds: z.record(z.string(), z.number().positive()).default({}),
  searchWithGrok: z.boolean().optional(),
  /**
   * 上一轮找到的图与视频（`#n`）：开轮那一跳的请求带上（与前端同一条规矩，接力那几跳不带），
   * 服务端冻进板子 —— 模型读到那几行、号接着往下数，「用 #2」认得出是哪一张。
   */
  priorFinds: z
    .array(AssistantWebFindSchema)
    .max(ASSISTANT_WEB_FIND_LIMITS.maxCarried)
    .optional(),
})

/** 「名字 -> 名字 / 槽」——一条边。 */
const EdgeTextSchema = z
  .string()
  .regex(new RegExp(`^.+ -> .+ / (${NODE_SLOTS.join('|')})$`))

const ReplayBoardDiffSchema = z.object({
  edgesAdded: z.array(EdgeTextSchema).default([]),
  edgesRemoved: z.array(EdgeTextSchema).default([]),
  nodesAdded: z
    .array(
      z.object({ name: z.string(), data: z.record(z.string(), z.unknown()) }),
    )
    .default([]),
  nodesRemoved: z.array(z.string()).default([]),
  /** 改了哪几张卡的哪几格（只列改了的格：没列的格变了就算多改）。 */
  nodesChanged: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .default({}),
})
export type ReplayBoardDiff = z.infer<typeof ReplayBoardDiffSchema>

const TextExpectSchema = z.object({
  contains: z.array(z.string()).default([]),
  notContains: z.array(z.string()).default([]),
})

const ReplayExpectSchema = z.object({
  /** 这一轮怎么收的：`done`、`stopped` 的原因，或 `error`。 */
  end: z.union([
    z.literal('done'),
    z.literal('error'),
    z.enum([
      ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
      ASSISTANT_OPERATOR_STOP_REASONS.maxSteps,
    ]),
  ]),
  errorCode: z.string().optional(),
  missingKey: z
    .object({ adapterType: ReplayProviderSchema, modelId: z.string() })
    .optional(),
  /** 前端发了几次请求（画布接力一次算一次）。 */
  requests: z.number().int().min(1).default(1),
  /** 落到画布上的 op 种类，按顺序（整轮所有批次）。 */
  opKinds: z.array(z.string()).default([]),
  /** 起始画布 → 收尾画布的完整差异：⭐ 「其他不动」靠它。 */
  board: ReplayBoardDiffSchema.default({
    edgesAdded: [],
    edgesRemoved: [],
    nodesAdded: [],
    nodesRemoved: [],
    nodesChanged: {},
  }),
  /** 问题卡：`null` = 不许出。 */
  ask: z
    .object({
      questions: z.number().int().min(1),
      contains: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  /** 生成确认卡：`null` = 不许出。列的是卡名，按卡上的顺序。 */
  confirm: z
    .object({ kind: z.string(), cards: z.array(z.string()).min(1) })
    .nullable()
    .default(null),
  answer: TextExpectSchema.default({ contains: [], notContains: [] }),
  /** 每一次主步调用里摆在模型眼前的图 / 片子张数（按调用顺序）。缺席 = 不查。 */
  stepImages: z.array(z.number().int().min(0)).optional(),
  stepVideos: z.array(z.number().int().min(0)).optional(),
  /**
   * 每一次主步调用**发出去的请求体**里有 / 没有哪几段字（按调用顺序，可以只写前几步）。
   * 搜索期第三片：查证的整段摘录只该出现在紧跟着查证的那一步，之后只剩短版。缺席 = 不查。
   */
  stepPrompts: z.array(TextExpectSchema).optional(),
  /** 联网查了几次（厂商自带搜索那一跳）。 */
  searches: z.number().int().min(0).default(0),
})
export type ReplayExpect = z.infer<typeof ReplayExpectSchema>

export const ReplayCaseSchema = z.object({
  /** 回放题号（`T11`）或补的题（`K01` 缺 key、`V01` 看片、`R01` 查证）。 */
  id: z.string().regex(/^[A-Z]\d{2}[a-z]?$/),
  title: z.string().min(1),
  /** 出处：25 题表、某次真机、owner 的话。 */
  source: z.string().min(1),
  board: z.string().min(1),
  routes: z.array(ReplayRouteSchema).min(1),
  turn: ReplayTurnSchema,
  /** 主步（工具环）每次调用的回复，按顺序；⚠ 一条都不许剩、也不许不够。 */
  replies: z.array(ReplayReplySchema).default([]),
  /** 结账等辅助文本调用的回复；缺了就答一份空的结论草稿。 */
  textReplies: z.array(z.string()).default([]),
  search: z.array(ReplaySearchSchema).default([]),
  expect: ReplayExpectSchema,
  /**
   * 回放揭出来的真 bug：用例照留、标成「已知失败」（`it.fails`），修好那天它会变红提醒删掉这一格。
   * ⛔ 不拿它藏题目写错。
   */
  knownBug: z
    .object({ summary: z.string().min(1), evidence: z.string().min(1) })
    .optional(),
})
export type ReplayCase = z.infer<typeof ReplayCaseSchema>

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, FIXTURES_DIR), 'utf8'))
}

const boards = new Map<string, ReplayBoard>()

export function loadReplayBoard(name: string): ReplayBoard {
  const cached = boards.get(name)
  if (cached) return cached
  const board = ReplayBoardSchema.parse(readJson(`boards/${name}.json`))
  boards.set(name, board)
  return board
}

/** 全部题目，按题号排。题目文件写错（schema 不过）就在这里炸 —— 比跑到一半才错好认。 */
export function loadReplayCases(): ReplayCase[] {
  const files = readdirSync(new URL('cases/', FIXTURES_DIR)).filter((file) =>
    file.endsWith('.json'),
  )
  return files
    .map((file) => {
      const parsed = ReplayCaseSchema.safeParse(readJson(`cases/${file}`))
      if (!parsed.success)
        throw new Error(
          `replay fixture ${file}: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
        )
      if (file !== `${parsed.data.id}.json`)
        throw new Error(
          `replay fixture ${file}: id ${parsed.data.id} ≠ file name`,
        )
      return parsed.data
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}
