/**
 * 卡片总线的**编译层**（进度表 35 · 第 ⑤ 片）：一个中间形态，N 个出口。
 *
 * ⭐ 中间形态是「每个角色一组」：视觉文字 · 角色负面 · 排好序的参考槽。
 *   ⛔ 这一层不合并文本 —— 压平是各出口的事（图片在这里，视频是第 ⑦ 片）。
 * ⭐ 从库里读卡只有 `features/cards/services/card-bus.service.ts` 一处；本文件不碰库。
 * ⛔ `summary` 不进任何出口（给人看的）；造型 `tags` 只进 NovelAI 出口（它靠标签认人），
 *   别的出口用外观文字。
 * 契约见 `docs/references/domains/cards.md`「编译层」。
 */

import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getNovelAiMaxCharacters,
  novelAiGridCellCenter,
  supportsNovelAiCharacters,
  supportsNovelAiPreciseReference,
} from '@/constants/novelai'
import { referenceUrlKey } from '@/lib/card-bus'
import type { CharacterReferenceSlot } from '@/types'
import type { NovelAiCharacterLayout } from '@/types/novelai'

// ─── 中间形态 ────────────────────────────────────────────────────

export interface CardBusCharacter {
  cardId: string
  /** 卡内容版本：进生成快照，指认出图用的是哪一版卡。 */
  version: number
  handle: string
  name: string
  /** 用的哪套造型（角色④）；进生成记录。 */
  lookId: string | null
  /** 视觉文字 = 这套造型的外观文字。 */
  visual: string | null
  /** 角色硬否定（`extensions['pv.negative']`）。 */
  negative: string | null
  /** 这套造型的标签：NovelAI 用它认人。 */
  tags: string[]
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
  lookId: string | null
  description: string | null
  tags: readonly string[]
  extensions: unknown
  slots: readonly CharacterReferenceSlot[]
  /** 用户亲手挑的图：按挑的顺序送，⛔ 不再按主图 / 身份重排。 */
  keepOrder?: boolean
}

function readExtension(extensions: unknown, key: string): unknown {
  if (!extensions || typeof extensions !== 'object') return undefined
  return (extensions as Record<string, unknown>)[key]
}

