import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { resolveAssistantModelId } from '@/constants/node-studio'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'
import type { WebContext } from '@/services/web-research.service'

/**
 * Shared research-route resolution for assistant surfaces (node canvas
 * assistant, studio prompt assistant). Lives in L0 Shared Kernel so both
 * consumers use one policy instead of forking it.
 *
 * Only these adapters support web-search grounding in llmTextCompletion
 * (Gemini google_search / OpenAI web_search). DeepSeek/Qwen hard-throw on
 * `useGrounding`, so a research turn must borrow one of these to go live.
 */
export const GROUNDING_CAPABLE_ADAPTERS: AI_ADAPTER_TYPES[] = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
]

/**
 * Find any grounding-capable route for a research turn: a bound Gemini/OpenAI
 * key (honors the user's "prefer live web" intent). No platform fallback
 * (owner 2026-10-07). Returns null when nothing can ground — the caller then
 * degrades to the model's own knowledge.
 */
export async function findGroundingRoute(
  userId: string,
): Promise<ResolvedLlmTextRoute | null> {
  for (const adapterType of GROUNDING_CAPABLE_ADAPTERS) {
    const userKey = await findActiveKeyForAdapter(userId, adapterType)
    if (userKey) {
      return {
        adapterType: userKey.adapterType,
        providerConfig: userKey.providerConfig,
        apiKey: userKey.keyValue,
      }
    }
  }

  return null
}

/**
 * 自带联网借谁的 key（owner 2026-10-10：能用自带的用自带，不能用的才走管线）。
 * 助手所选模型自己没有自带联网（DeepSeek）时借创作者配了 key 的那一家。
 * ⭐ 顺序按 2026-10-10 八题对比：GPT 15/16、Gemini 14/16、Claude（修好后）随后。
 * 一把都没有回 `null`，调用方走我们自己的检索管线。
 */
const NATIVE_SEARCH_LENDERS: readonly AI_ADAPTER_TYPES[] = [
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.ANTHROPIC,
]

export async function findNativeSearchRoute(
  userId: string,
): Promise<{ route: ResolvedLlmTextRoute; modelId?: string } | null> {
  for (const adapterType of NATIVE_SEARCH_LENDERS) {
    const key = await findActiveKeyForAdapter(userId, adapterType)
    if (!key) continue
    const modelId = resolveAssistantModelId(key.adapterType)
    return {
      route: {
        adapterType: key.adapterType,
        providerConfig: key.providerConfig,
        apiKey: key.keyValue,
      },
      ...(modelId ? { modelId } : {}),
    }
  }
  return null
}

/**
 * Resolve the route for a reference-research turn. Hybrid policy:
 *  - selected route can ground (Gemini/OpenAI) → use it live.
 *  - selected route can't ground (DeepSeek/Qwen) or auto → borrow a
 *    grounding route for the live search if one exists.
 *  - nothing can ground → fall back to the resolved route with grounding off
 *    (the model answers from its own knowledge of the work).
 */
export async function resolveResearchRoute(
  userId: string,
  apiKeyId?: string,
): Promise<{ route: ResolvedLlmTextRoute; useGrounding: boolean }> {
  if (apiKeyId) {
    const selected = await resolveLlmTextRoute(userId, apiKeyId)
    if (GROUNDING_CAPABLE_ADAPTERS.includes(selected.adapterType)) {
      return { route: selected, useGrounding: true }
    }
    const grounding = await findGroundingRoute(userId)
    if (grounding) return { route: grounding, useGrounding: true }
    return { route: selected, useGrounding: false }
  }

  const grounding = await findGroundingRoute(userId)
  if (grounding) return { route: grounding, useGrounding: true }
  return { route: await resolveLlmTextRoute(userId), useGrounding: false }
}

/** Render a gathered WebContext into a prompt-injectable evidence block. */
export function formatWebContext(webContext: WebContext): string {
  const parts: string[] = []
  if (webContext.results.length > 0) {
    parts.push(
      `SEARCH RESULTS:\n${webContext.results
        .map((result, index) => {
          return `[${index + 1}] ${result.title}\n${result.url}\n${result.snippet}`
        })
        .join('\n\n')}`,
    )
  }
  if (webContext.pages.length > 0) {
    parts.push(
      `PAGE EXCERPTS:\n${webContext.pages
        .map((page) => `<<< ${page.url} >>>\n${page.content}`)
        .join('\n\n')}`,
    )
  }
  return parts.join('\n\n')
}
