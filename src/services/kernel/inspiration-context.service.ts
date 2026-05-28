import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

const INSPIRATION_CONTEXT_LIMIT = 3
const INSPIRATION_CONTEXT_QUERY_MAX = 200
const INSPIRATION_CONTEXT_PROMPT_MAX = 400

/**
 * Build a few-shot reference block from up to N curated prompts that
 * match the user's input. Designed to be appended to an enhance /
 * assistant system prompt so the LLM has concrete stylistic examples.
 *
 * Lives in L0 Shared Kernel because prompt-engineering services
 * (prompt-enhance, prompt-assistant) consume it; the inspiration
 * library itself remains an L1 content domain owned by Prompts.
 *
 * Returns an empty string when no matches exist or the lookup fails —
 * callers should treat the return value as an optional suffix and never
 * let an inspiration lookup failure break the main enhance flow.
 */
export async function buildInspirationContext(prompt: string): Promise<string> {
  const trimmed = prompt.trim()
  if (!trimmed) return ''

  try {
    const query = trimmed.slice(0, INSPIRATION_CONTEXT_QUERY_MAX)
    const inspirations = await db.inspirationPrompt.findMany({
      where: {
        isPublic: true,
        prompt: { contains: query, mode: 'insensitive' },
      },
      orderBy: { rank: 'asc' },
      take: INSPIRATION_CONTEXT_LIMIT,
    })

    if (inspirations.length === 0) return ''

    const examples = inspirations
      .map((insp, i) => {
        const category = insp.categories[0]
          ? ` (category: ${insp.categories[0]})`
          : ''
        const compact = insp.prompt.replace(/\s+/g, ' ').trim()
        const truncated =
          compact.length > INSPIRATION_CONTEXT_PROMPT_MAX
            ? `${compact.slice(0, INSPIRATION_CONTEXT_PROMPT_MAX).trimEnd()}...`
            : compact
        return `Example ${i + 1}${category}:\n${truncated}`
      })
      .join('\n\n')

    return `

# Reference Examples (from a curated prompt library)
These are high-quality prompts from the same visual domain. Use them as stylistic inspiration only — DO NOT copy them verbatim. Extract their techniques (composition, lighting language, material vocabulary) and apply those techniques to the user's actual subject.

${examples}`
  } catch (err) {
    logger.warn(
      'Failed to build inspiration context, falling back to base system prompt',
      { error: err instanceof Error ? err.message : String(err) },
    )
    return ''
  }
}
