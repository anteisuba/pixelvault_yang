import {
  CARD_EXTENSIONS,
  CHARACTER_CARD,
} from '@/constants/cards/character-card'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import type {
  CharacterCardRecord,
  CharacterReferenceSlot,
  GenerationRecord,
  UpdateCharacterCardRequest,
} from '@/types'

/**
 * 角色详情**点哪改哪**用的纯函数（owner 09-27 原型 B）：一格改完 → 以当前角色记录为底
 * 合进这一格（`draftFromCard` + 改动）→ `updateFromDraft` 出整份更新请求。
 *
 * ⭐ 图片直接改参考槽（换一张 / 删一张 / 设为主图 / 加几张），服务端按不变量校验并反向写回
 *   旧图片列。图一律从**素材库**来（owner 09-26：图都在素材库，卡跨文件夹挑图）；
 *   新上传走素材库选择器自己的上传格，⛔ 这里不另开上传。
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
  /** 作品手改值；空 = 从角色标签取。 */
  work: string
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
    work: card.workOverride ?? '',
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
      // 清空 = 删键（回到从标签取）。
      [CARD_EXTENSIONS.KEYS.work]:
        draft.work.trim().slice(0, CARD_EXTENSIONS.WORK_MAX_LENGTH) || null,
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

/** 素材库里的一张 → 槽里的图：记下来源（上传 / 生成）与生成 id。 */
function slotImage(generation: GenerationRecord) {
  return {
    url: generation.url,
    generationId: generation.id,
    origin:
      generation.provider === USER_UPLOAD_PROVIDER
        ? ('upload' as const)
        : ('generation' as const),
  }
}

/** 换一张：同一格换图，用途、主图与自定义标签不变；视角是旧图的，不带过去。 */
export function replaceSlotImage(
  slots: CharacterReferenceSlot[],
  id: string,
  generation: GenerationRecord,
): CharacterReferenceSlot[] {
  if (slots.some((slot) => slot.url === generation.url)) return slots
  return slots.map((slot) =>
    slot.id === id
      ? { ...slot, ...slotImage(generation), viewType: undefined }
      : slot,
  )
}

/** 加几张：已在卡上的图不重复挂，满了就停；卡上原来没图时第一张当主图。 */
export function appendSlotImages(
  slots: CharacterReferenceSlot[],
  generations: GenerationRecord[],
): CharacterReferenceSlot[] {
  const next = [...slots]
  for (const generation of generations) {
    if (next.length >= CHARACTER_CARD.MAX_REFERENCE_SLOTS) break
    if (next.some((slot) => slot.url === generation.url)) continue
    next.push({
      id: nextSlotId(next),
      role: 'identity',
      isPrimary: next.length === 0,
      ...slotImage(generation),
    })
  }
  return next
}

function nextSlotId(slots: CharacterReferenceSlot[]): string {
  const taken = new Set(slots.map((slot) => slot.id))
  for (let n = slots.length + 1; ; n += 1) {
    const id = `slot-${n}`
    if (!taken.has(id)) return id
  }
}
