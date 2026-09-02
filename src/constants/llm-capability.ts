import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export type LlmCapabilityScope = 'enhance' | 'planner' | 'assistant'

// Route tables allow multiple tiers per adapter since 2026-08-23; the first
// entry for an adapter is that adapter's default tier. Enhance is short-in/
// short-out high-frequency work, so the cheap tier leads.
export const LLM_ENHANCE_ROUTE_MODELS = [
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_LUNA,
    label: 'OpenAI GPT-5.6 Luna',
  },
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_TERRA,
    label: 'OpenAI GPT-5.6 Terra',
  },
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_SOL,
    label: 'OpenAI GPT-5.6 Sol',
  },
  {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH_LITE,
    label: 'Gemini 3.5 Flash Lite',
  },
  {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_7_FLASH,
    label: 'Gemini 3.7 Flash',
  },
  {
    adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
    modelId: LLM_TEXT_MODEL_IDS.QWEN_FLASH,
    label: 'Qwen Flash',
  },
  {
    adapterType: AI_ADAPTER_TYPES.XAI,
    modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_6,
    label: 'Grok 4.6',
  },
] as const

const ADAPTER_CAPABILITIES: Record<
  AI_ADAPTER_TYPES,
  ReadonlyArray<LlmCapabilityScope>
> = {
  [AI_ADAPTER_TYPES.OPENAI]: ['enhance', 'planner', 'assistant'],
  [AI_ADAPTER_TYPES.GEMINI]: ['enhance', 'planner', 'assistant'],
  // DeepSeek is text-only (no vision). It stays the strongest planner for
  // Chinese scriptwriting / shot breakdowns and now also serves the canvas
  // assistant, which is text-only today (node context + chat, no images).
  [AI_ADAPTER_TYPES.DEEPSEEK]: ['planner', 'assistant'],
  // DashScope (Qwen): cheap enhance + text planner. 2026-07-26: Qwen exits
  // the canvas assistant route (owner decree) — Claude takes its slot there.
  // enhance/planner stay untouched.
  [AI_ADAPTER_TYPES.DASHSCOPE]: ['enhance', 'planner'],
  // Claude (Anthropic): canvas-assistant structural reasoning only (multi-
  // scene continuity, character arcs, shot planning — the assistant's own
  // job). No enhance (that line isn't short on adapters, don't expand it),
  // no planner (SCRIPT_PLANNER_MODELS intentionally stays untouched — see
  // docs/references/pages/assistant-shell.md note).
  [AI_ADAPTER_TYPES.ANTHROPIC]: ['assistant'],
  // xAI (Grok) 2026-08-23: grok-4.6 has vision, so unlike DeepSeek it is not
  // barred from enhance. No planner slot — that route's provider enum is
  // wired through three Zod schemas, and adding one there is its own change.
  [AI_ADAPTER_TYPES.XAI]: ['enhance', 'assistant'],
  [AI_ADAPTER_TYPES.VOLCENGINE]: [],
  [AI_ADAPTER_TYPES.BYTEPLUS]: [],
  // MiniMax has text models, but this route is video-only here — H3 is the
  // only reason the adapter exists.
  [AI_ADAPTER_TYPES.MINIMAX]: [],
  [AI_ADAPTER_TYPES.MINIMAX_CN]: [],
  [AI_ADAPTER_TYPES.HUGGINGFACE]: [],
  [AI_ADAPTER_TYPES.FAL]: [],
  [AI_ADAPTER_TYPES.RUNWAY]: [],
  [AI_ADAPTER_TYPES.REPLICATE]: [],
  [AI_ADAPTER_TYPES.NOVELAI]: [],
  [AI_ADAPTER_TYPES.FISH_AUDIO]: [],
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: [],
  [AI_ADAPTER_TYPES.RUNNER]: [],
  // ElevenLabs is TTS-only — no text/LLM capability.
  [AI_ADAPTER_TYPES.ELEVENLABS]: [],
}

