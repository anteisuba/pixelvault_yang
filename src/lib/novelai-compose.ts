import {
  findNovelAiInteractionPreset,
  getNovelAiTextLimit,
} from '../constants/novelai'
import type { NovelAiCharacter, NovelAiSceneText } from '../types/novelai'

/**
 * NovelAI 的**发送翻译**：把标签台里「人身上的互动 / 台词」与整体页的画面文字
 * 编成 NovelAI 认的写法。服务端校验、execution worker 拼请求、界面上的字数
 * 计数都读这一份，⛔ 别处再拼一遍。
 *
 * 依据（2026-10-07 实测，见 docs/references/providers.md 同日一节）：
 * - 互动写在各自的角色栏：发起方 `source#tag`、对方 `target#tag`，互相 `mutual#tag`。
 * - 台词在整体里**按站位称呼**（「the girl on the left says "…"」）3/3 落对人；
 *   按长相称呼会落错。末尾 `Text:` 每段之间空一行。
 * - 质量标签里的 `no text` 只在有字时去掉（没字时它能挡住背景乱冒的字）。
 *
 * ⚠ 相对路径导入：execution worker 也打包这份（它不认 `@/`）。
 */

type Quality = string | null | undefined

/** V5 Full / Curated 共用的质量标签串。https://docs.novelai.net/en/image/qualitytags/ */
const QUALITY_SUFFIXES: Record<string, string> = {
  light: ', very aesthetic, amazing quality, no text',
  standard: ', very aesthetic, masterpiece, no text',
}
/** V4.5 只有 standard 一档，Full / Curated 各一串。 */
const V45_QUALITY_SUFFIXES: Record<string, string> = {
  'nai-diffusion-4-5-full': ', location, very aesthetic, masterpiece, no text',
  'nai-diffusion-4-5-curated':
    ', location, masterpiece, no text, -0.8::feet::, rating:general',
}

/**
 * Undesired Content 预设 —— 标签串，作为**前缀**接在用户自己的负面前面。payload
 * 里那个数字 `ucPreset` 在各代之间的含义没有官方口径，⛔ 不猜。
 * https://docs.novelai.net/en/image/undesiredcontent/
 */
const UC_PRESET_TAGS: Record<string, string> = {
  heavy:
    'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
  light:
    'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
  furry:
    '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
  human:
    'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
}

const TEXT_SEPARATOR = '\n\n'
/** 位置称呼只对这么多人实测过（2 人 left / right；3 人按同一套加 middle）。 */
const MAX_NAMED_SPEAKERS = 3

function joinTags(base: string, extra: readonly string[]): string {
  const head = base.trim()
  if (!extra.length) return head
  return head ? `${head}, ${extra.join(', ')}` : extra.join(', ')
}

function splitTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

/** 一位角色的标签 + 互动标签（发起 `source#` / 被做 `target#` / 互相 `mutual#`）。 */
export function composeNovelAiCharacterCaptions(
  characters: readonly Pick<NovelAiCharacter, 'prompt' | 'interactions'>[],
): string[] {
  const extra = characters.map(() => [] as string[])
  const push = (index: number, tag: string) => {
    if (!extra[index]?.includes(tag)) extra[index]?.push(tag)
  }
  characters.forEach((character, index) => {
    for (const interaction of character.interactions ?? []) {
      if (interaction.target === index || !characters[interaction.target])
        continue
      const tag = interaction.tag.trim().toLowerCase()
      if (interaction.mutual) {
        push(index, `mutual#${tag}`)
        push(interaction.target, `mutual#${tag}`)
      } else {
        push(index, `source#${tag}`)
        const preset = findNovelAiInteractionPreset(tag)
        const targetTag =
          preset && 'targetTag' in preset ? preset.targetTag : tag
        push(interaction.target, `target#${targetTag}`)
      }
    }
  })
  return characters.map((character, index) =>
    joinTags(character.prompt, extra[index] ?? []),
  )
}

/** 角色标签里的人称（称呼里那个 girl / boy …）。认不出就是 person。 */
export function novelAiPersonNoun(prompt: string): string {
  for (const tag of splitTags(prompt)) {
    if (/^\d*girls?$/.test(tag)) return 'girl'
    if (/^\d*boys?$/.test(tag)) return 'boy'
    if (tag === 'woman' || tag === 'mature female') return 'woman'
    if (tag === 'man' || tag === 'mature male') return 'man'
  }
  return 'person'
}

const KANA = /[぀-ヿ]/
const HANGUL = /[ᄀ-ᇿ가-힯]/
const HAN = /[㐀-鿿豈-﫿]/
const LATIN = /[A-Za-z]/

/** 这串字里有没有 V4 / V4.5 画不出的字（只认英文）。 */
export function hasNonLatinScript(text: string): boolean {
  return KANA.test(text) || HANGUL.test(text) || HAN.test(text)
}

