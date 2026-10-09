import {
  ASSISTANT_V3_CARDS_ITEM_IDS,
  ASSISTANT_V3_CARDS_PROFILE_PARTS as CARDS_PROFILE_PARTS,
} from '@/constants/assistant-v3'
import {
  buildAssistantV3Handles,
  type AssistantV3Handles,
} from '@/lib/assistant-v3-board'
import type {
  AssistantOperatorCardsSnapshot,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'

/**
 * v3 给模型看的角色页（S6 第三张脸）：角色名册 + 打开着的那一位的设定。
 *
 * ⭐ 角色用句柄（`char-b27ce8`）不用 id —— 同名的角色不止一位（三张 Denia）。
 * ⚠ 设定在板子上截短，全文用 `read`；打开那位的图跟着板子附上（`card-1` …）。
 */

const BOARD_FIELD_CHARS = 400

type OpenCharacter = NonNullable<AssistantOperatorCardsSnapshot['open']>

export function buildAssistantV3CardsHandles(
  snapshot: AssistantOperatorSnapshot,
): AssistantV3Handles {
  return buildAssistantV3Handles(
    (snapshot.cards?.characters ?? []).map((character) => character.id),
    ASSISTANT_V3_CARDS_ITEM_IDS.characterPrefix,
  )
}

function clip(text: string, limit: number | null): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (limit === null || flat.length <= limit) return flat
  return `${flat.slice(0, limit)}… (${flat.length} chars, read for all)`
}

function quote(text: string, limit: number | null): string {
  return text.trim() ? `"${clip(text, limit)}"` : '(empty)'
}

/** 打开那位附在板子上的图（按 `card-1` … 叫）。 */
export function openCharacterImages(
  open: OpenCharacter | null | undefined,
): string[] {
  if (!open) return []
  return open.cardImageUrls?.length
    ? open.cardImageUrls
    : open.primaryImageUrl
      ? [open.primaryImageUrl]
      : []
}

function openLines(
  open: OpenCharacter,
  handles: AssistantV3Handles,
  imageCount: number,
): string[] {
  return [
    `OPEN: ${handles.handleOf(open.id)} 「${open.name}」 · work ${open.work ?? '(not set)'} · ${open.imagesOnCard} picture(s) on the card${imageCount ? ` (attached below as card-1…card-${imageCount})` : ''}`,
    ...CARDS_PROFILE_PARTS.map(
      (part) => `  ${part}: ${quote(open[part], BOARD_FIELD_CHARS)}`,
    ),
    `  character tags: ${open.characterTags.join(', ') || '(none)'} · appearance tags: ${open.appearanceTags.join(', ') || '(none)'} · LoRA trigger: ${open.loraTrigger || '(none)'}`,
  ]
}

export function renderAssistantV3CardsBoard(input: {
  snapshot: AssistantOperatorSnapshot
  handles: AssistantV3Handles
  attachedNames: readonly string[]
  latestUserText: string
}): string {
  const cards = input.snapshot.cards
  const open = cards?.open ?? null
  const characters = cards?.characters ?? []
  return [
    "CHARACTER PAGE — the creator's characters. You never write to a card yourself: edit puts a proposal in front of the creator and they tick what goes in.",
    `Characters (${cards?.total ?? characters.length}):`,
    ...characters.map(
      (character) =>
        `- ${input.handles.handleOf(character.id)} 「${character.name}」 · ${character.work ?? 'no work set'} · ${character.imageCount} picture(s) · ${character.hasProfile ? 'has a profile' : 'no profile yet'}`,
    ),
    ...(open
      ? openLines(open, input.handles, openCharacterImages(open).length)
      : ['OPEN: nobody — the creator has not opened a character.']),
    ...(input.attachedNames.length
      ? [
          `Pictures attached to this message (attached below; use these names with look): ${input.attachedNames.map((name) => `"${name}"`).join(', ')}`,
        ]
      : []),
    '',
    `CREATOR SAID: ${input.latestUserText}`,
  ].join('\n')
}

/** `read` 一项（打开那位的设定全文）。对不上回 `null`；网址由调用方另读。 */
export function renderAssistantV3CardsItem(
  item: string,
  snapshot: AssistantOperatorSnapshot,
): string | null {
  const open = snapshot.cards?.open
  if (!open) return null
  const key = item.trim().toLowerCase()
  const part = CARDS_PROFILE_PARTS.find((entry) => entry === key)
  if (part) return `${part} (full): ${quote(open[part], null)}`
  if (key === 'tags')
    return `character tags: ${open.characterTags.join(', ') || '(none)'}\nappearance tags: ${open.appearanceTags.join(', ') || '(none)'}\nLoRA trigger: ${open.loraTrigger || '(none)'}`
  return null
}
