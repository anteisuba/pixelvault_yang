import {
  CARD_EXTENSIONS,
  CHARACTER_CARD,
  CHARACTER_PERSONA_LIMITS,
} from '@/constants/cards/character-card'
import type { CharacterPinnableField } from '@/constants/cards/character-revision'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import type {
  CharacterCardRecord,
  CharacterLookRecord,
  CharacterPersona,
  CharacterReferenceSlot,
  GenerationRecord,
  UpdateCharacterCardRequest,
  UpdateCharacterLookRequest,
} from '@/types'
import type { TavernCardKept } from '@/types/tavern-card'
import { parseTavernExamples } from '@/lib/tavern-card'

/**
 * 角色详情**点哪改哪**用的纯函数（owner 09-27 原型 B）：一格改完 → 以当前角色记录为底
 * 合进这一格（`draftFromCard` + 改动）→ `updateFromDraft` 出整份更新请求。
 * 外观文字、标签、图属于**造型**（角色④）：走 `lookUpdateFromDraft`，只发改了的那几格。
 *
 * ⭐ 图片直接改参考槽（换一张 / 删一张 / 设为主图 / 加几张），服务端按不变量校验并反向写回
 *   旧图片列。图一律从**素材库**来（owner 09-26：图都在素材库，卡跨文件夹挑图）；
 *   新上传走素材库选择器自己的上传格，⛔ 这里不另开上传。
 * ⚠ 设定是整体替换：没在这里编辑的格（口头禅、示例对白……）原样带回去，⛔ 不丢。
 */

export interface CharacterCardDraft {
  name: string
  identity: string
  behavior: string
  speech: string
  /** 她不会做的事 / 小缺点（10-26）。 */
  boundaries: string
  backstory: string
  /** 作品手改值；空 = 从默认造型的标签取。 */
  work: string
  // ── 酒馆卡字段（owner 2026-10-15「字段对齐酒馆」：详情里全显示、能改）──
  scenario: string
  /** 开场白（酒馆 first_mes）。 */
  opening: string
  /** 对话示例，酒馆 `mes_example` 的写法（`<START>` / `{{user}}:` / `{{char}}:`）。 */
  examples: string
  /** 几种口吻（10-26「更像真人」F），一行一种。 */
  moods: string
  /** 学到的说法（F），一行一个；聊天里自动攒，这里能删能改。 */
  learnedPhrases: string
  /** 和你的关系（C）：她整理聊天时自己写，这里能改。 */
  relationship: string
  /** 作者备注（酒馆 creator_notes）= 我们的简介。 */
  summary: string
  alternateGreetings: string[]
  systemPrompt: string
  postHistoryInstructions: string
  /** 钉住的格（第 ② 步）：她和助手都改不了。 */
  pinnedFields: CharacterPinnableField[]
  /** 她的嗓子（音色卡 id，第 ② 步人物组的「声音」格）；没绑 = `null`。 */
  voiceCardId: string | null
}

const clip = (text: string, max: number): string => text.trim().slice(0, max)

/** 一行一条的格 → 列表：空行去掉、每条截断、条数封顶（`fromEnd` = 留最新的）。 */
function linesOf(
  text: string,
  {
    max,
    chars,
    fromEnd = false,
  }: { max: number; chars: number; fromEnd?: boolean },
): string[] {
  const lines = [
    ...new Set(
      text
        .split('\n')
        .map((line) => clip(line, chars))
        .filter(Boolean),
    ),
  ]
  return fromEnd ? lines.slice(-max) : lines.slice(0, max)
}

/** 示例对白 → 酒馆 `mes_example` 的写法（一组一个 `<START>` 块）。 */
export function examplesToTavernText(
  examples: CharacterPersona['examples'],
): string {
  return examples
    .map(({ user, reply }) =>
      [
        '<START>',
        ...(user.trim() ? [`{{user}}: ${user.trim()}`] : []),
        `{{char}}: ${reply.trim()}`,
      ].join('\n'),
    )
    .join('\n')
}

/**
 * 经历的完整原文（owner 2026-10-15）：导入时经历装不下的那截全文留在 `st.card.description`。
 * 经历还是原文开头那截（没被用户改过）就换成全文显示，超上限的部分仍留在 `st.card`。
 */
function fullBackstory(card: CharacterCardRecord): string {
  const backstory = card.persona?.backstory ?? ''
  const original = card.tavern?.description?.trim() ?? ''
  if (original.length <= backstory.length) return backstory
  if (!original.startsWith(backstory.trim())) return backstory
  return clip(original, CHARACTER_PERSONA_LIMITS.backstory)
}

/** 酒馆那几格写回 `st.card`：空的删掉，认不出的键（世界书、来源……）原样带着。 */
function tavernFromDraft(
  kept: TavernCardKept | null,
  draft: CharacterCardDraft,
): TavernCardKept | null {
  const greetings = draft.alternateGreetings
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, TAVERN_CARD.MAX_ALTERNATE_GREETINGS)
  const next: TavernCardKept = { ...kept }
  delete next.systemPrompt
  delete next.postHistoryInstructions
  delete next.alternateGreetings
  // 原文已整段进了经历 → 不再另存一份。
  if (next.description?.trim() === draft.backstory.trim())
    delete next.description
  if (draft.systemPrompt.trim()) next.systemPrompt = draft.systemPrompt.trim()
  if (draft.postHistoryInstructions.trim())
    next.postHistoryInstructions = draft.postHistoryInstructions.trim()
  if (greetings.length) next.alternateGreetings = greetings
  return kept || Object.keys(next).length ? next : null
}

