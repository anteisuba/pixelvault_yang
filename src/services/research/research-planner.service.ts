import 'server-only'

import {
  RESEARCH_LIMITS,
  RESEARCH_SOURCE_GROUP_VALUES,
} from '@/constants/research'
import { SCRIPT_PLANNER_PROVIDER_IDS } from '@/constants/script-breakdown'
import { logger } from '@/lib/logger'
import { validateLlmStructuredOutput } from '@/lib/llm-output-validator'
import {
  resolveNodePlannerRoute,
  type NodePlannerRoute,
} from '@/services/kernel/node-planner-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import {
  ResearchPlannerOutputSchema,
  type ResearchPlan,
} from '@/types/research'

/**
 * 便宜 LLM 规划器（§3.2 的第二步）。
 *
 * ⚠ **它的定位是「把查询磨快」，不是「当门卫」**：确定性启发已经决定了要不要搜
 * （见 `lib/research-intent.ts`），规划器负责它做不到的那部分 —— **按源选语言**
 * （萌百中文、danbooru/Fandom 英文）、收窄源组、拆成 2–3 条互补查询。
 *
 * ⚠ **任何一步不成就用启发式结果，绝不硬失败**：拿不到 planner 路由、超时、
 * 吐了非 JSON、schema 不过 —— 全都回落。一个加分项挂了不该让整条检索线挂。
 */

const PLANNER_SYSTEM_PROMPT = `You plan retrieval for a creative AI workbench. Output ONLY a JSON object, no prose and no code fences.

{
  "shouldSearch": boolean,
  "sourceGroup": ${RESEARCH_SOURCE_GROUP_VALUES.map((value) => `"${value}"`).join(' | ')},
  "queries": [{ "text": string, "lang": "zh" | "en" | "ja" }],
  "freshness": "none" | "day" | "week" | "month" | "year",
  "reason": string
}

RULES:
- At most ${RESEARCH_LIMITS.maxQueries} queries. Each must be a search phrase, never a sentence or a question.
- Pick the language per source, not per user: Chinese wikis (萌娘百科 / 维基百科) need Chinese terms; danbooru and Fandom need the English name. When the subject is an anime/game character, emit BOTH a Chinese query and an English one.
- "ip_character" for characters, franchises, official designs, appearance and lore. "ai_ecosystem" for models, LoRA, licences, providers. "general" otherwise.
- freshness other than "none" ONLY when the question is explicitly about what is newest/current/today.
- shouldSearch=false when the answer is stable, well-known ecosystem knowledge, or a pure writing request.`

function buildPlannerUserPrompt(text: string, heuristic: ResearchPlan): string {
  return [
    `USER MESSAGE:\n${text.slice(0, 2000)}`,
    `HEURISTIC BASELINE (already computed; improve it, do not contradict it without reason): ${JSON.stringify(
      {
        shouldSearch: heuristic.shouldSearch,
        sourceGroup: heuristic.sourceGroup,
        freshness: heuristic.freshness,
        queries: heuristic.queries.map((query) => query.text),
      },
    )}`,
  ].join('\n\n')
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fenced?.[1]?.trim() || trimmed
}

function parseJsonObject(raw: string): unknown {
  const candidate = stripJsonFence(raw)
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    const braced = candidate.match(/\{[\s\S]*\}/)
    if (!braced) return null
    try {
      return JSON.parse(braced[0]) as unknown
    } catch {
      return null
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function planResearchWithLlm(params: {
  userId: string
  apiKeyId?: string
  text: string
  heuristic: ResearchPlan
  forced: boolean
}): Promise<ResearchPlan> {
  const { heuristic } = params

  let route: NodePlannerRoute
  try {
    // 先试用户自己选的那把 key（省平台额度）；它不是 planner 能用的 provider
    // 就退到 auto 顺位。两条都不成就直接用启发式。
    route = await resolveNodePlannerRoute(
      params.userId,
      SCRIPT_PLANNER_PROVIDER_IDS.auto,
      params.apiKeyId,
    ).catch(() =>
      resolveNodePlannerRoute(params.userId, SCRIPT_PLANNER_PROVIDER_IDS.auto),
    )
  } catch (error) {
    logger.info('Research planner route unavailable, using heuristic plan', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return heuristic
  }

  let raw: string | null
  try {
    raw = await withTimeout(
      llmTextCompletion({
        systemPrompt: PLANNER_SYSTEM_PROMPT,
        userPrompt: buildPlannerUserPrompt(params.text, heuristic),
        modelId: route.modelId,
        adapterType: route.adapterType,
        providerConfig: route.providerConfig,
        apiKey: route.apiKey,
        maxTokens: RESEARCH_LIMITS.plannerMaxTokens,
        responseFormat: 'json_object',
        // 用户消息已经在助手主路过了一次 guard；这里只是拿它当规划素材，
        // 长度上限交给上面的 slice，不重复设一道会误杀长提示词的闸。
        promptGuardMaxLength: null,
      }),
      RESEARCH_LIMITS.plannerTimeoutMs,
    )
  } catch (error) {
    logger.info('Research planner call failed, using heuristic plan', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return heuristic
  }

  if (!raw) {
    logger.info('Research planner timed out, using heuristic plan')
    return heuristic
  }

  const validation = validateLlmStructuredOutput(
    parseJsonObject(raw),
    ResearchPlannerOutputSchema,
  )
  if (!validation.usable || !validation.data) {
    logger.info('Research planner output rejected, using heuristic plan', {
      reason: validation.reason,
    })
    return heuristic
  }

  const output = validation.data
  const queries = output.queries.length > 0 ? output.queries : heuristic.queries

  return {
    // 强制模式下用户已经说了「去联网」，规划器无权否决。
    shouldSearch: params.forced ? true : output.shouldSearch,
    sourceGroup: output.sourceGroup,
    // goal 与 urls 是确定性的，不交给模型 —— 模型编一个不存在的 URL 就是灾难。
    goal: heuristic.goal,
    urls: heuristic.urls,
    queries: queries.slice(0, RESEARCH_LIMITS.maxQueries),
    freshness: output.freshness ?? heuristic.freshness,
    reason: output.reason ?? heuristic.reason,
  }
}
