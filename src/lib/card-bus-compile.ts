/**
 * 卡片总线的**编译层**（进度表 35 · 第 ⑤ 片）：一个中间形态，N 个出口。
 *
 * ⭐ 中间形态是「每个角色一组」：视觉文字 · 角色负面 · 排好序的参考槽。
 *   ⛔ 这一层不合并文本 —— 压平是各出口的事（图片在这里，视频是第 ⑦ 片）。
 * ⭐ 从库里读卡只有 `services/cards/card-bus.service.ts` 一处；本文件不碰库。
 * ⛔ `summary` · `tags` 不进任何出口（给人看的）。
 * 契约见 `docs/references/domains/cards.md`「编译层」。
 */

import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getNovelAiMaxCharacters,
  novelAiGridCellCenter,
  supportsNovelAiCharacters,
} from '@/constants/novelai'
import { referenceUrlKey } from '@/lib/card-bus'
import {
  CardTagsSchema,
  type CardTags,
  type CharacterReferenceSlot,
} from '@/types'
import type { NovelAiCharacterLayout } from '@/types/novelai'

// ─── 中间形态 ────────────────────────────────────────────────────

export interface CardBusCharacter {
  cardId: string
  /** 卡内容版本：进生成快照，指认出图用的是哪一版卡。 */
  version: number
  handle: string
  name: string
  /** 视觉文字：`characterPrompt` 在前、`description` 在后（只写视觉）。 */
  visual: string | null
  /** 角色硬否定（`extensions['pv.negative']`）。 */
  negative: string | null
  /** 标签（`extensions['pv.tags']`）：NovelAI 用它认人；LoRA 触发词只在挂了 LoRA 时写进去。 */
  tags: CardTags
  /**
   * 主图在最前，其次其余身份槽，再其次别的用途，同档保持卡上的顺序。
   * ⚠ 同一张图（路径相同、域名不同）只留排在前面的那个。
   */
  slots: CharacterReferenceSlot[]
}

export interface CardBusCharacterSource {
  id: string
  version: number
  handle: string
  name: string
  characterPrompt: string | null
  description: string | null
  extensions: unknown
  slots: readonly CharacterReferenceSlot[]
  /** 用户亲手挑的图：按挑的顺序送，⛔ 不再按主图 / 身份重排。 */
  keepOrder?: boolean
}

const EMPTY_TAGS: CardTags = { character: [], appearance: [], loraTrigger: '' }

function readExtension(extensions: unknown, key: string): unknown {
  if (!extensions || typeof extensions !== 'object') return undefined
  return (extensions as Record<string, unknown>)[key]
}