/**
 * 有字时补在整体里的语言标签。日文不补 —— NovelAI 官方联想里没有
 * `japanese text`（Danbooru 里日文是默认，不单独标）。
 */
function languageTags(texts: readonly string[]): string[] {
  const tags: string[] = []
  const add = (tag: string) => {
    if (!tags.includes(tag)) tags.push(tag)
  }
  for (const text of texts) {
    if (HANGUL.test(text)) add('korean text')
    else if (KANA.test(text)) continue
    else if (HAN.test(text)) add('chinese text')
    else if (LATIN.test(text)) add('english text')
  }
  return tags
}

function sceneSentence(item: NovelAiSceneText): string {
  const text = item.text.trim()
  switch (item.kind) {
    case 'sign':
      return `A sign that reads "${text}"`
    case 'title':
      return `The title "${text}" is written in the image`
    case 'cover':
      return `The cover text reads "${text}"`
    default:
      return `The text "${text}" appears in the image`
  }
}

export interface NovelAiTextPlan {
  /** 整体末尾补的自然语言（谁说了什么、画面里写着什么），空串 = 没有。 */
  sentences: string
  /** 整体里补的标签（`text`、语言、`speech bubble`）。 */
  tags: string[]
  /** 整体最末的 `Text:` 段，每段之间空一行；空串 = 没有。 */
  block: string
  /** 4 人以上说话时改写进各自角色栏的 `Text:`（按下标，没说话是 undefined）。 */
  characterText: (string | undefined)[]
  /** 全部台词 + 画面文字的字数（含段间空行），界面计数与服务端上限读它。 */
  length: number
  /** 所有要画出来的字（语言检查读它）。 */
  texts: string[]
}

export interface NovelAiTextInput {
  characters: readonly Pick<
    NovelAiCharacter,
    'prompt' | 'dialogue' | 'position'
  >[]
  positioning: 'auto' | 'manual'
  sceneTexts?: readonly Pick<NovelAiSceneText, 'kind' | 'text'>[]
}

/**
 * 台词与画面文字的编排。称呼按站位：手动按横坐标，交给模型按名单顺序
 * （实测：名单顺序 = 从左到右）。
 */