export function draftFromCard(card: CharacterCardRecord): CharacterCardDraft {
  return {
    name: card.name,
    identity: card.persona?.identity ?? '',
    behavior: card.persona?.behavior ?? '',
    speech: card.persona?.speech ?? '',
    boundaries: card.persona?.boundaries ?? '',
    backstory: fullBackstory(card),
    work: card.workOverride ?? '',
    scenario: card.persona?.scenario ?? '',
    opening: card.persona?.opening ?? '',
    examples: examplesToTavernText(card.persona?.examples ?? []),
    moods: (card.persona?.moods ?? []).join('\n'),
    learnedPhrases: (card.persona?.learnedPhrases ?? []).join('\n'),
    relationship: card.persona?.relationship ?? '',
    summary: card.summary ?? '',
    alternateGreetings: card.tavern?.alternateGreetings ?? [],
    systemPrompt: card.tavern?.systemPrompt ?? '',
    postHistoryInstructions: card.tavern?.postHistoryInstructions ?? '',
    pinnedFields: card.pinnedFields,
    voiceCardId: card.voiceCardId,
  }
}

/** 草稿 → 更新请求。只带编辑面上有的格；设定里没编辑的格原样带回。 */
export function updateFromDraft(
  card: CharacterCardRecord,
  draft: CharacterCardDraft,
): UpdateCharacterCardRequest {
  const keptExamples = card.persona?.examples ?? []
  // 没动过示例就原样带回（⛔ 来回解析一遍改掉别人的格式）。
  const examples =
    draft.examples === examplesToTavernText(keptExamples)
      ? keptExamples
      : parseTavernExamples(draft.examples, card.name)
  const tavern = tavernFromDraft(card.tavern, draft)
  return {
    name: draft.name.trim() || card.name,
    voiceCardId: draft.voiceCardId,
    summary: clip(draft.summary, CHARACTER_CARD.SUMMARY_MAX_LENGTH) || null,
    persona: {
      catchphrases: [],
      ...card.persona,
      identity: draft.identity.trim(),
      behavior: draft.behavior.trim(),
      speech: draft.speech.trim(),
      boundaries: clip(draft.boundaries, CHARACTER_PERSONA_LIMITS.boundaries),
      backstory: draft.backstory.trim(),
      scenario: clip(draft.scenario, CHARACTER_PERSONA_LIMITS.scenario),
      opening: clip(draft.opening, CHARACTER_PERSONA_LIMITS.opening),
      examples,
      moods: linesOf(draft.moods, {
        max: CHARACTER_PERSONA_LIMITS.moods,
        chars: CHARACTER_PERSONA_LIMITS.moodChars,
      }),
      learnedPhrases: linesOf(draft.learnedPhrases, {
        max: CHARACTER_PERSONA_LIMITS.learnedPhrases,
        chars: CHARACTER_PERSONA_LIMITS.learnedPhraseChars,
        fromEnd: true,
      }),
      relationship: clip(
        draft.relationship,
        CHARACTER_PERSONA_LIMITS.relationship,
      ),
    },
    extensions: {
      ...(tavern ? { [TAVERN_CARD.EXTENSION_KEY]: tavern } : {}),
      // 清空 = 删键（回到从标签取）。
      [CARD_EXTENSIONS.KEYS.work]:
        draft.work.trim().slice(0, CARD_EXTENSIONS.WORK_MAX_LENGTH) || null,
      [CARD_EXTENSIONS.KEYS.pinnedFields]: draft.pinnedFields.length
        ? [...new Set(draft.pinnedFields)]
        : null,
    },
  }
}

/** 一套造型上能改的几格（角色④）。 */
export interface CharacterLookDraft {
  description: string
  tags: string[]
  slots: CharacterReferenceSlot[]
}

/** 造型的一格改动 → 更新请求：只带改了的格；图清空不发（参考槽至少一张）。 */
export function lookUpdateFromDraft(
  look: CharacterLookRecord,
  patch: Partial<CharacterLookDraft>,
): UpdateCharacterLookRequest {
  return {
    ...(patch.description !== undefined
      ? { description: patch.description.trim() || null }
      : {}),
    ...(patch.tags !== undefined
      ? {
          tags: [
            ...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean)),
          ].slice(0, CHARACTER_CARD.MAX_LOOK_TAGS),
        }
      : {}),
    ...(patch.slots?.length && patch.slots !== look.referenceSlots
      ? { referenceSlots: patch.slots }
      : {}),
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

/** 槽里的一张图从哪来：地址 · 素材库里那条的 id · 上传还是生成。 */
export interface SlotImageSource {
  url: string
  generationId: string
  origin: 'upload' | 'generation'
}

/** 素材库里的一张 → 槽里的图：记下来源（上传 / 生成）与生成 id。 */
function slotImage(generation: GenerationRecord): SlotImageSource {
  return {
    url: generation.url,
    generationId: generation.id,
    origin:
      generation.provider === USER_UPLOAD_PROVIDER ? 'upload' : 'generation',
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
  return appendSlotSources(slots, generations.map(slotImage))
}

/** 同上，但手上只有地址与 id（卡片助手挂图那条路，C3）。 */
export function appendSlotSources(
  slots: CharacterReferenceSlot[],
  sources: readonly SlotImageSource[],
): CharacterReferenceSlot[] {
  const next = [...slots]
  for (const source of sources) {
    if (next.length >= CHARACTER_CARD.MAX_REFERENCE_SLOTS) break
    if (next.some((slot) => slot.url === source.url)) continue
    next.push({
      id: nextSlotId(next),
      role: 'identity',
      isPrimary: next.length === 0,
      ...source,
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
