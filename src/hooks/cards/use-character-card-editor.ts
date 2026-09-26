'use client'

import { useCallback, useState } from 'react'

import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import type {
  CharacterCardRecord,
  CharacterReferenceSlot,
  UpdateCharacterCardRequest,
} from '@/types'
import { uploadImageFileAPI } from '@/lib/api-client'

/**
 * 卡片页侧栏的**就地编辑**（施工第 4 片）：名字 · 一句外观 · 标签 · 参考图 · 设定。
 *
 * ⭐ 图片直接改参考槽（删一张 / 设为主图 / 加一张），服务端按不变量校验并反向写回
 *   旧图片列。新图先传进**素材库**（图都在素材库，owner 09-26），再挂到卡上。
 * ⚠ 设定是整体替换：没在这里编辑的格（口头禅、示例对白……）原样带回去，⛔ 不丢。
 */

export interface CharacterCardDraft {
  name: string
  description: string
  identity: string
  behavior: string
  speech: string
  backstory: string
  characterTags: string
  appearanceTags: string
  loraTrigger: string
  slots: CharacterReferenceSlot[]
}

const splitTags = (text: string): string[] =>
  text
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

export function draftFromCard(card: CharacterCardRecord): CharacterCardDraft {
  return {
    name: card.name,
    description: card.description ?? '',
    identity: card.persona?.identity ?? '',
    behavior: card.persona?.behavior ?? '',
    speech: card.persona?.speech ?? '',
    backstory: card.persona?.backstory ?? '',
    characterTags: card.cardTags.character.join(', '),
    appearanceTags: card.cardTags.appearance.join(', '),
    loraTrigger: card.cardTags.loraTrigger,
    slots: card.referenceSlots,
  }
}

/** 草稿 → 更新请求。只带编辑面上有的格；设定里没编辑的格原样带回。 */
export function updateFromDraft(
  card: CharacterCardRecord,
  draft: CharacterCardDraft,
): UpdateCharacterCardRequest {
  return {
    name: draft.name.trim() || card.name,
    description: draft.description.trim() || null,
    persona: {
      catchphrases: [],
      scenario: '',
      opening: '',
      examples: [],
      ...card.persona,
      identity: draft.identity.trim(),
      behavior: draft.behavior.trim(),
      speech: draft.speech.trim(),
      backstory: draft.backstory.trim(),
    },
    extensions: {
      [CARD_EXTENSIONS.KEYS.tags]: {
        character: splitTags(draft.characterTags),
        appearance: splitTags(draft.appearanceTags),
        loraTrigger: draft.loraTrigger.trim(),
      },
    },
    ...(draft.slots.length ? { referenceSlots: draft.slots } : {}),
  }
}

/** 换主图：被点的那一张变主图（主图必须是身份用途），其余取消主图。 */
export function makePrimary(
  slots: CharacterReferenceSlot[],
  id: string,
): CharacterReferenceSlot[] {
  const chosen = slots.find((slot) => slot.id === id)
  if (!chosen) return slots
  return [
    { ...chosen, isPrimary: true, role: 'identity' },
    ...slots
      .filter((slot) => slot.id !== id)
      .map((slot) => ({ ...slot, isPrimary: false })),
  ]
}

/** 移除一张：删的是主图，就让剩下的第一张身份图接任。至少留一张。 */
export function removeSlot(
  slots: CharacterReferenceSlot[],
  id: string,
): CharacterReferenceSlot[] {
  if (slots.length <= 1) return slots
  const rest = slots.filter((slot) => slot.id !== id)
  if (rest.some((slot) => slot.isPrimary)) return rest
  const heir = rest.find((slot) => slot.role === 'identity') ?? rest[0]!
  return makePrimary(rest, heir.id)
}

function nextSlotId(slots: CharacterReferenceSlot[]): string {
  const taken = new Set(slots.map((slot) => slot.id))
  for (let n = slots.length + 1; ; n += 1) {
    const id = `slot-${n}`
    if (!taken.has(id)) return id
  }
}

export function useCharacterCardEditor(card: CharacterCardRecord) {
  const [draft, setDraft] = useState<CharacterCardDraft>(() =>
    draftFromCard(card),
  )
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const patch = useCallback(
    (next: Partial<CharacterCardDraft>) =>
      setDraft((current) => ({ ...current, ...next })),
    [],
  )

  const addImage = useCallback(async (file: File) => {
    setIsUploading(true)
    setUploadError(null)
    const response = await uploadImageFileAPI(file)
    setIsUploading(false)
    const generation = response.data?.generation
    if (!response.success || !generation) {
      setUploadError(response.error ?? 'upload failed')
      return
    }
    setDraft((current) => ({
      ...current,
      slots: [
        ...current.slots,
        {
          id: nextSlotId(current.slots),
          role: 'identity',
          url: generation.url,
          isPrimary: current.slots.length === 0,
          origin: 'upload',
          generationId: generation.id,
        },
      ],
    }))
  }, [])

  return {
    draft,
    patch,
    addImage,
    isUploading,
    uploadError,
    reset: () => setDraft(draftFromCard(card)),
    setPrimary: (id: string) =>
      setDraft((current) => ({
        ...current,
        slots: makePrimary(current.slots, id),
      })),
    remove: (id: string) =>
      setDraft((current) => ({
        ...current,
        slots: removeSlot(current.slots, id),
      })),
  }
}
