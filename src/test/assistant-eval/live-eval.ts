/**
 * 助手实跑评测（总设计第八节）：拿真实过程记录当考题，用真模型重跑，量一份基线。
 *
 * ⭐ 和回放（`../assistant-replay`）的分工：回放用录好的模型回复，测「外壳有没有改坏」，
 *   免费、进 CI；这里打真模型，测「同一道题助手做得好不好」，要花钱，只在本地手动跑。
 * ⛔ 题目是创作者的真实对话：只从 `ASSISTANT_EVAL_DIR`（仓库外）读，结果也只写回那里。
 * ⭐ 每道题量两遍同一套指标：线上那一次（记录里的 transcript）和这次重跑，判分也各判一次，
 *   于是看得出重跑与线上差多少（评测本身靠不靠得住）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

import { ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS } from '@/constants/assistant-v3'
import {
  AssistantTurnRecordSchema,
  type AssistantTurnRecord,
} from '@/types/assistant-turn-record'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type {
  AssistantV3Transcript,
  AssistantV3TranscriptEntry,
} from '@/types/assistant-v3'

const ENTRY = ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS
type BoardEntry = Extract<
  AssistantV3TranscriptEntry,
  { type: typeof ENTRY.board }
>
const ANTHROPIC_HOST = 'api.anthropic.com'

/** 每百万 token 的美元价（Sonnet 5.5；缓存写按 1.25 倍）。只用来报花费，不进判分。 */
const PRICE_PER_MTOK = {
  input: 2,
  output: 10,
  cacheRead: 0.2,
  cacheWrite: 2.5,
} as const

export interface EvalCase {
  readonly id: string
  readonly category: string
  readonly domain: string
  readonly text: string
}

/** `whole`：整批（不分片），合报告用。 */
export function loadEvalCases(dir: string, whole = false): EvalCase[] {
  const all = JSON.parse(
    readFileSync(join(dir, 'cases.json'), 'utf8'),
  ) as EvalCase[]
  const only = process.env.ASSISTANT_EVAL_ONLY?.split(',').filter(Boolean)
  const picked = only ? all.filter((item) => only.includes(item.id)) : all
  // 分片：`ASSISTANT_EVAL_SHARD=2/4` 跑第 2 片（几个进程并行）。
  const shard = process.env.ASSISTANT_EVAL_SHARD?.match(/^(\d+)\/(\d+)$/)
  if (!shard || whole) return picked
  const index = Number(shard[1]) - 1
  const total = Number(shard[2])
  return picked.filter((_, position) => position % total === index)
}

export function loadTurnRecord(dir: string, id: string): AssistantTurnRecord {
  return AssistantTurnRecordSchema.parse(
    JSON.parse(readFileSync(join(dir, 'turns', `${id}.json`), 'utf8')),
  )
}

/** 线上那一行的创作者 id（取 key 用）。schema 不收这一列，这里直接读原文。 */
export function recordUserId(dir: string, id: string): string {
  const row = JSON.parse(
    readFileSync(join(dir, 'turns', `${id}.json`), 'utf8'),
  ) as { userId: string }
  return row.userId
}

/** 开轮那一跳的请求：记录里存的就是请求里回放要用的那几样。 */
export function requestFromRecord(
  record: AssistantTurnRecord,
): AssistantOperatorRequest {
  if (!record.snapshot) throw new Error('turn record has no snapshot')
  return {
    ...record.input,
    domain: record.domain,
    workspaceKey: record.workspaceKey,
    snapshot: record.snapshot,
  } as AssistantOperatorRequest
}

// ---------------------------------------------------------------- 花费

