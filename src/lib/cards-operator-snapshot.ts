import { ASSISTANT_OPERATOR_CARDS_LIMITS } from '@/constants/assistant-operator'
import type { CharacterCardRecord } from '@/types'
import type {
  AssistantOperatorCardsSnapshot,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'
import { characterImageCount, characterWork } from '@/lib/character-works'

/**
 * 卡片助手（第五张脸）的 `read_state` 快照 —— 角色页上**有谁**，以及**打开着的那一位**
 * 的整份设定。
 *
 * ⚠ 列表按张数排、封顶 `maxCharacters`（总数另给）；设定只给打开的那一位，每格按
 *   `maxFieldChars` 截断。⛔ 不给图的 URL（见 `AssistantOperatorCardsSnapshotSchema`）。
 * ⚠ 纯函数：宿主每次 `buildSnapshot()` 现调，读的是那一刻的角色列表。
 */

const clip = (text: string | null | undefined): string =>
  (text ?? '').trim().slice(0, ASSISTANT_OPERATOR_CARDS_LIMITS.maxFieldChars)

const tags = (list: readonly string[]): string[] =>
  list
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, ASSISTANT_OPERATOR_CARDS_LIMITS.maxTags)

function summarize(card: CharacterCardRecord, locale: string) {
  const persona = card.persona
  return {
    id: card.id,
    name: card.name,
    work: characterWork(card, locale).label,
    imageCount: characterImageCount(card),
    hasProfile: [
      persona?.identity,
      persona?.behavior,
      persona?.speech,
      persona?.backstory,
    ].some((field) => Boolean(field?.trim())),
  }
}

export function buildCardsOperatorSnapshot(
  cards: readonly CharacterCardRecord[],
  openId: string | null,
  locale: string,
): AssistantOperatorSnapshot {
  const summaries = cards
    .map((card) => summarize(card, locale))
    .sort((a, b) => b.imageCount - a.imageCount)
  const openCard = openId
    ? (cards.find((card) => card.id === openId) ?? null)
    : null

  const snapshot: AssistantOperatorCardsSnapshot = {
    total: cards.length,
    characters: summaries.slice(
      0,
      ASSISTANT_OPERATOR_CARDS_LIMITS.maxCharacters,
    ),
    open: openCard
      ? {
          ...summarize(openCard, locale),
          look: clip(openCard.description),
          identity: clip(openCard.persona?.identity),
          behavior: clip(openCard.persona?.behavior),
          speech: clip(openCard.persona?.speech),
          backstory: clip(openCard.persona?.backstory),
          characterTags: tags(openCard.cardTags.character),
          appearanceTags: tags(openCard.cardTags.appearance),
          loraTrigger: openCard.cardTags.loraTrigger.trim(),
          imagesOnCard: openCard.referenceSlots.length,
        }
      : null,
  }
  // 角色页上没有提示词框：`prompt` 恒空串（契约要求这一格在）。
  return { prompt: '', availableModels: [], cards: snapshot }
}
