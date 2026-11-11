import { CHAT_MOOD } from '@/constants/chat-voice'
import type { PromptAssistantResponseLanguage } from '@/types'
import type { ChatPlan } from '@/types/chat-mood'

/**
 * 「我的想法」（助手思考过程 C，owner 11-11）：主模型每次开口先写一段 `<thought>…</thought>`，
 * 一行一句，第一人称。这里把流过来的字切成两路 —— 想法一句一句交出去（只进「我的想法」），
 * 其余照旧是正文。⚠ 想法 ⛔ 进正文、⛔ 进定稿帧、⛔ 进接力条里的那段话。
 *
 * 规则：
 *  · 只认**开头**那一段（前面只许有空白）；开头不是 `<thought>` 就整段都是正文，原样放行。
 *  · 开头可能还没到齐（`<th` 卡在一个分片末尾）：先攒着，能判了再放。
 *  · 想法里一行一句，换行就交一句；`</thought>` 之后的才是正文（去掉开头的空白）。
 *  · 流结束时想法还没闭合：攒着的那句照样交出去，正文为空（宁可少一句话，⛔ 把想法当正文发出去）。
 */

const OPEN = '<thought>'
const CLOSE = '</thought>'

export interface ThoughtSplit {
  /** 这一下能放给正文的字（可能为空）。 */
  readonly reply: string
  /** 这一下写完的几句想法（已去空白、去空行）。 */
  readonly thoughts: readonly string[]
}

export interface ThoughtSplitter {
  push(text: string): ThoughtSplit
  /** 流结束：把攒着的都交出去。 */
  end(): ThoughtSplit
}

export function createThoughtSplitter(
  options: { maxLineChars?: number } = {},
): ThoughtSplitter {
  const maxLineChars = options.maxLineChars ?? 400
  let mode: 'probe' | 'thought' | 'reply' = 'probe'
  let buffer = ''
  let trimReplyStart = false

  const line = (text: string) => text.trim().slice(0, maxLineChars)
  const lines = (text: string) =>
    text
      .split('\n')
      .map(line)
      .filter((item) => item.length > 0)

  const toReply = (text: string): string => {
    if (!trimReplyStart) return text
    const trimmed = text.replace(/^\s+/, '')
    if (trimmed) trimReplyStart = false
    return trimmed
  }

  const drainThought = (): ThoughtSplit => {
    const close = buffer.indexOf(CLOSE)
    if (close >= 0) {
      const thoughts = lines(buffer.slice(0, close))
      const rest = buffer.slice(close + CLOSE.length)
      buffer = ''
      mode = 'reply'
      trimReplyStart = true
      return { reply: toReply(rest), thoughts }
    }
    // 还没闭合：交出写完的整行，留下最后半行（⚠ 半行里可能是没到齐的 `</thou`）。
    const lastBreak = buffer.lastIndexOf('\n')
    if (lastBreak < 0) return { reply: '', thoughts: [] }
    const thoughts = lines(buffer.slice(0, lastBreak))
    buffer = buffer.slice(lastBreak + 1)
    return { reply: '', thoughts }
  }

  return {
    push(text) {
      if (!text) return { reply: '', thoughts: [] }
      if (mode === 'reply') return { reply: toReply(text), thoughts: [] }
      buffer += text
      if (mode === 'probe') {
        const head = buffer.replace(/^\s+/, '')
        if (head.length < OPEN.length && OPEN.startsWith(head))
          return { reply: '', thoughts: [] }
        if (!head.startsWith(OPEN)) {
          mode = 'reply'
          const all = buffer
          buffer = ''
          return { reply: all, thoughts: [] }
        }
        mode = 'thought'
        buffer = head.slice(OPEN.length)
      }
      return drainThought()
    },
    end() {
      if (mode === 'probe') {
        const all = buffer
        buffer = ''
        mode = 'reply'
        return { reply: all, thoughts: [] }
      }
      if (mode === 'thought') {
        const close = buffer.indexOf(CLOSE)
        if (close >= 0) return drainThought()
        const thoughts = lines(buffer)
        buffer = ''
        mode = 'reply'
        return { reply: '', thoughts }
      }
      return { reply: '', thoughts: [] }
    },
  }
}

/**
 * 聊天档的「我的想法」（助手思考过程 C）：直接用回复之前想的那一步（`ChatPlan`：心情、强度、为什么、
 * 怎么接、回几句），⛔ 再让主模型另写 —— 🔬 11-11 实跑：角色卡那套「只写要发出去的话」压着，
 * 主模型多半不写；而那一步本来就是「情况 → 决定」（owner 图一那条记录）。
 * 强度照实际刻度写（0–`maxIntensity`）。
 */
export function chatPlanThoughts(
  plan: ChatPlan,
  language: PromptAssistantResponseLanguage,
): string[] {
  const text = CHAT_PLAN_THOUGHTS[language]
  const brief = plan.reply === 'brief'
  const lines = [
    plan.why ? text.why(plan.why) : null,
    text.feel(plan.mood, plan.intensity, CHAT_MOOD.maxIntensity),
    plan.stance ? text.stance(plan.stance, brief) : brief ? text.brief : null,
  ]
  return lines.filter((line): line is string => Boolean(line))
}

/** 句末补一个句号（原话已经带标点就不补）。 */
const ended = (line: string, stop: string) =>
  /[。！？!?.…~～]$/.test(line) ? line : `${line}${stop}`

const CHAT_PLAN_THOUGHTS: Record<
  PromptAssistantResponseLanguage,
  {
    why(why: string): string
    feel(mood: string, intensity: number, max: number): string
    stance(stance: string, brief: boolean): string
    brief: string
  }
> = {
  chinese: {
    why: (why) => ended(why, '。'),
    feel: (mood, n, max) =>
      n > 0 ? `我现在**${mood}（${n}/${max}）**。` : `我现在挺${mood}。`,
    stance: (stance, brief) =>
      `所以**${stance}**${brief ? '，只回几个字' : ''}。`,
    brief: '不太想多说，**只回几个字**。',
  },
  japanese: {
    why: (why) => ended(why, '。'),
    feel: (mood, n, max) =>
      n > 0 ? `今の気分は**${mood}（${n}/${max}）**。` : `今は${mood}。`,
    stance: (stance, brief) =>
      `だから**${stance}**${brief ? '、短く返す' : ''}。`,
    brief: 'あまり話す気分じゃない、**短く返す**。',
  },
  english: {
    why: (why) => ended(why, '.'),
    feel: (mood, n, max) =>
      n > 0 ? `I feel **${mood} (${n}/${max})**.` : `I feel ${mood}.`,
    stance: (stance, brief) =>
      `So **${stance}**${brief ? ', just a few words' : ''}.`,
    brief: 'Not in the mood to say much: **just a few words**.',
  },
}
