import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  NATIVE_SEARCH_FILTER_LIMITS,
  X_DOMAINS,
  X_VIDEO_WATCH_INTENT,
} from '@/constants/research'

/**
 * **自带联网的过滤参数**（2026-10-14）：来源名单 → 各家服务商的域名参数，以及
 * Grok X 搜索的收窄。纯函数，工具环判「这一家装得下吗」与 `llm-text` 拼请求读同一份。
 */

/**
 * 来源名单换成的服务商域名参数。⚠ 只给一种：Grok 不收「同时给」，GPT 只有白名单；
 * 白名单在场时只给白名单，黑名单里漏网的由结果过滤兜住。
 */
export interface LlmNativeSearchDomains {
  mode: 'allow' | 'block'
  domains: string[]
}

/** Grok X 搜索的收窄：账号不带 `@`；日期 `YYYY-MM-DD`，`toDate` 那天本身不含。 */
export interface LlmNativeXSearch {
  handles: string[]
  fromDate?: string
  toDate?: string
}

/** 这一家自带联网的域名参数装得下几个（0 = 没有这种参数）。 */
function nativeSearchDomainLimit(
  adapterType: AI_ADAPTER_TYPES,
  mode: LlmNativeSearchDomains['mode'],
): number {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return NATIVE_SEARCH_FILTER_LIMITS.anthropicDomains
    case AI_ADAPTER_TYPES.OPENAI:
      return mode === 'allow'
        ? NATIVE_SEARCH_FILTER_LIMITS.openAiAllowedDomains
        : 0
    case AI_ADAPTER_TYPES.XAI:
      return NATIVE_SEARCH_FILTER_LIMITS.xaiDomains
    default:
      // Gemini 的 API 没有域名参数；DeepSeek 兼容层没写支持。
      return 0
  }
}

/**
 * 来源名单里的域名 → 这一家自带联网的域名参数。
 * `null` = 这一家装不下（没有这种参数或超了上限），调用方照旧走我们的管线；
 * 回来的对象里没有 `domains` = 名单里没有要管的域名。
 */
export function planNativeSearchDomains(
  adapterType: AI_ADAPTER_TYPES,
  rules: { allow: readonly string[]; block: readonly string[] },
): { domains?: LlmNativeSearchDomains } | null {
  const mode =
    rules.allow.length > 0 ? 'allow' : rules.block.length > 0 ? 'block' : null
  if (!mode) return {}
  const domains = [...(mode === 'allow' ? rules.allow : rules.block)]
  if (domains.length > nativeSearchDomainLimit(adapterType, mode)) return null
  return { domains: { mode, domains } }
}

/**
 * 创作者这一句是不是**明说要看 X 上的视频**（owner 2026-10-15「看看视频」）。是 → Grok 的 X
 * 搜索这一次开 `enable_video_understanding`；否 → 只看封面。
 * ⚠ 只读创作者自己说的话，⛔ 不读模型写的查证目标：花不花看视频的钱由创作者开口定。
 * ⚠ 否定在前（「不用看视频」「don't watch the video」）不算。
 */
export function creatorAsksToWatchXVideos(text: string): boolean {
  if (!text) return false
  if (X_VIDEO_WATCH_INTENT.negation.some((pattern) => pattern.test(text)))
    return false
  return X_VIDEO_WATCH_INTENT.ask.some((pattern) => pattern.test(text))
}

/** 名单把 X 挡掉了吗：白名单里没有 X，或黑名单里有 X。 */
export function nativeSearchRulesOutX(
  domains: LlmNativeSearchDomains | undefined,
): boolean {
  if (!domains) return false
  const namesX = domains.domains.some((domain) =>
    X_DOMAINS.some((x) => x === domain),
  )
  return domains.mode === 'allow' ? !namesX : namesX
}