export function planNovelAiText(input: NovelAiTextInput): NovelAiTextPlan {
  const { characters, positioning } = input
  const scenes = (input.sceneTexts ?? []).filter((item) => item.text.trim())
  const lines = characters.map((character) => character.dialogue?.trim() ?? '')
  const speakers = lines.flatMap((line, index) => (line ? [index] : []))

  const order = characters
    .map((character, index) => ({ index, x: character.position.x }))
    .sort((a, b) =>
      positioning === 'manual' && a.x !== b.x ? a.x - b.x : a.index - b.index,
    )
    .map((entry) => entry.index)
  const rank = new Map(order.map((index, slot) => [index, slot]))
  const place = (index: number): string => {
    const slot = rank.get(index) ?? 0
    if (characters.length === 2)
      return slot === 0 ? 'on the left' : 'on the right'
    return ['on the left', 'in the middle', 'on the right'][slot] ?? ''
  }
  const named = characters.length <= MAX_NAMED_SPEAKERS
  const spoken = [...speakers].sort(
    (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
  )

  const sentences: string[] = []
  const characterText: (string | undefined)[] = characters.map(() => undefined)
  const blockParts: string[] = []
  if (named && spoken.length) {
    sentences.push(
      spoken
        .map((index, position) => {
          const noun = novelAiPersonNoun(characters[index]?.prompt ?? '')
          const who =
            characters.length === 1
              ? `The ${noun}`
              : `the ${noun} ${place(index)}`
          const subject = position === 0 ? who.replace(/^the/, 'The') : who
          return `${subject} says "${lines[index]}"`
        })
        .join(' and '),
    )
    blockParts.push(...spoken.map((index) => lines[index] ?? ''))
  } else {
    for (const index of speakers) characterText[index] = lines[index]
  }
  for (const item of scenes) sentences.push(sceneSentence(item))
  blockParts.push(...scenes.map((item) => item.text.trim()))

  const texts = [
    ...speakers.map((index) => lines[index] ?? ''),
    ...scenes.map((item) => item.text.trim()),
  ]
  const tags = texts.length
    ? [
        'text',
        ...languageTags(texts),
        ...(speakers.length ? ['speech bubble'] : []),
      ]
    : []
  return {
    sentences: sentences.join('. '),
    tags,
    block: blockParts.join(TEXT_SEPARATOR),
    characterText,
    length:
      texts.reduce((sum, text) => sum + text.length, 0) +
      Math.max(0, texts.length - 1) * TEXT_SEPARATOR.length,
    texts,
  }
}

export type NovelAiTextProblem =
  | { kind: 'tooLong'; max: number; length: number }
  | { kind: 'latinOnly' }

/** 这一轮的字这个模型画不画得了（界面生成闸与服务端校验同一把尺）。 */
export function checkNovelAiText(
  plan: Pick<NovelAiTextPlan, 'length' | 'texts'>,
  modelId?: string,
): NovelAiTextProblem | null {
  if (!plan.texts.length) return null
  const limit = getNovelAiTextLimit(modelId)
  if (!limit) return null
  if (limit.latinOnly && plan.texts.some(hasNonLatinScript)) {
    return { kind: 'latinOnly' }
  }
  if (plan.length > limit.maxChars) {
    return { kind: 'tooLong', max: limit.maxChars, length: plan.length }
  }
  return null
}

/**
 * 整体：标签 → 文字标签 → 称呼句 → 质量标签 → `Text:`（必须最末）。
 * 有字时质量标签里的 `no text` 去掉。
 */
export function composeNovelAiPrompt(
  prompt: string,
  qualityToggle: Quality,
  plan?: Pick<NovelAiTextPlan, 'tags' | 'sentences' | 'block' | 'texts'>,
  externalModelId?: string,
): string {
  let composed = plan ? joinTags(prompt, plan.tags) : prompt
  if (plan?.sentences) {
    composed = composed ? `${composed}. ${plan.sentences}` : plan.sentences
  }
  const v45 = externalModelId
    ? V45_QUALITY_SUFFIXES[externalModelId]
    : undefined
  let suffix = v45
    ? qualityToggle === 'standard'
      ? v45
      : undefined
    : qualityToggle
      ? QUALITY_SUFFIXES[qualityToggle]
      : undefined
  if (suffix && plan?.texts.length) suffix = suffix.replace(', no text', '')
  if (suffix) composed += suffix
  if (plan?.block) composed += `${composed ? ', ' : ''}Text: ${plan.block}`
  return composed
}

/** 一位角色栏的最终串：标签（含互动）+ 4 人以上时自己的 `Text:`。 */
export function composeNovelAiCharacterCaption(
  caption: string,
  text: string | undefined,
): string {
  return text ? `${caption}${caption ? ', ' : ''}Text: ${text}` : caption
}

/** UC 预设前缀 + 用户自己的负面提示词。 */
export function composeNovelAiUndesiredContent(
  negative: string,
  ucPreset: string | null | undefined,
): string {
  const preset = ucPreset ? UC_PRESET_TAGS[ucPreset] : undefined
  if (!preset) return negative
  return negative ? `${preset}, ${negative}` : preset
}

const SINGLE_COUNT_TAGS = new Set(['1girl', '1boy', 'solo'])

/**
 * 人数提示（整体页那一行）：≥2 人而整体里还写着单人标签时给出改法。
 * 认得出每个人的人称才给具体的人数标签（2girls、1girl, 1boy…），认不出只建议
 * 去掉 `solo` / `1girl` 这类单人标签。⛔ 不自动改 —— 由用户点。
 */
export function suggestNovelAiCountTags(
  wholePrompt: string,
  characterPrompts: readonly string[],
): { remove: string[]; add: string[] } | null {
  if (characterPrompts.length < 2) return null
  const whole = splitTags(wholePrompt)
  const nouns = characterPrompts.map(novelAiPersonNoun)
  const desired: string[] = []
  if (!nouns.includes('person')) {
    const girls = nouns.filter(
      (noun) => noun === 'girl' || noun === 'woman',
    ).length
    const boys = nouns.length - girls
    if (girls) desired.push(girls === 1 ? '1girl' : `${girls}girls`)
    if (boys) desired.push(boys === 1 ? '1boy' : `${boys}boys`)
  }
  // 认得出人称：整体里的人数标签换成算出来的那一组；认不出：只去掉单人标签。
  const remove = desired.length
    ? whole.filter((tag) => isCountTag(tag) && !desired.includes(tag))
    : whole.filter((tag) => SINGLE_COUNT_TAGS.has(tag))
  const add = desired.filter((tag) => !whole.includes(tag))
  if (!remove.length && !add.length) return null
  // 只缺不错（例如整体里还没写人数）不打扰 —— 提示只管「写着单人的标签」。
  if (!remove.length) return null
  return { remove, add }
}

function isCountTag(tag: string): boolean {
  return SINGLE_COUNT_TAGS.has(tag) || /^\d+(girls?|boys?)$/.test(tag)
}

/** 角色栏里写了 `1girl` 这类人数标签（官方：角色栏写 girl，不写 1girl）。 */
export function findNovelAiCharacterCountTags(prompt: string): string[] {
  return splitTags(prompt).filter(isCountTag)
}