function readNegative(extensions: unknown): string | null {
  const value = readExtension(extensions, CARD_EXTENSIONS.KEYS.negative)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** 坏的标签当缺席（契约：已知键逐键解析，坏键编译时当缺席，磁盘上保留）。 */
function readTags(extensions: unknown): CardTags {
  const parsed = CardTagsSchema.safeParse(
    readExtension(extensions, CARD_EXTENSIONS.KEYS.tags),
  )
  return parsed.success ? parsed.data : EMPTY_TAGS
}

function slotRank(slot: CharacterReferenceSlot): number {
  if (slot.isPrimary) return 0
  return slot.role === 'identity' ? 1 : 2
}

export function toCardBusCharacter(
  source: CardBusCharacterSource,
): CardBusCharacter {
  const prompt = source.characterPrompt?.trim() || ''
  const description = source.description?.trim() || ''
  const visual =
    [prompt, description && description !== prompt ? description : '']
      .filter(Boolean)
      .join('\n') || null
  return {
    cardId: source.id,
    version: source.version,
    handle: source.handle,
    name: source.name,
    visual,
    negative: readNegative(source.extensions),
    tags: readTags(source.extensions),
    slots: source.slots
      .map((slot, index) => ({ slot, index }))
      .sort((a, b) =>
        source.keepOrder
          ? a.index - b.index
          : slotRank(a.slot) - slotRank(b.slot) || a.index - b.index,
      )
      .map(({ slot }) => slot)
      .filter((slot, index, sorted) => {
        const key = referenceUrlKey(slot.url)
        return (
          sorted.findIndex((other) => referenceUrlKey(other.url) === key) ===
          index
        )
      }),
  }
}

// ─── 图片出口 ────────────────────────────────────────────────────

export interface ImageOutletOptions {
  adapterType: string
  modelId: string
  /** 这个模型最多收几张参考图（含用户自己挂的）。 */
  maxReferenceImages: number
  /** 用户自己挂的参考图张数 —— 它们排在前面，`@图N` 的下标不能被卡图挤动。 */
  userReferenceCount: number
  /** 用户已经手摆了 NovelAI 多角色，就不替他排。 */
  hasNovelAiLayout: boolean
  /** 这次挂了 LoRA：卡上的触发词才写进正文（没挂 LoRA 时触发词只是噪音）。 */
  hasLoras: boolean
}

export interface ImageOutlet {
  /** 放在用户正文前面的那一段；没有可写的就是 null。 */
  promptPrefix: string | null
  /** 追加在用户参考图**之后**的卡图。 */
  referenceImages: string[]
  /** 与 `referenceImages` 逐位对齐的图例（「Image N = @handle 用途」）。 */
  referenceLabels: string[]
  /** 角色负面，排在负面的最后（角色硬约束离生成点最近）。 */
  negative: string | null
  /** NovelAI 原生多角色；只在模型支持且用户没手摆时给。 */
  novelAiLayout: NovelAiCharacterLayout | null
}

function slotLabel(slot: CharacterReferenceSlot): string {
  const role =
    slot.role === 'custom' && slot.customLabel ? slot.customLabel : slot.role
  return slot.isPrimary ? `${role} (primary)` : role
}

/**
 * 参考图配额**在角色之间轮流分**：先每人一张主图，再每人第二张……配额用完即停。
 * ⛔ 不许一个角色吃光配额。结果按角色分组排，图例好读。
 */
function allocateSlots(
  characters: readonly CardBusCharacter[],
  budget: number,
): CharacterReferenceSlot[][] {
  const picked = characters.map(() => [] as CharacterReferenceSlot[])
  const seen = new Set<string>()
  let left = budget
  for (let depth = 0; left > 0; depth += 1) {
    let progressed = false
    characters.forEach((character, index) => {
      const slot = character.slots[depth]
      if (!slot || left <= 0) return
      progressed = true
      if (seen.has(referenceUrlKey(slot.url))) return
      seen.add(referenceUrlKey(slot.url))
      picked[index]!.push(slot)
      left -= 1
    })
    if (!progressed) break
  }
  return picked
}

/** NovelAI 认人用的那串：角色标签 + 外观标签；没有标签就退回视觉文字。 */
function tagText(character: CardBusCharacter): string | null {
  const tags = [...character.tags.character, ...character.tags.appearance]
  return tags.length ? tags.join(', ') : null
}

function characterBlock(
  character: CardBusCharacter,
  options: { preferTags: boolean; hasLoras: boolean; hasImages?: boolean },
): string {
  const head = `[Character: @${character.handle}${character.name !== character.handle ? ` (${character.name})` : ''}]`
  const trigger =
    options.hasLoras && character.tags.loraTrigger
      ? character.tags.loraTrigger
      : null
  // ⭐ 分到参考图的角色靠图认人（owner 09-28：整段描述和场景抢权重，出图杂）。
  const body = options.hasImages
    ? null
    : options.preferTags
      ? (tagText(character) ?? character.visual)
      : character.visual
  const text = [trigger, body].filter(Boolean).join(', ')
  return text ? `${head}\n${text}` : head
}

/**
 * 把中间形态压成**图片 provider 能收的**：一段正文前缀 + 一串扁平 URL + 负面。
 *
 * - 分到图的角色只写名字 + 图例 + 保持指令；没分到图的才写视觉文字认人。
 * - 多图模型：配额在角色间轮流分，正文里写图例「Image N = @handle 用途」。
 * - 单图模型：只送第一个（焦点）角色的主图，其余角色只进文字。
 * - NovelAI：⛔ 不送卡图（它的参考图是图生图底图，会把出图变成改卡图）；
 *   支持多角色的型号改用原生 `characterPrompts`，每个角色一条。
 */
export function compileImageOutlet(
  characters: readonly CardBusCharacter[],
  options: ImageOutletOptions,
): ImageOutlet {
  if (characters.length === 0) {
    return {
      promptPrefix: null,
      referenceImages: [],
      referenceLabels: [],
      negative: null,
      novelAiLayout: null,
    }
  }

  const negative =
    characters
      .flatMap((character) => (character.negative ? [character.negative] : []))
      .join(', ') || null

  if (options.adapterType === AI_ADAPTER_TYPES.NOVELAI) {
    const canLayout =
      !options.hasNovelAiLayout &&
      supportsNovelAiCharacters(options.modelId) &&
      characters.length <= getNovelAiMaxCharacters(options.modelId)
    if (canLayout) {
      return {
        promptPrefix: null,
        referenceImages: [],
        referenceLabels: [],
        negative: null,
        novelAiLayout: {
          positioning: 'auto',
          characters: characters.map((character, index) => ({
            prompt: [
              options.hasLoras ? character.tags.loraTrigger : '',
              tagText(character) ?? character.visual ?? character.name,
            ]
              .filter(Boolean)
              .join(', '),
            negativePrompt: character.negative ?? '',
            position: { x: novelAiGridCellCenter(index), y: 0.5 },
          })),
        },
      }
    }
    return {
      promptPrefix: characters
        .map((character) =>
          characterBlock(character, {
            preferTags: true,
            hasLoras: options.hasLoras,
          }),
        )
        .join('\n\n'),
      referenceImages: [],
      referenceLabels: [],
      negative,
      novelAiLayout: null,
    }
  }

  const budget = Math.max(
    0,
    options.maxReferenceImages - options.userReferenceCount,
  )
  const picked =
    options.maxReferenceImages > 1
      ? allocateSlots(characters, budget)
      : characters.map((character, index) =>
          index === 0 && budget > 0 && character.slots[0]
            ? [character.slots[0]]
            : [],
        )

  const referenceImages: string[] = []
  const legend: string[] = []
  const keep: string[] = []
  picked.forEach((slots, index) => {
    const character = characters[index]!
    const numbers: number[] = []
    for (const slot of slots) {
      referenceImages.push(slot.url)
      const number = options.userReferenceCount + referenceImages.length
      numbers.push(number)
      legend.push(`Image ${number} = @${character.handle} ${slotLabel(slot)}`)
    }
    // ⭐ 保持指令（owner 09-26）：只标图号时 GPT Image 不一定严格照画。
    if (numbers.length) {
      keep.push(
        `Keep @${character.handle}'s face, hairstyle, hair colors and outfit identical to ${numbers.map((n) => `Image ${n}`).join(', ')}.`,
      )
    }
  })

  const blocks = characters
    .map((character, index) =>
      characterBlock(character, {
        preferTags: false,
        hasLoras: options.hasLoras,
        hasImages: picked[index]!.length > 0,
      }),
    )
    .join('\n\n')
  return {
    promptPrefix: legend.length
      ? `${blocks}\n\nReference images:\n${legend.join('\n')}\n${keep.join('\n')}`
      : blocks,
    referenceImages,
    referenceLabels: legend,
    negative,
    novelAiLayout: null,
  }
}