function readNegative(extensions: unknown): string | null {
  const value = readExtension(extensions, CARD_EXTENSIONS.KEYS.negative)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function slotRank(slot: CharacterReferenceSlot): number {
  if (slot.isPrimary) return 0
  return slot.role === 'identity' ? 1 : 2
}

export function toCardBusCharacter(
  source: CardBusCharacterSource,
): CardBusCharacter {
  return {
    cardId: source.id,
    version: source.version,
    handle: source.handle,
    name: source.name,
    lookId: source.lookId,
    visual: source.description?.trim() || null,
    negative: readNegative(source.extensions),
    tags: [...source.tags],
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
  /**
   * 卡图里最多几张算人物参考（Nano Banana：Pro ≤5、Flash ≤4）。缺省 = 不另设。
   * ⚠ 只卡卡图：用户自己挂的图是不是人物我们不知道。
   */
  maxCharacterReferenceImages?: number
  /** 用户开了「造型主图做 NovelAI 精确参考」（每张 +5 Anlas，默认关）。 */
  novelAiPreciseReference?: boolean
  /** 这一次挂了遮罩重绘（NovelAI 精确参考与重绘不能同时用）。 */
  hasInpaintMask?: boolean
}

/**
 * 这一次会不会真的把角色主图送进 NovelAI 精确参考（服务端编译与界面价格提示共用这一条）。
 *
 * - 只有 V4.5 有精确参考；官方：「Multiple character references at once will currently
 *   blend them together」→ ⛔ 多角色不送（会混成一个人），只走标签。
 * - worker 只读第一张参考图，它同时是图生图底图 → 用户自己挂了图时让给用户的图。
 * - 与遮罩重绘互斥（worker 会拒）。
 * https://docs.novelai.net/en/image/precisereference/
 */
export function willSendNovelAiCharacterReference(input: {
  modelId: string
  enabled: boolean
  characterCount: number
  characterHasImage: boolean
  userReferenceCount: number
  hasInpaintMask: boolean
}): boolean {
  return (
    input.enabled &&
    supportsNovelAiPreciseReference(input.modelId) &&
    input.characterCount === 1 &&
    input.characterHasImage &&
    input.userReferenceCount === 0 &&
    !input.hasInpaintMask
  )
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
  /** 卡图走 NovelAI 精确参考（`novelAiReferenceMode: 'precise'`），⛔ 不是图生图底图。 */
  novelAiPreciseReference: boolean
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

/** NovelAI 认人用的那串：这套造型的标签；没有标签就退回视觉文字。 */
function tagText(character: CardBusCharacter): string | null {
  return character.tags.length ? character.tags.join(', ') : null
}

function characterBlock(
  character: CardBusCharacter,
  options: { preferTags: boolean; hasImages?: boolean },
): string {
  const head = `[Character: @${character.handle}${character.name !== character.handle ? ` (${character.name})` : ''}]`
  // ⭐ 分到参考图的角色靠图认人（owner 09-28：整段描述和场景抢权重，出图杂）。
  const body = options.hasImages
    ? null
    : options.preferTags
      ? (tagText(character) ?? character.visual)
      : character.visual
  return body ? `${head}\n${body}` : head
}

/**
 * 把中间形态压成**图片 provider 能收的**：一段正文前缀 + 一串扁平 URL + 负面。
 *
 * - 分到图的角色只写名字 + 图例 + 保持指令（不写外观）；没分到图的写整段视觉文字认人。
 * - 多图模型：配额在角色间轮流分，正文里写图例「Image N = @handle 用途」；
 *   官方另有人物上限的（Nano Banana）卡图再按它封顶。
 * - 单图模型：只送第一个（焦点）角色的主图，其余角色只进文字。
 * - NovelAI：⛔ 不把卡图当图生图底图（会把出图变成改卡图）；支持多角色的型号用原生
 *   `characterPrompts`（标签认人）。用户开了精确参考且只有一位时，她的主图走
 *   Precise Reference（`willSendNovelAiCharacterReference`）。
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
      novelAiPreciseReference: false,
    }
  }

  const negative =
    characters
      .flatMap((character) => (character.negative ? [character.negative] : []))
      .join(', ') || null

  if (options.adapterType === AI_ADAPTER_TYPES.NOVELAI) {
    const precise = willSendNovelAiCharacterReference({
      modelId: options.modelId,
      enabled: options.novelAiPreciseReference === true,
      characterCount: characters.length,
      characterHasImage: Boolean(characters[0]?.slots[0]),
      userReferenceCount: options.userReferenceCount,
      hasInpaintMask: options.hasInpaintMask === true,
    })
    const preciseImages =
      precise && characters[0]?.slots[0] ? [characters[0].slots[0].url] : []
    const canLayout =
      !options.hasNovelAiLayout &&
      supportsNovelAiCharacters(options.modelId) &&
      characters.length <= getNovelAiMaxCharacters(options.modelId)
    if (canLayout) {
      return {
        promptPrefix: null,
        referenceImages: preciseImages,
        referenceLabels: [],
        novelAiPreciseReference: precise,
        negative: null,
        novelAiLayout: {
          positioning: 'auto',
          characters: characters.map((character, index) => ({
            prompt: tagText(character) ?? character.visual ?? character.name,
            negativePrompt: character.negative ?? '',
            position: { x: novelAiGridCellCenter(index), y: 0.5 },
          })),
        },
      }
    }
    return {
      promptPrefix: characters
        .map((character) => characterBlock(character, { preferTags: true }))
        .join('\n\n'),
      referenceImages: preciseImages,
      referenceLabels: [],
      negative,
      novelAiLayout: null,
      novelAiPreciseReference: precise,
    }
  }

  const budget = Math.max(
    0,
    Math.min(
      options.maxReferenceImages - options.userReferenceCount,
      options.maxCharacterReferenceImages ?? Infinity,
    ),
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
    novelAiPreciseReference: false,
  }
}