export interface TokenUsage {
  calls: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export function emptyUsage(): TokenUsage {
  return { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

export function usageCost(usage: TokenUsage): number {
  return (
    (usage.input * PRICE_PER_MTOK.input +
      usage.output * PRICE_PER_MTOK.output +
      usage.cacheRead * PRICE_PER_MTOK.cacheRead +
      usage.cacheWrite * PRICE_PER_MTOK.cacheWrite) /
    1_000_000
  )
}

interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

function addUsage(total: TokenUsage, usage: AnthropicUsage | undefined) {
  if (!usage) return
  total.input += usage.input_tokens ?? 0
  total.cacheRead += usage.cache_read_input_tokens ?? 0
  total.cacheWrite += usage.cache_creation_input_tokens ?? 0
}

/** 一次回复的用量：流式看 `message_start` + 最后一个 `message_delta`，非流式看 `usage`。 */
function readUsage(body: string, total: TokenUsage) {
  total.calls += 1
  if (!body.startsWith('event:') && !body.startsWith('data:')) {
    const json = JSON.parse(body) as { usage?: AnthropicUsage }
    addUsage(total, json.usage)
    total.output += json.usage?.output_tokens ?? 0
    return
  }
  let output = 0
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue
    const event = JSON.parse(line.slice(5)) as {
      type?: string
      message?: { usage?: AnthropicUsage }
      usage?: AnthropicUsage
    }
    if (event.type === 'message_start') addUsage(total, event.message?.usage)
    if (event.type === 'message_delta' && event.usage?.output_tokens)
      output = event.usage.output_tokens
  }
  total.output += output
}

/**
 * 真网络 + 记账：发往 Anthropic 的每一次回复都留一份副本读用量，别的地址原样放行。
 * `settle()` 等所有副本读完（流在路由那边读完之后才读得完）。
 */
export function createMeteredFetch(realFetch: typeof globalThis.fetch) {
  const usage = emptyUsage()
  const pending: Promise<void>[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const response = await realFetch(input, init)
    const href =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (new URL(href).host === ANTHROPIC_HOST && response.ok)
      pending.push(
        response
          .clone()
          .text()
          .then((body) => readUsage(body, usage))
          .catch(() => undefined),
      )
    return response
  }
  return {
    fetch,
    usage,
    settle: async () => {
      await Promise.all(pending.splice(0))
    },
  }
}

// ---------------------------------------------------------------- 自动指标

export interface TurnMetrics {
  /** 模型往返几次（transcript 里模型说话的条数）。 */
  modelSteps: number
  toolCalls: number
  toolErrors: number
  /** 带着错误结果的往返（下一步多半是在补救）。 */
  stepsWithError: number
  /** 改提示词：就地改（find/replace）几次、整段重写几次。 */
  promptEdits: number
  promptRewrites: number
  /** 整段重写时，原提示词里的标签留下了几成（0–1；没重写为 null）。 */
  rewriteKeptRatio: number | null
  generated: number
  asked: number
  toolsUsed: string[]
  errorSamples: string[]
  /**
   * 这一轮碰上回放缺的素材：按名字查库查不到、附图下载不下来。回放用的假库没有创作者的库，
   * 线上不会这样；报告里把编造另算一份「排除这些题」的。
   */
  missingAsset?: boolean
}

const MISSING_ASSET_MARKERS = [
  'not found. Use find',
  'none found',
  'Could not load',
] as const

function parseInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return (input ?? {}) as Record<string, unknown>
}

function tags(prompt: string): Set<string> {
  return new Set(
    prompt
      .split(/[,\n，]/)
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function measureTranscript(
  transcript: AssistantV3Transcript,
  priorPrompt: string,
): TurnMetrics {
  const metrics: TurnMetrics = {
    modelSteps: 0,
    toolCalls: 0,
    toolErrors: 0,
    stepsWithError: 0,
    promptEdits: 0,
    promptRewrites: 0,
    rewriteKeptRatio: null,
    generated: 0,
    asked: 0,
    toolsUsed: [],
    errorSamples: [],
    missingAsset: false,
  }
  const tools = new Set<string>()
  const errorCalls = new Set<string>()
  const callStep = new Map<string, number>()
  for (const entry of transcript) {
    if (
      entry.type === ENTRY.result &&
      MISSING_ASSET_MARKERS.some((marker) =>
        String(entry.output).includes(marker),
      )
    )
      metrics.missingAsset = true
    if (entry.type === ENTRY.result && entry.error) {
      metrics.toolErrors += 1
      errorCalls.add(entry.id)
      if (metrics.errorSamples.length < 5)
        metrics.errorSamples.push(
          `${entry.tool}: ${String(entry.output).slice(0, 200)}`,
        )
    }
    if (entry.type !== ENTRY.assistant) continue
    metrics.modelSteps += 1
    for (const call of entry.calls ?? []) {
      metrics.toolCalls += 1
      tools.add(call.tool)
      callStep.set(call.id, metrics.modelSteps)
      if (call.tool === 'generate') metrics.generated += 1
      if (call.tool === 'ask') metrics.asked += 1
      // 旧内核 write {writes:[{field}]}；新内核 edit {changes:[{op}]}。
      if (call.tool !== 'write' && call.tool !== 'edit') continue
      const input = parseInput(call.input)
      const writes = call.tool === 'write' ? input.writes : input.changes
      for (const write of Array.isArray(writes) ? writes : []) {
        const item = write as {
          field?: string
          op?: string
          mode?: string
          text?: string | null
        }
        if ((item.field ?? item.op) !== 'prompt') continue
        if (item.mode === 'edit') metrics.promptEdits += 1
        else {
          metrics.promptRewrites += 1
          const before = tags(priorPrompt)
          if (before.size > 0 && item.text) {
            const after = tags(item.text)
            const kept = [...before].filter((tag) => after.has(tag)).length
            metrics.rewriteKeptRatio = kept / before.size
          }
        }
      }
    }
  }
  metrics.stepsWithError = new Set(
    [...errorCalls].map((id) => callStep.get(id)),
  ).size
  metrics.toolsUsed = [...tools]
  return metrics
}

// ---------------------------------------------------------------- 判分

export interface JudgeVerdict {
  /** 0 没做到 · 1 做了一部分 · 2 做到了（含「该问就问」）。 */
  completed: 0 | 1 | 2
  /** 只改了该改的（不相干的没被动）；没改东西为 null。 */
  minimalChange: boolean | null
  /** 不必问却问了 / 不必停却停了。 */
  unnecessaryStop: boolean
  /** 编了不存在的东西（编号、标签、事实）。 */
  madeThingsUp: boolean
  /** 编的是哪一句（评委原话引出来；没编为 null）。 */
  madeUpWhat?: string | null
  /** 每次判的「编造」票（判两次，不一致再判第三次，取多数）。 */
  madeUpVotes?: boolean[]
  note: string
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…[cut]` : text
}

/**
 * 判分用的那一份：创作者这句、助手开轮时看到的台面、模型做了什么、最后说了什么。
 *
 * ⭐ 台面给助手真看到的那段文字（transcript 第一条 board），不给原始快照：快照多半超过
 *   4000 字，参数和 LoRA 权重在后半段，截短后评委看不到，助手照实说也会被判成编造。
 * ⭐ 附图另外作为图片给评委（助手开轮时也看得到它们）。
 */
export function describeRun(
  request: AssistantOperatorRequest,
  transcript: AssistantV3Transcript,
  finalText: string,
  end: string,
): { text: string; pictures: { url: string; label: string }[] } {
  // ⭐ 助手看得到整段对话：评委也给够（只给最后 6 条时，助手引用前面说过的话会被判编造）。
  const history = clip(
    request.messages
      .slice(-JUDGE_CLIP.historyMessages)
      .map(
        (message) =>
          `${message.role}: ${clip(String(message.content), JUDGE_CLIP.historyLine)}`,
      )
      .join('\n'),
    JUDGE_CLIP.history,
  )
  const board = transcript.find(
    (entry): entry is BoardEntry => entry.type === ENTRY.board,
  )
  const workbench = clip(
    board?.text || JSON.stringify(request.snapshot),
    JUDGE_CLIP.workbench,
  )
  const pictures = board?.images ?? []
  const actions = transcript
    .flatMap((entry) => {
      if (entry.type === ENTRY.assistant)
        return [
          ...(entry.text
            ? [`assistant says: ${clip(entry.text, JUDGE_CLIP.say)}`]
            : []),
          ...(entry.calls ?? []).map(
            (call) =>
              `call ${call.tool}(${clip(JSON.stringify(call.input), 700)})`,
          ),
        ]
      if (entry.type === ENTRY.result)
        return [
          `${entry.error ? 'ERROR ' : ''}result ${entry.tool}: ${clip(String(entry.output), JUDGE_CLIP.result)}`,
        ]
      return []
    })
    .join('\n')
  const text = [
    `## Conversation (the whole conversation the assistant had; the last user line is the request)\n${history}`,
    `## Workbench as the assistant saw it at the start of the turn (${request.domain})\n${workbench}`,
    `## What the assistant did\n${actions || '(no tool calls)'}`,
    `## Final reply\n${clip(finalText, 1500) || '(none)'}`,
    `## Turn ended with: ${end}`,
  ].join('\n\n')
  return {
    text,
    pictures: pictures.map((picture) => ({
      url: picture.url,
      label: picture.label,
    })),
  }
}

/** 给评委的材料各截多长（字）。 */
const JUDGE_CLIP = {
  workbench: 16_000,
  say: 1200,
  result: 1500,
  historyMessages: 50,
  historyLine: 800,
  history: 24_000,
} as const

const JUDGE_SYSTEM = `You grade one turn of an AI assistant inside an image-generation studio. The creator talks to the assistant; the assistant edits the workbench (prompt, model, parameters, LoRAs, references), looks things up, asks questions, or proposes a generation (a confirm card the creator clicks; that counts as doing the job when generating is what was asked).

Judge only against what the creator asked in their last message, read in the context of the conversation. Asking a question is correct when the request is genuinely ambiguous, and wrong when the answer was obvious from context.

Reply with one JSON object and nothing else:
{"completed": 0|1|2, "minimalChange": true|false|null, "unnecessaryStop": true|false, "madeThingsUp": true|false, "madeUpWhat": "<quote>"|null, "note": "<one short sentence in Chinese>"}
- completed: 2 = did what was asked (or asked a needed question), 1 = partly, 0 = no.
- minimalChange: when the request was a targeted change, did it keep everything else (style, tags, subject) intact? null if nothing was changed.
- unnecessaryStop: stopped or asked when it should have just done it.
- madeThingsUp: invented ids, tags, facts or results that are not in the material shown. The workbench text is exactly what the assistant saw; pictures shown to you were in front of the assistant too (unless a result says they could not load). General know-how given as advice ("this base model usually likes CFG 4–5") is not made up; stating something about THIS workbench, picture, search result or conversation that the material does not support is. The assistant also has a system prompt you do not see, describing how this studio works; a claim about the studio's own behaviour (what a field does, what gets sent to a model) is made up only if the material contradicts it.
- madeUpWhat: when madeThingsUp is true, quote the invented claim (a few words). null otherwise.`

export async function judgeTurn(options: {
  apiKey: string
  fetch: typeof globalThis.fetch
  request: AssistantOperatorRequest
  transcript: AssistantV3Transcript
  finalText: string
  end: string
}): Promise<JudgeVerdict | { error: string }> {
  const anthropic = createAnthropic({
    apiKey: options.apiKey,
    baseURL: `https://${ANTHROPIC_HOST}/v1`,
    fetch: options.fetch,
  })
  const material = describeRun(
    options.request,
    options.transcript,
    options.finalText,
    options.end,
  )
  const once = async (withPictures: boolean): Promise<JudgeVerdict> => {
    const pictures = withPictures ? material.pictures : []
    const { text } = await generateText({
      model: anthropic('claude-sonnet-5-5'),
      system: JUDGE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: material.text },
            ...(pictures.length
              ? [
                  {
                    type: 'text' as const,
                    text: '## Pictures attached to the turn',
                  },
                  ...pictures.flatMap((picture) => [
                    {
                      type: 'text' as const,
                      text: `[picture: ${picture.label}]`,
                    },
                    { type: 'image' as const, image: new URL(picture.url) },
                  ]),
                ]
              : material.pictures.length
                ? [
                    {
                      type: 'text' as const,
                      text: `## Pictures attached to the turn (could not be shown to you: ${material.pictures.map((picture) => picture.label).join(', ')}) — do not count describing them as made up unless a result says they failed to load.`,
                    },
                  ]
                : []),
          ],
        },
      ],
      providerOptions: { anthropic: { effort: 'low' } },
    })
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    return JSON.parse(json) as JudgeVerdict
  }
  const judgeOnce = () => once(true).catch(() => once(false))
  try {
    // ⭐ 「编造」一次判分抖得厉害：判两次，不一致再判第三次，取多数；其余字段用第一次的。
    const first = await judgeOnce()
    const votes = [first.madeThingsUp, (await judgeOnce()).madeThingsUp]
    let madeUpWhat = first.madeThingsUp ? (first.madeUpWhat ?? null) : null
    if (votes[0] !== votes[1]) {
      const third = await judgeOnce()
      votes.push(third.madeThingsUp)
      if (!madeUpWhat && third.madeThingsUp)
        madeUpWhat = third.madeUpWhat ?? null
    }
    const madeThingsUp = votes.filter(Boolean).length * 2 > votes.length
    return {
      ...first,
      madeThingsUp,
      madeUpWhat: madeThingsUp ? madeUpWhat : null,
      madeUpVotes: votes,
    }
  } catch (error) {
    return { error: String(error).slice(0, 300) }
  }
}

