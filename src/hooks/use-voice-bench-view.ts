'use client'

import { useEffect } from 'react'

import {
  ASSISTANT_VOICE_BENCH_VIEW_LIMITS as LIMITS,
  AssistantVoiceBenchViewSchema,
  type AssistantVoiceBenchView,
} from '@/types/assistant-operator'

/**
 * 配音台报一句「此刻的样子」（11-17：配音台没有宿主，助手看不见台词框）。
 *
 * ⭐ 与 `use-library-view.ts` 同一种旁路：模块级、发请求时现读（`readVoiceBenchView`），
 *   ⛔ 不为它重渲染；配音台卸掉时收回。⛔ 不是宿主：不给写入 / 念的手（理由见 schema 头注）。
 */
let view: AssistantVoiceBenchView | null = null

/** 把配音台的原始状态收成过得了请求 schema 的那一份（超长的截掉）；不合规 = `null`。 */
export function toVoiceBenchView(input: {
  voice?: string | null
  model: string
  speed: number
  draft: string
  recent: readonly string[]
}): AssistantVoiceBenchView | null {
  const voice = input.voice?.trim()
  const parsed = AssistantVoiceBenchViewSchema.safeParse({
    ...(voice ? { voice: voice.slice(0, 120) } : {}),
    model: input.model,
    speed: input.speed,
    draft: input.draft.slice(0, LIMITS.draftChars),
    recent: input.recent
      .map((line) => line.trim().slice(0, LIMITS.lineChars).trim())
      .filter(Boolean)
      .slice(-LIMITS.recentLines),
  })
  return parsed.success ? parsed.data : null
}

/** 配音台每次渲染报一次（值没变的那几次只是同一份覆盖）；卸掉时清。 */
export function useReportVoiceBench(
  next: AssistantVoiceBenchView | null,
): void {
  useEffect(() => {
    view = next
  }, [next])
  useEffect(
    () => () => {
      view = null
    },
    [],
  )
}

/** 发请求时现读：不在配音台 = `null`。 */
export function readVoiceBenchView(): AssistantVoiceBenchView | null {
  return view
}
