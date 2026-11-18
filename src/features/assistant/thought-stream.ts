import { CHAT_MOOD } from '@/constants/chat-voice'
import type { PromptAssistantResponseLanguage } from '@/types'
import type { ChatPlan } from '@/types/chat-mood'

/**
 * 「我的想法」（助手思考过程 C，owner 11-11）的两个来源：
 *  · 干活档 = **模型原生的思考摘要**（11-17 起；Claude adaptive `display: summarized`、Gemini
 *    `includeThoughts` 等由 SDK 以 `reasoning-delta` 流出）。⛔ 再让模型在正文开头手写 `<thought>`：
 *    思考付两份输出 token，步中间再写的那段还会原样漏进正文、素材标题与语音。
 *    没有原生思考的接法 = 不显示想法（只剩「想了 N 秒」的计时）。
 *  · 聊天档 = 回复之前想的那一步（`chatPlanThoughts`）。
 *
 * 这里把思考摘要的字流切成「我的想法」里的一句一句：
 *  · 一行一句（空行不算）；独占一行的加粗小标题（`**Planning the edit**`）和它下面那一行并成一句
 *    （小标题加深、正文照常 —— 「我的想法」那一栏本来就把 `**…**` 画成加深）。
 *  · 半行先攒着，换行才交；一段思考结束（`end`）把攒着的都交出去。
 *  · 一句太长截到上限（带省略号）。
 */

export interface ReasoningLines {
  /** 又流来一段思考摘要：交出这一下写完的几句。 */
  push(text: string): string[]
  /** 这一段思考结束（开口 / 调工具 / 流结束）：把攒着的都交出去。 */
  end(): string[]
}

const HEADING = /^\*\*[^*\n]+\*\*$/

export function createReasoningLines(
  options: { maxLineChars?: number } = {},
): ReasoningLines {
  const maxLineChars = options.maxLineChars ?? 400
  let buffer = ''
  /** 等下一行来并在一起的小标题。 */
  let heading: string | null = null

  const clip = (line: string) =>
    line.length > maxLineChars ? `${line.slice(0, maxLineChars - 1)}…` : line

  const take = (raw: string): string[] => {
    const line = raw.trim()
    if (!line) return []
    if (HEADING.test(line)) {
      const out = heading ? [clip(heading)] : []
      heading = line
      return out
    }
    if (heading) {
      const merged = `${heading} ${line}`
      heading = null
      return [clip(merged)]
    }
    return [clip(line)]
  }

  return {
    push(text) {
      if (!text) return []
      buffer += text
      const lastBreak = buffer.lastIndexOf('\n')
      if (lastBreak < 0) return []
      const done = buffer.slice(0, lastBreak).split('\n')
      buffer = buffer.slice(lastBreak + 1)
      return done.flatMap(take)
    },
    end() {
      const out = take(buffer)
      buffer = ''
      if (heading) {
        out.push(clip(heading))
        heading = null
      }
      return out
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
