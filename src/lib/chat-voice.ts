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
  return `- Everything you write is spoken aloud in your voice, and the voice can act out short cues in square brackets, at the start of a sentence or in the middle of it: [laughing], [whispering], [sighs], [pause], [excited], [softly]. Use them where a real person's voice would change — that is how your feelings come through. A sound needs its words after the cue — [laughing] Ha ha, you got me.${
    expressive
      ? `\n- Your voice also understands cues written in your own language ([压低声音，带着笑意]) and paired tags that change only the words inside them: ${DRAMA_PAIRED_TAGS.map((tag) => `<${tag}>…</${tag}>`).join(' ')}.`
      : ''
  }`
}

/** 一段回复按行拆成气泡（10-26 F：像发消息一样一句一条）；空行不算。 */
export function chatBubbles(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
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
  const spoken = withoutPictureHandles(text)
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return spoken || text
}