// ---------------------------------------------------------------- 报告

export interface CaseResult {
  id: string
  category: string
  domain: string
  text: string
  production: {
    modelId: string
    outcome: string
    metrics: TurnMetrics
    judge: JudgeVerdict | { error: string }
  }
  rerun: {
    end: string
    hops: number
    seconds: number
    errorEvent: string | null
    finalText: string
    metrics: TurnMetrics
    judge: JudgeVerdict | { error: string }
    usage: TokenUsage
    cost: number
    /** 这次重跑的整轮记录（查原因用；结果目录在仓库外）。 */
    transcript?: AssistantV3Transcript
  }
}

export function runDir(dir: string): string {
  const label = process.env.ASSISTANT_EVAL_LABEL ?? 'v3-sonnet55'
  const out = join(dir, 'runs', label)
  mkdirSync(join(out, 'cases'), { recursive: true })
  return out
}

export function writeCaseResult(out: string, result: CaseResult) {
  writeFileSync(
    join(out, 'cases', `${result.id}.json`),
    JSON.stringify(result, null, 2),
  )
}

/** 读回这一批里已经跑完的题（各片各写各的，最后合成一份）。 */
export function readCaseResults(out: string, ids: string[]): CaseResult[] {
  return ids.flatMap((id) => {
    const file = join(out, 'cases', `${id}.json`)
    return existsSync(file)
      ? [JSON.parse(readFileSync(file, 'utf8')) as CaseResult]
      : []
  })
}

