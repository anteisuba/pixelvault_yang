import {
  ASSISTANT_OPERATOR_CANVAS_LIMITS,
  ASSISTANT_OPERATOR_CARDS_LIMITS,
} from '@/constants/assistant-operator'
import type { CharacterCardRecord } from '@/types'
import type {
  AssistantOperatorCanvasSnapshot,
  AssistantOperatorCardsSnapshot,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'
import { characterCoverUrl, defaultLook } from '@/lib/card-bus'
import { characterImageCount, characterWork } from '@/lib/character-works'
import { examplesToTavernText } from '@/hooks/cards/use-character-card-editor'

/**
 * 卡片助手（第五张脸）的 `read_state` 快照 —— 角色页上**有谁**，以及**打开着的那一位**
 * 的整份设定。
 *
 * ⚠ 列表按张数排、封顶 `maxCharacters`（总数另给）；设定只给打开的那一位，每格按
 *   `maxFieldChars` 截断。⛔ 不给模型图的 URL（见 `AssistantOperatorCardsSnapshotSchema`）；
 *   打开那一位的主图地址只给服务端看图用（C3），不进模型读的状态。
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
  const openImage = openCard ? characterCoverUrl(openCard) : null
  // 卡片助手看的是默认造型（角色④）；其他造型只报名字。
  const openLook = openCard ? defaultLook(openCard) : null

  const snapshot: AssistantOperatorCardsSnapshot = {
    total: cards.length,
    characters: summaries.slice(
      0,
      ASSISTANT_OPERATOR_CARDS_LIMITS.maxCharacters,
    ),
    open:
      openCard && openLook
        ? {
            ...summarize(openCard, locale),
            look: clip(openLook.description),
            identity: clip(openCard.persona?.identity),
            behavior: clip(openCard.persona?.behavior),
            speech: clip(openCard.persona?.speech),
            backstory: clip(openCard.persona?.backstory),
            boundaries: clip(openCard.persona?.boundaries),
            catchphrases: clip(openCard.persona?.catchphrases.join('\n')),
            scenario: clip(openCard.persona?.scenario),
            opening: clip(openCard.persona?.opening),
            examples: clip(
              examplesToTavernText(openCard.persona?.examples ?? []),
            ),
            tags: tags(openLook.tags),
            otherLooks: openCard.looks
              .filter((look) => !look.isDefault && look.label)
              .map((look) => look.label!)
              .slice(0, ASSISTANT_OPERATOR_CARDS_LIMITS.maxTags),
            imagesOnCard: openLook.referenceSlots.length,
            // 只给服务端看图用（C3），⛔ 服务端不把它写进模型读的状态。
            ...(openImage ? { primaryImageUrl: openImage } : {}),
            // 默认造型的图（主图在前），同样只给服务端看图用（S14 对一下设定和外观）。
            ...(openLook.referenceSlots.length
              ? {
                  cardImageUrls: [
                    ...openLook.referenceSlots.filter((slot) => slot.isPrimary),
                    ...openLook.referenceSlots.filter(
                      (slot) => !slot.isPrimary,
                    ),
                  ]
                    .map((slot) => slot.url)
                    .slice(
                      0,
                      ASSISTANT_OPERATOR_CARDS_LIMITS.maxLookCheckImages,
                    ),
                }
              : {}),
          }
        : null,
  }
  // 角色页上没有提示词框：`prompt` 恒空串（契约要求这一格在）。
  return { prompt: '', availableModels: [], cards: snapshot }
}

/**
 * 画布快照里的角色库（画布用角色 ④ 第 3 片）：画布助手写剧本 / 台词时 `@` 谁、用谁的
 * 口吻。放在这块画布上的几位排最前、带设定（封顶 `maxCastProfiles`）；其余按张数排、
 * 只给名字。⛔ 不给 id 与图地址（见 `AssistantOperatorCanvasCharacterSchema`）。
 */
export function buildCanvasCharacters(
  cards: readonly CharacterCardRecord[],
  onCanvasIds: ReadonlySet<string>,
  locale: string,
): NonNullable<AssistantOperatorCanvasSnapshot['characters']> {
  const ranked = [...cards].sort(
    (a, b) =>
      Number(onCanvasIds.has(b.id)) - Number(onCanvasIds.has(a.id)) ||
      characterImageCount(b) - characterImageCount(a),
  )
  let profiles = 0
  return {
    total: cards.length,
    list: ranked
      .slice(0, ASSISTANT_OPERATOR_CANVAS_LIMITS.maxCharacters)
      .map((card) => {
        const summary = summarize(card, locale)
        const onCanvas = onCanvasIds.has(card.id)
        const withProfile =
          onCanvas &&
          profiles < ASSISTANT_OPERATOR_CANVAS_LIMITS.maxCastProfiles
        if (withProfile) profiles += 1
        return {
          name: summary.name,
          work: summary.work,
          imageCount: summary.imageCount,
          onCanvas,
          ...(withProfile
            ? {
                profile: {
                  look: clip(defaultLook(card).description),
                  identity: clip(card.persona?.identity),
                  behavior: clip(card.persona?.behavior),
                  speech: clip(card.persona?.speech),
                  backstory: clip(card.persona?.backstory),
                },
              }
            : {}),
        }
      }),
  }
}
