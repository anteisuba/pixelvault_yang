import 'server-only'

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { getSystemApiKey } from '@/lib/platform-keys'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
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
 * key first (honors the user's "prefer live web" intent), then the platform
 * Gemini key. Returns null when nothing can ground — the caller then degrades
 * to the model's own knowledge.
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

  const platformKey = getSystemApiKey(AI_ADAPTER_TYPES.GEMINI)
  if (platformKey) {
    return {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
      apiKey: platformKey,
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
