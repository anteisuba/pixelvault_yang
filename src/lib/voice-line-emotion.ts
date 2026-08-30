import {
  VOICE_LINE_EMOTION_ALIASES,
  VOICE_LINE_EMOTION_PATTERN,
} from '@/constants/voiceroom'
import type { AudioEmotion } from '@/constants/voice-cards'

/** 一条台词被拆成的两半：念出来的字，和怎么念。 */
export interface ParsedVoiceLine {
  /** 净台词——句首的情感括号已剥离。可能为空串（用户只写了个括号）。 */
  text: string
  /** null = 自动，不注入任何情感提示词，由模型按文本自己判断。 */
  emotion: AudioEmotion | null
}

/**
 * 把「（耳语）别回头」拆成 `{ text: '别回头', emotion: 'whisper' }`。
 *
 * 这是 owner 2026-08-29 那条「情感融进提示词」拍板的落点：配音间里没有情感
 * 选择器，情感是**写在句子里**的，由这个函数认出来。
 *
 * 三条刻意的行为：
 *
 * 1. **只看句首，只剥一个**。「（耳语）（兴奋）别回头」剥掉「耳语」就停——两个
 *    情感本来就是矛盾的，全吃掉等于替用户做了个他没做的决定。
 * 2. **认不出的括号原样保留**。「（他压低声音）别回头」里那句是叙述不是情感档，
 *    宁可原样念出来，也不要悄悄吞掉用户写的字。
 * 3. **剥完可能是空串**，函数不管——「台词不能为空」是调用方的校验，在这里
 *    兜底只会让空气泡变成一条静默失败的生成。
 */
export function parseVoiceLineEmotion(raw: string): ParsedVoiceLine {
  const input = raw ?? ''
  const match = VOICE_LINE_EMOTION_PATTERN.exec(input)

  if (!match) {
    return { text: input.trim(), emotion: null }
  }

  const alias = match[1].trim().toLowerCase()
  const emotion = VOICE_LINE_EMOTION_ALIASES[alias]

  // 括号里不是情感词 —— 那是台词的一部分，整句原样返回。
  if (!emotion) {
    return { text: input.trim(), emotion: null }
  }

  return { text: input.slice(match[0].length).trim(), emotion }
}