function rate(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : '—'
}

function summarize(
  rows: { metrics: TurnMetrics; judge: JudgeVerdict | { error: string } }[],
) {
  const judged = rows.flatMap((row) =>
    'error' in row.judge ? [] : [row.judge],
  )
  const sum = (pick: (metrics: TurnMetrics) => number) =>
    rows.reduce((total, row) => total + pick(row.metrics), 0)
  const calls = sum((m) => m.toolCalls)
  const rewrites = sum((m) => m.promptRewrites)
  const edits = sum((m) => m.promptEdits)
  const kept = rows.flatMap((row) =>
    row.metrics.rewriteKeptRatio === null ? [] : [row.metrics.rewriteKeptRatio],
  )
  return {
    完成: rate(judged.filter((j) => j.completed === 2).length, judged.length),
    部分: rate(judged.filter((j) => j.completed === 1).length, judged.length),
    只改该改的: rate(
      judged.filter((j) => j.minimalChange === true).length,
      judged.filter((j) => j.minimalChange !== null).length,
    ),
    多余停顿: rate(
      judged.filter((j) => j.unnecessaryStop).length,
      judged.length,
    ),
    编造: rate(judged.filter((j) => j.madeThingsUp).length, judged.length),
    '编造（排除缺素材题）': (() => {
      const clean = rows.filter(
        (row) => !('error' in row.judge) && !row.metrics.missingAsset,
      )
      return `${rate(
        clean.filter(
          (row) => 'madeThingsUp' in row.judge && row.judge.madeThingsUp,
        ).length,
        clean.length,
      )}（${clean.length} 题）`
    })(),
    工具错误率: rate(
      sum((m) => m.toolErrors),
      calls,
    ),
    每轮往返: (sum((m) => m.modelSteps) / (rows.length || 1)).toFixed(1),
    补救往返占比: rate(
      sum((m) => m.stepsWithError),
      sum((m) => m.modelSteps),
    ),
    提示词整段重写占比: rate(rewrites, rewrites + edits),
    重写后标签保留: kept.length
      ? `${Math.round((kept.reduce((a, b) => a + b, 0) / kept.length) * 100)}%`
      : '—',
  }
}

