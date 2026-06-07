import { PROMPT_TAG_DEFINITIONS } from '@/constants/prompt-tags'
import type {
  PromptPolarity,
  PromptTagDefinition,
  PromptTagSearchResult,
} from '@/types/prompt-tags'

const DEFAULT_LIMIT = 40

const SOURCE_RANK: Record<PromptTagDefinition['source'], number> = {
  system: 80,
  lora_asset: 75,
  recent: 70,
  mined_prompt: 60,
  civitai: 50,
  danbooru: 45,
  user: 40,
}

export interface PromptTagSearchOptions {
  query: string
  polarity?: PromptPolarity | 'all'
  definitions?: readonly PromptTagDefinition[]
  selectedTagIds?: ReadonlySet<string>
  limit?: number
}

export function normalizePromptTagSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function scoreTag(
  tag: PromptTagDefinition,
  normalizedQuery: string,
): { score: number; matchedAlias?: string } {
  if (!normalizedQuery) {
    return {
      score: SOURCE_RANK[tag.source] + tag.orderGroup,
    }
  }

  const label = normalizePromptTagSearchText(tag.label)
  const promptText = normalizePromptTagSearchText(tag.promptText)
  const aliases = tag.aliases.map(normalizePromptTagSearchText)
  const category = normalizePromptTagSearchText(tag.category)

  let score = 0
  let matchedAlias: string | undefined

  if (label === normalizedQuery) score += 140
  else if (label.startsWith(normalizedQuery)) score += 110
  else if (label.includes(normalizedQuery)) score += 80

  if (promptText === normalizedQuery) score += 130
  else if (promptText.startsWith(normalizedQuery)) score += 100
  else if (promptText.includes(normalizedQuery)) score += 70

  for (const [index, alias] of aliases.entries()) {
    if (alias === normalizedQuery) {
      score += 115
      matchedAlias = tag.aliases[index]
      break
    }
    if (alias.startsWith(normalizedQuery)) {
      score += 90
      matchedAlias = tag.aliases[index]
      break
    }
    if (alias.includes(normalizedQuery)) {
      score += 55
      matchedAlias = tag.aliases[index]
      break
    }
  }

  if (category.includes(normalizedQuery)) score += 30
  if (score === 0) return { score: 0 }

  return {
    score: score + SOURCE_RANK[tag.source] + Math.min(tag.popularity ?? 0, 50),
    matchedAlias,
  }
}

export function searchPromptTags({
  query,
  polarity = 'positive',
  definitions = PROMPT_TAG_DEFINITIONS,
  selectedTagIds = new Set<string>(),
  limit = DEFAULT_LIMIT,
}: PromptTagSearchOptions): PromptTagSearchResult[] {
  const normalizedQuery = normalizePromptTagSearchText(query)
  const results: PromptTagSearchResult[] = []

  for (const tag of definitions) {
    if (polarity !== 'all' && tag.polarity !== polarity) continue
    const scored = scoreTag(tag, normalizedQuery)
    if (scored.score <= 0) continue
    results.push({
      tag,
      score: scored.score,
      matchedAlias: scored.matchedAlias,
      isSelected: selectedTagIds.has(tag.id),
    })
  }

  return results
    .sort((a, b) => {
      if (a.isSelected !== b.isSelected) return a.isSelected ? 1 : -1
      if (b.score !== a.score) return b.score - a.score
      if (a.tag.orderGroup !== b.tag.orderGroup) {
        return a.tag.orderGroup - b.tag.orderGroup
      }
      return a.tag.label.localeCompare(b.tag.label)
    })
    .slice(0, limit)
}

export function getPromptTagCategories(
  definitions: readonly PromptTagDefinition[] = PROMPT_TAG_DEFINITIONS,
  polarity: PromptPolarity = 'positive',
): string[] {
  return Array.from(
    new Set(
      definitions
        .filter((tag) => tag.source === 'system' && tag.polarity === polarity)
        .map((tag) => tag.category),
    ),
  ).sort((a, b) => a.localeCompare(b))
}
