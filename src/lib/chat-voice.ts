import { DRAMA_PAIRED_TAGS, VOICE_CUE_GROUPS } from '@/constants/chat-voice'
import {
  GENERATION_NAME,
  GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE,
} from '@/constants/generation-naming'

/**
 * 她在对话里说的话怎么摆、怎么念（②c，聊天并回对话）——纯函数，前后端共用。
 */

/** 官方标记表里的词（配音台「语气」菜单同一张表）：念法提示与发送前清洗都按它。 */
const cueWords = (ids: readonly string[]) =>
  VOICE_CUE_GROUPS.filter((group) => ids.includes(group.id))
    .flatMap((group) => group.cues.map((cue) => `[${cue.tag}]`))
    .join(' ')

/**
 * 念出来的语气（方括号提示 / Drama 3 的中文提示与成对标签）：助手内核聊天（`chatVoice`）时拼进提示词。
 * 没有这段她不写方括号，念出来就没了情绪（用户 10-26「语音念出来的情绪」）。
 * ⚠ 10-30：只教 Fish 官方表里的词（以前教的 `[pause]` `[softly]` 表里没有），情绪句首一句一个、一条最多三个，
 * 声音后面只跟那声 —— 认不出的标记、标记后接一长句，都更容易让 Fish 收不住（念完后面全是语气声）。
 */
export function voiceCueRules(expressive: boolean): string {
  return `- Everything you write is read aloud in your voice. You can steer the voice with a short cue in square brackets — only square brackets, never *asterisks* or narration of what you do. Use only these cues:
  emotions ${cueWords(['emotion'])}
  tones ${cueWords(['tone'])}
  sounds ${cueWords(['sound'])}
  pauses ${cueWords(['pause'])}
- An emotion or tone cue goes at the very start of the sentence it colours. At most one cue per sentence and three in a reply; most sentences need none.
- A sound cue is followed only by that sound, then the sentence ends: [chuckling] Heh heh. / [sighing] 唉。 Carry on in a new sentence.${
    expressive
      ? `
- Your voice also understands cues written in your own language at the start of a sentence ([压低声音，带着笑意]) and paired tags that change only the words inside them, always closed on the same line: ${DRAMA_PAIRED_TAGS.map((tag) => `<${tag}>…</${tag}>`).join(' ')}.`
      : ''
  }`
}

/** 模型常写的近义写法 → 官方表里的词（10-30 那条 `[pause]` `[softly]`）。 */
const CUE_ALIASES: Readonly<Record<string, string>> = {
  pause: 'break',
  'short pause': 'break',
  'long pause': 'long-break',
  softly: 'soft tone',
  soft: 'soft tone',
  gently: 'soft tone',
  whispers: 'whispering',
  whisper: 'whispering',
  sighs: 'sighing',
  sigh: 'sighing',
  laughs: 'laughing',
  laugh: 'laughing',
  chuckles: 'chuckling',
  chuckle: 'chuckling',
  giggles: 'chuckling',
  giggling: 'chuckling',
  gasps: 'gasping',
  gasp: 'gasping',
  yawns: 'yawning',
  shouts: 'shouting',
}

/**
 * 发给 Fish 之前把语气提示理一遍（10-30）：近义写法换成官方词；不是 Drama 3 时中文提示和成对标签拿掉
 * （那几档不认）；Drama 3 的成对标签没合上的在那一行末尾合上 —— 没合上，后面整段都按那个语气念。
 */
export function normalizeVoiceCues(text: string, expressive: boolean): string {
  const cued = text.replace(
    /\[([^\]\n]{1,40})\](?!\()/g,
    (cue, inner: string) => {
      const word = inner.trim().toLowerCase()
      const alias = CUE_ALIASES[word]
      if (alias) return `[${alias}]`
      if (!expressive && CJK.test(inner)) return ''
      return cue
    },
  )
  if (!expressive) return cued.replace(DRAMA_TAG, '')
  return cued
    .split('\n')
    .map((line) => {
      let closed = line
      for (const tag of DRAMA_PAIRED_TAGS) {
        const opens = line.split(`<${tag}>`).length - 1
        const closes = line.split(`</${tag}>`).length - 1
        if (opens > closes) closed += `</${tag}>`.repeat(opens - closes)
      }
      return closed
    })
    .join('\n')
}

/** ⚠ 引用角标 `[[1]](地址)` 不是提示：⛔ 吃掉前半截只剩「](地址)」（11-05 真机）。 */
const VOICE_CUE = /[ \t]*(?<!\[)\[[^[\]\n]{1,40}\](?![(\]])[ \t]*/g
/** 联网回答句尾的引用角标 `[[1]](地址)`（只认 http / https）。 */
const CITATION = /\[\[(\d{1,3})\]\]\((https?:\/\/[^)\s]+)\)/g
const DRAMA_TAG = new RegExp(`</?(?:${DRAMA_PAIRED_TAGS.join('|')})>`, 'g')
/** 中日文字与全角标点：挨着它的那一格空白是提示带进来的，藏掉提示时一起去掉。 */
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/