export function getLLMCapabilityScope(
  scope: LlmCapabilityScope,
): AI_ADAPTER_TYPES[] {
  return (
    Object.entries(ADAPTER_CAPABILITIES) as Array<
      [AI_ADAPTER_TYPES, ReadonlyArray<LlmCapabilityScope>]
    >
  )
    .filter(([, caps]) => caps.includes(scope))
    .map(([adapter]) => adapter)
}

export function adapterHasCapability(
  adapter: AI_ADAPTER_TYPES,
  scope: LlmCapabilityScope,
): boolean {
  return ADAPTER_CAPABILITIES[adapter]?.includes(scope) ?? false
}

// ─── 工具调用模式（原生快路 vs JSON 慢路）───────────────────────

/**
 * 一家 provider 怎么让模型选工具。
 *
 * - `native` —— provider 有原生 function calling：工具表进**请求体**，模型回一条
 *   结构化的 tool call。参数形状由 provider 侧约束，不再靠模型自己拼 JSON。
 * - `json`   —— 没有（或本仓还没接）原生通道：工具表写进**提示词**，模型回一个
 *   JSON 对象，我们自己剥围栏、自己解。
 */
export const LLM_TOOL_CALLING_MODES = {
  native: 'native',
  json: 'json',
} as const

export type LlmToolCallingMode =
  (typeof LLM_TOOL_CALLING_MODES)[keyof typeof LLM_TOOL_CALLING_MODES]

/**
 * ⛔ **不许加 `default` / 索引签名 / `Partial`**：与 `LLM_TEXT_STREAMS` 那张表同
 * 一条理由 —— 接第 N 家 adapter 时漏填，`tsc` 当场报「Property '<家>' is missing」，
 * 而不是等生产上跑到一条没人想过的分支。
 *
 * ⚠ 非文本 adapter（fal / replicate / …）填 `json` **不是**在宣称它们有 JSON 工具
 * 环 —— 它们根本到不了这条路（`LLM_TEXT_ADAPTERS` 先把它们挡掉）。`json` 是这张表
 * 的保守缺省：**没证据说它有原生通道，就别替它宣称有。**
 */
export const LLM_TOOL_CALLING_MODE_BY_ADAPTER: Record<
  AI_ADAPTER_TYPES,
  LlmToolCallingMode
> = {
  // 原生：OpenAI `tools` + `tool_calls`，Gemini `function_declarations` +
  // `functionCall`。两家都只走缓冲路 —— 流式的原生工具解析是另一片。
  [AI_ADAPTER_TYPES.OPENAI]: LLM_TOOL_CALLING_MODES.native,
  [AI_ADAPTER_TYPES.GEMINI]: LLM_TOOL_CALLING_MODES.native,
  /**
   * Claude 有原生 tool use，但它要求调用方维护**真实的 messages 历史**：
   * assistant 那条 `tool_use` 块要原样回传，配对的 `tool_result` 才认。本仓的工具
   * 环每一步都是「重建一份用户提示再发一次」的无状态往返，接不上这套历史——
   * 所以 Claude 留在 JSON 路，原生那片单独做。
   * **不是「Claude 不支持」，是我们这条链还没长出历史。**
   */
  [AI_ADAPTER_TYPES.ANTHROPIC]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.DEEPSEEK]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.DASHSCOPE]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.XAI]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.VOLCENGINE]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.BYTEPLUS]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.MINIMAX]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.MINIMAX_CN]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.HUGGINGFACE]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.FAL]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.RUNWAY]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.REPLICATE]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.NOVELAI]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.FISH_AUDIO]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.RUNNER]: LLM_TOOL_CALLING_MODES.json,
  [AI_ADAPTER_TYPES.ELEVENLABS]: LLM_TOOL_CALLING_MODES.json,
}

export function getLlmToolCallingMode(
  adapter: AI_ADAPTER_TYPES,
): LlmToolCallingMode {
  return LLM_TOOL_CALLING_MODE_BY_ADAPTER[adapter]
}