export function writeReport(out: string, results: CaseResult[]) {
  const production = summarize(results.map((r) => r.production))
  const rerun = summarize(results.map((r) => r.rerun))
  const usage = results.reduce((total, r) => {
    for (const key of Object.keys(total) as (keyof TokenUsage)[])
      total[key] += r.rerun.usage[key]
    return total
  }, emptyUsage())
  const seconds = results.map((r) => r.rerun.seconds).sort((a, b) => a - b)
  const median = seconds[Math.floor(seconds.length / 2)] ?? 0
  const byCategory = new Map<string, CaseResult[]>()
  for (const r of results)
    byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r])

  const lines = [
    `# 助手评测 · ${out.split('/').at(-1)}`,
    '',
    `${results.length} 道题。「线上」= 记录里那一次（当时选的模型），「重跑」= 这次用 Sonnet 5.5 在新内核上重跑。判分都由 Sonnet 5.5 做。`,
    '',
    '| 指标 | 线上 | 重跑 |',
    '|---|---|---|',
    ...Object.keys(rerun).map(
      (key) =>
        `| ${key} | ${production[key as keyof typeof production]} | ${rerun[key as keyof typeof rerun]} |`,
    ),
    '',
    `重跑花费：$${usageCost(usage).toFixed(2)}（含判分；${usage.calls} 次调用，输入 ${usage.input} / 缓存读 ${usage.cacheRead} / 缓存写 ${usage.cacheWrite} / 输出 ${usage.output} token）。每题时长中位数 ${median.toFixed(0)} 秒。`,
    '',
    '## 按类',
    '',
    '| 类 | 题数 | 线上完成 | 重跑完成 | 重跑工具错误率 |',
    '|---|---|---|---|---|',
    ...[...byCategory].map(([category, rows]) => {
      const p = summarize(rows.map((r) => r.production))
      const q = summarize(rows.map((r) => r.rerun))
      return `| ${category} | ${rows.length} | ${p.完成} | ${q.完成} | ${q.工具错误率} |`
    }),
    '',
    '## 逐题',
    '',
    '| 题 | 类 | 一句话 | 重跑结束 | 判分 | 备注 |',
    '|---|---|---|---|---|---|',
    ...results.map((r) => {
      const judge = r.rerun.judge
      const verdict = 'error' in judge ? '判分失败' : String(judge.completed)
      const note =
        'error' in judge
          ? judge.error
          : judge.madeUpWhat
            ? `${judge.note}【编造：${judge.madeUpWhat}】`
            : judge.note
      return `| ${r.id.slice(0, 8)} | ${r.category} | ${clip(r.text, 40).replace(/\|/g, '/')} | ${r.rerun.end} | ${verdict} | ${clip(note, 140).replace(/\|/g, '/')} |`
    }),
  ]
  writeFileSync(join(out, 'summary.md'), lines.join('\n'))
  writeFileSync(
    join(out, 'summary.json'),
    JSON.stringify(
      { production, rerun, usage, cost: usageCost(usage) },
      null,
      2,
    ),
  )
}