/**
 * 念的语气提示（`[laughing]`、`[压低声音]`、`<whisper>…</whisper>`）只给嗓子听，字里藏掉（用户 10-27）。
 * 成对标签只去标签、留里面的字；markdown 链接 `[字](地址)` 不算。提示两边是西文就留一格空，挨着中日文就不留。
 */
export function withoutVoiceCues(text: string): string {
  return text.replace(DRAMA_TAG, '').replace(VOICE_CUE, dropped).trim()
}

/**
 * 开着台时她说的正文（markdown）：方括号语气提示同样只给嗓子听（owner 10-30「语音要情绪词，用户看不到」）。
 * ⚠ 代码块和行内代码里的方括号 ⛔ 动 —— 那是提示词（`[blue hair]`、NAI 的降权），不是语气。
 */
export function withoutVoiceCuesInProse(text: string): string {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(DRAMA_TAG, '')
            .replace(VOICE_CUE, (cut, offset: number, whole: string) =>
              /\n/.test(whole[offset - 1] ?? '\n')
                ? ''
                : dropped(cut, offset, whole),
            ),
    )
    .join('')
}

/** 藏掉的那一截两边：挨着中日文或在头尾就不留空，两边都是西文留一格。 */
function dropped(cut: string, offset: number, whole: string): string {
  const before = whole[offset - 1]
  const after = whole[offset + cut.length]
  if (!before || !after || CJK.test(before) || CJK.test(after)) return ''
  return ' '
}

/** 合上的那一段「我的想法」`<thought>…</thought>`（整段藏）。 */
const THOUGHT_BLOCK = /<thought>[\s\S]*?<\/thought>/g
/** 落单的 `<thought>` / `</thought>`：不知道到哪结束，只藏标签。 */
const THOUGHT_TAG = /<\/?thought>/g

/**
 * 「我的想法」只进想法那一栏（助手思考过程 C）：服务端只截开头那一段，模型写在别处的会漏进正文、
 * 进而被 🔊 念成素材库里的音频标题（11-17 真机 `<thought> 她要的…`）。展示时整段藏掉，落单的标签藏标签。
 */
export function withoutThoughtMarkup(text: string): string {
  if (!text.includes('thought>')) return text
  return text.replace(THOUGHT_BLOCK, '').replace(THOUGHT_TAG, '')
}

/**
 * **展示层唯一一道清洗**（11-17）：给人看的一段纯文字（素材库音频卡标题、对话气泡）里的内部标记全藏掉 ——
 * 「我的想法」`<thought>`、念的语气提示 `[happy]` / Drama 3 成对标签。⚠ 只管展示：存储、发给 TTS 的字照旧。
 * 带 markdown 的正文走 `withoutVoiceCuesInProse`（代码块里的方括号不动），想法照样先过 `withoutThoughtMarkup`。
 */
export function displayVoiceText(text: string): string {
  return withoutVoiceCues(withoutThoughtMarkup(text))
}

/** `*光翼暗了一点*`：单星号包住的一段（⛔ `**加粗**`、⛔ `* 列表`）。 */
const STAR_ACTION =
  /[ \t]*(?<![*\w])\*(?![\s*])[^*\n]{1,80}?(?<![\s*])\*(?![*\w])[ \t]*/g
/** `（笑）`、`(歪头)`：括号里只有几个中日文字的那种 —— 带数字、字母的（`（权重 0.8）`）照留。 */
const PAREN_ACTION =
  /[ \t]*[（(][\u3040-\u30ff\u3400-\u9fff、，…]{1,8}[）)][ \t]*/g

/**
 * 动作 / 旁白（`*光翼暗了一点*`、`（笑）`）：她是在发消息，不是在演戏（owner 10-30「分不出是 AI 在扮演」）。
 * 提示词已经不让写，漏出来的在这里兜住：气泡不显示、语音不念、下一轮的历史里也不留（⛔ 留着会被照着学）。
 * 方括号语气提示不归这里管（`withoutVoiceCues`）。
 */
