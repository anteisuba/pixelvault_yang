import { DRAMA_PAIRED_TAGS } from '@/constants/chat-voice'
import {
  GENERATION_NAME,
  GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE,
} from '@/constants/generation-naming'

/**
 * 她在对话里说的话怎么摆、怎么念（②c，聊天并回对话）——纯函数，前后端共用。
 */

/**
 * 念出来的语气（方括号提示 / Drama 3 的中文提示与成对标签）：助手内核聊天（`chatVoice`）时拼进提示词。
 * 没有这段她不写方括号，念出来就没了情绪（用户 10-26「语音念出来的情绪」）。
 */
export function voiceCueRules(expressive: boolean): string {
  return `- Everything you write is spoken aloud in your voice, and the voice can act out short cues in square brackets (only square brackets — never *asterisks* or narration of what you do), at the start of a sentence or in the middle of it: [laughing], [whispering], [sighs], [pause], [excited], [softly]. Use them where a real person's voice would change — that is how your feelings come through. A sound needs its words after the cue — [laughing] Ha ha, you got me.${
    expressive
      ? `\n- Your voice also understands cues written in your own language ([压低声音，带着笑意]) and paired tags that change only the words inside them: ${DRAMA_PAIRED_TAGS.map((tag) => `<${tag}>…</${tag}>`).join(' ')}.`
      : ''
  }`
}

const VOICE_CUE = /[ \t]*\[[^\]\n]{1,40}\](?!\()[ \t]*/g
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

/** 藏掉的那一截两边：挨着中日文或在头尾就不留空，两边都是西文留一格。 */
function dropped(cut: string, offset: number, whole: string): string {
  const before = whole[offset - 1]
  const after = whole[offset + cut.length]
  if (!before || !after || CJK.test(before) || CJK.test(after)) return ''
  return ' '
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
  return text
    .split(/\n+/)
    .map((line) => withoutVoiceCues(withoutStageDirections(line)))
    .filter(Boolean)
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
export function spokenVoiceText(text: string): string {
  const spoken = withoutPictureHandles(withoutStageDirections(text))
    // 表情包那一行不念（4d）。
    .replace(/!\[表情\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return spoken || text
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
