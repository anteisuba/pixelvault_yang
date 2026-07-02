import type { CharacterCardRecord, SourceImageEntry } from '@/types'

export interface CharacterInjection {
  promptPrefix: string | null
  referenceImageUrl: string | null
  appliedCardIds: string[]
}

const VIEW_TYPE_PRIORITY: SourceImageEntry['viewType'][] = [
  'front',
  'three_quarter',
  'side',
  'detail',
  'back',
  'top',
  'other',
]

function pickReferenceImage(card: CharacterCardRecord): string | null {
  const entries = card.sourceImageEntries ?? []
  for (const viewType of VIEW_TYPE_PRIORITY) {
    const hit = entries.find((entry) => entry.viewType === viewType)
    if (hit) return hit.url
  }
  if (entries.length > 0) return entries[0].url
  return card.sourceImages[0] ?? null
}

function cardPromptBody(card: CharacterCardRecord): string | null {
  const compiled = card.characterPrompt?.trim()
  if (compiled) return compiled
  const fallback = card.description?.trim()
  return fallback || null
}

export function composeCharacterInjection(
  cards: CharacterCardRecord[],
): CharacterInjection {
  if (cards.length === 0) {
    return {
      promptPrefix: null,
      referenceImageUrl: null,
      appliedCardIds: [],
    }
  }

  const bodies = cards.map((card) => ({ card, body: cardPromptBody(card) }))
  const withBody = bodies.filter(
    (b): b is { card: CharacterCardRecord; body: string } => b.body !== null,
  )

  const promptPrefix =
    withBody.length === 0
      ? null
      : withBody.length === 1
        ? `[Character: ${withBody[0].card.name}]\n${withBody[0].body}`
        : withBody
            .map(
              ({ card, body }, i) =>
                `[Character ${i + 1}: ${card.name}]\n${body}`,
            )
            .join('\n\n')

  const referenceImageUrl = pickReferenceImage(cards[0])

  return {
    promptPrefix,
    referenceImageUrl,
    appliedCardIds: cards.map((c) => c.id),
  }
}