export function withoutStageDirections(text: string): string {
  if (!text.includes('*') && !/[（(]/.test(text)) return text
  return text
    .replace(STAR_ACTION, dropped)
    .replace(PAREN_ACTION, dropped)
    .replace(/^[ \t]+|[ \t]+$/gm, '')
}

/** 一段回复按行拆成气泡（10-26 F：像发消息一样一句一条）；语气提示、动作藏掉，空行不算。 */
export function chatBubbles(text: string): string[] {
  // 想法段可能跨行：先整段藏掉再按行拆。
  return withoutThoughtMarkup(text)
    .split(/\n+/)
    .map((line) => displayVoiceText(withoutStageDirections(line)))
    .filter(Boolean)
}

export interface GreetingRun {
  /** `*动作*` / 旁白那一段（显示时去掉星号、用次要色）；否则是台词。 */
  action: boolean
  text: string
}

/** 开场白里的 `*动作*`：成对单星号之间的一段，⛔ 长度上限（卡作者的旁白动辄一整句）。 */
const GREETING_ACTION = /\*([^*\n]+)\*/g

/**
 * 卡上的开场白 → 段落 → 动作 / 台词（11-18 真机：拆成 7 个小气泡读着碎）。开场白是一整段叙事：
 * 整块显示，一行一段，`*动作*` 去掉星号用次要色、台词正常色。⚠ 动作一个都不洗 —— 它是卡作者写的，
 * 不是她漏出来的（`withoutStageDirections` 只管她自己的回复）。
 */
export function greetingParagraphs(text: string): GreetingRun[][] {
  return withoutThoughtMarkup(text)
    .split(/\n+/)
    .map((line) => displayVoiceText(line.trim()))
    .filter(Boolean)
    .map((line) => {
      const runs: GreetingRun[] = []
      let last = 0
      for (const match of line.matchAll(GREETING_ACTION)) {
        const before = line.slice(last, match.index).trim()
        if (before) runs.push({ action: false, text: before })
        const action = match[1]!.trim()
        if (action) runs.push({ action: true, text: action })
        last = match.index + match[0].length
      }
      const rest = line.slice(last).trim()
      if (rest) runs.push({ action: false, text: rest })
      return runs
    })
    .filter((runs) => runs.length > 0)
}

export type ChatBubblePart = string | { cite: number; url: string }

/**
 * 气泡是纯文字、不渲染 markdown：一行里的引用角标 `[[1]](地址)` 拆出来，由气泡画成能点的小角标（owner 11-05）。
 */
export function chatBubbleParts(line: string): ChatBubblePart[] {
  const parts: ChatBubblePart[] = []
  let last = 0
  for (const match of line.matchAll(CITATION)) {
    if (match.index > last) parts.push(line.slice(last, match.index))
    parts.push({ cite: Number(match[1]), url: match[2]! })
    last = match.index + match[0].length
  }
  if (last < line.length) parts.push(line.slice(last))
  return parts
}

/** 她发的表情包那一行（服务端换好的 `![表情](地址)`，4d）。 */
const STICKER_LINE = /^!\[表情\]\((\S+)\)$/

/**
 * 这一行是不是她发的表情包；是就回图片地址。⚠ 只认我们自己存储域名下的图（服务端换出来的都在那儿），
 * 模型自己写的外链图 ⛔ 画。
 */
export function stickerUrlOf(line: string): string | null {
  const url = STICKER_LINE.exec(line.trim())?.[1]
  const base = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  return url && base && url.startsWith(`${base}/`) ? url : null
}

const PICTURE_HANDLE = new RegExp(
  `(?:${GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE.IMAGE}|${GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE.VIDEO})${GENERATION_NAME.prefixSeparator}\\d{1,9}(?![0-9])`,
  'g',
)

/** 去掉作品号（`图_12`、`视频_3`）之后还剩的字。 */
export function withoutPictureHandles(text: string): string {
  return text
    .replace(PICTURE_HANDLE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([，。！？、,.!?])/g, '$1')
    .trim()
}

/**
 * 念出来的那段字（内核的回复会带作品号和 markdown）：作品号去掉、链接只念字、强调符号去掉。
 * 什么都不剩就照原文念（总比发一条空请求好）。
 */
export function spokenVoiceText(text: string, expressive = false): string {
  const spoken = withoutPictureHandles(
    normalizeVoiceCues(withoutStageDirections(text), expressive),
  )
    // 表情包那一行不念（4d）。
    .replace(/!\[表情\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    // ⚠ `>` 只去行首引用记号：`<whisper>…</whisper>` 里的 `>` 删了标签就合不上（10-30）。
    .replace(/[*_`#]+/g, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return spoken || text
}

/** 官方表里的词 → 文案键（`happy` → `happy`，`in a hurry tone` → `hurried`）。 */
const CUE_ID_BY_TAG: ReadonlyMap<string, string> = new Map(
  VOICE_CUE_GROUPS.flatMap((group) =>
    group.cues.map((cue) => [cue.tag, cue.id] as const),
  ),
)

/**
 * 一段台词里用了哪几个「语气」（配音台语气药丸显示用，11-17）：按出现顺序、去重，只认官方表里的词。
 * 语气就写在台词里（`[标记]`），药丸上显示的是从字里读出来的 —— ⛔ 另存一份「已选语气」状态（删了字药丸还亮着）。
 */
export function voiceCueIdsIn(text: string): string[] {
  const ids: string[] = []
  for (const match of text.matchAll(/\[([^[\]\n]{1,40})\]/g)) {
    const id = CUE_ID_BY_TAG.get(match[1]!.trim().toLowerCase())
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * 句首的方括号语气（`[whispering] [pause] 嘘……`）拆出来：配音台上灰色等宽字摆在前面、正文照常。
 * 句中的照原样留在正文里。
 */
export function leadingVoiceCues(text: string): {
  cues: string[]
  rest: string
} {
  const lead = /^\s*((?:\[[^\]\n]{1,40}\]\s*)+)/.exec(text)
  if (!lead) return { cues: [], rest: text }
  return {
    cues: lead[1].match(/\[[^\]\n]{1,40}\]/g) ?? [],
    rest: text.slice(lead[0].length),
  }
}
