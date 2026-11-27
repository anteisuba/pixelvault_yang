import { findLook, referenceUrlKey } from '@/lib/card-bus'
import {
  compileImageOutlet,
  toCardBusCharacter,
  type ImageOutletOptions,
} from '@/lib/card-bus-compile'
import type {
  CharacterCardRecord,
  CharacterImagePick,
  CharacterReferenceSlot,
} from '@/types'
import type { NovelAiPreciseReferenceKind } from '@/constants/novelai'

/**
 * 输入框里「角色带进来的图」的**预演**（11-17）：拿与服务端同一个编译器
 * （`compileImageOutlet`）在前端算一遍，界面上画的就是真会送的那几张 —— ⛔ 不另写一份
 * 「大概会送哪些」。
 *
 * ⚠ 「用她出的」那几张前端只知道生成 id：这里用占位 URL 排位（`generation:<id>`），
 *   缩略图由调用方按 id 取。同一张图既在卡上又被当生成挑的极端情况不去重（服务端会）。
 */

export interface StudioCharacterOutletImage {
  /** 挑的那一项（自动排的卡图是 `{ slotId }`）；移除时按它从挑选里拿掉。 */
  pick: CharacterImagePick
  /** 卡上的图是真 URL；用她出的是 `null`（调用方按 `pick.generationId` 取）。 */
  url: string | null
  isPrimary: boolean
  /** 走 NovelAI 精确参考时映射到的参考类型（角色 / 服装 / 画风）。 */
  preciseKind?: NovelAiPreciseReferenceKind
}

export interface StudioCharacterOutletEntry {
  card: CharacterCardRecord
  /** 这一次真会送出去的那几张（按送的顺序）。 */
  images: StudioCharacterOutletImage[]
  /** 她挑了图（`true`）还是卡片总线自动排（`false`）。 */
  picked: boolean
}

export interface StudioCharacterOutlet {
  entries: StudioCharacterOutletEntry[]
  /** 至少有一张卡图走 NovelAI 精确参考（价格提示要跟着变成「按 Anlas 计」）。 */
  novelAiPreciseReference: boolean
  /** 角色卡送进 NovelAI 精确参考的张数（每张 +5 Anlas）。 */
  novelAiPreciseReferenceCount: number
}

const GENERATION_URL_PREFIX = 'generation:'

function pickSlots(
  picks: readonly CharacterImagePick[] | undefined,
  cardSlots: readonly CharacterReferenceSlot[],
): CharacterReferenceSlot[] {
  if (!picks?.length) return []
  return picks.flatMap((pick): CharacterReferenceSlot[] => {
    if ('slotId' in pick) {
      const slot = cardSlots.find((item) => item.id === pick.slotId)
      return slot ? [slot] : []
    }
    return [
      {
        id: `${GENERATION_URL_PREFIX}${pick.generationId}`,
        role: 'identity',
        url: `${GENERATION_URL_PREFIX}${pick.generationId}`,
        isPrimary: false,
      },
    ]
  })
}

export function previewStudioCharacterOutlet(
  cards: readonly CharacterCardRecord[],
  selection: {
    imagePicks: Readonly<Record<string, readonly CharacterImagePick[]>>
    lookIds: Readonly<Record<string, string>>
  },
  options: Omit<ImageOutletOptions, 'hasNovelAiLayout'> & {
    hasNovelAiLayout?: boolean
  },
): StudioCharacterOutlet {
  const sources = cards.map((card) => {
    const look = findLook(card, selection.lookIds[card.id])
    const chosen = pickSlots(selection.imagePicks[card.id], look.referenceSlots)
    return {
      card,
      picked: chosen.length > 0,
      character: toCardBusCharacter({
        id: card.id,
        version: 1,
        handle: card.handle ?? card.name,
        name: card.name,
        lookId: look.id ?? null,
        description: look.description ?? null,
        tags: look.tags,
        extensions: null,
        slots: chosen.length ? chosen : look.referenceSlots,
        ...(chosen.length ? { keepOrder: true } : {}),
      }),
    }
  })
  const outlet = compileImageOutlet(
    sources.map((source) => source.character),
    { hasNovelAiLayout: false, ...options },
  )
  const preciseKindByUrl = new Map(
    outlet.novelAiPreciseReferences.map((ref) => [
      referenceUrlKey(ref.url),
      ref.kind,
    ]),
  )
  const sent = new Set(
    [
      ...outlet.referenceImages,
      ...outlet.novelAiPreciseReferences.map((ref) => ref.url),
    ].map(referenceUrlKey),
  )
  return {
    novelAiPreciseReference: outlet.novelAiPreciseReference,
    novelAiPreciseReferenceCount: outlet.novelAiPreciseReferences.length,
    entries: sources.map(({ card, character, picked }) => ({
      card,
      picked,
      images: character.slots
        .filter((slot) => sent.has(referenceUrlKey(slot.url)))
        .map((slot) => {
          const preciseKind = preciseKindByUrl.get(referenceUrlKey(slot.url))
          return slot.url.startsWith(GENERATION_URL_PREFIX)
            ? {
                pick: {
                  generationId: slot.url.slice(GENERATION_URL_PREFIX.length),
                },
                url: null,
                isPrimary: false,
                ...(preciseKind ? { preciseKind } : {}),
              }
            : {
                pick: { slotId: slot.id },
                url: slot.url,
                isPrimary: slot.isPrimary,
                ...(preciseKind ? { preciseKind } : {}),
              }
        }),
    })),
  }
}
