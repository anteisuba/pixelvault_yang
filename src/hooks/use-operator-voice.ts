'use client'

import { useSyncExternalStore } from 'react'

import {
  STUDIO_OPERATOR_VOICE,
  type StudioOperatorVoiceModelId,
} from '@/constants/studio-operator-voice'
import { checkAudioStatusAPI, speakAssistantReplyAPI } from '@/lib/api-client'
import { setOperatorMessageVoice } from '@/hooks/use-studio-operator-store'

/**
 * 对话里 🔊 念她的回复（②c-2，样件 v5）：开关 + 型号记在这台设备上；开着时她每说完一段，
 * 派一条念的任务、等它好、自动放。念好的那条也进素材库（和音频工作台同一条链路）。
 *
 * 同一时刻只放一段：新的一段开始放，上一段停。
 */

interface OperatorVoicePrefs {
  on: boolean
  modelId: StudioOperatorVoiceModelId
}

const DEFAULT_PREFS: OperatorVoicePrefs = {
  on: false,
  modelId: STUDIO_OPERATOR_VOICE.defaultModelId,
}

let prefs: OperatorVoicePrefs | null = null
const listeners = new Set<() => void>()

function readPrefs(): OperatorVoicePrefs {
  if (prefs) return prefs
  prefs = DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(STUDIO_OPERATOR_VOICE.storageKey)
    const parsed = raw ? (JSON.parse(raw) as Partial<OperatorVoicePrefs>) : {}
    prefs = {
      on: parsed.on === true,
      modelId: (STUDIO_OPERATOR_VOICE.modelIds as readonly string[]).includes(
        parsed.modelId ?? '',
      )
        ? (parsed.modelId as StudioOperatorVoiceModelId)
        : DEFAULT_PREFS.modelId,
    }
  } catch {
    // 读不到就按默认（关着）。
  }
  return prefs
}

function writePrefs(next: OperatorVoicePrefs): void {
  prefs = next
  try {
    window.localStorage.setItem(
      STUDIO_OPERATOR_VOICE.storageKey,
      JSON.stringify(next),
    )
  } catch {
    // 存不住就只管这一次。
  }
  if (!next.on) stopOperatorVoice()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getOperatorVoicePrefs(): OperatorVoicePrefs {
  return typeof window === 'undefined' ? DEFAULT_PREFS : readPrefs()
}

export function useOperatorVoice() {
  const current = useSyncExternalStore(
    subscribe,
    getOperatorVoicePrefs,
    () => DEFAULT_PREFS,
  )
  return {
    ...current,
    setOn: (on: boolean) => writePrefs({ ...getOperatorVoicePrefs(), on }),
    setModel: (modelId: StudioOperatorVoiceModelId) =>
      writePrefs({ ...getOperatorVoicePrefs(), modelId }),
  }
}

/* ── 放 ─────────────────────────────────────────────────────────── */

let audio: HTMLAudioElement | null = null
let playingId: string | null = null
const playListeners = new Set<() => void>()

function setPlaying(id: string | null): void {
  playingId = id
  for (const listener of playListeners) listener()
}

export function playOperatorVoice(id: string, url: string): void {
  audio?.pause()
  audio = new Audio(url)
  audio.onended = () => setPlaying(null)
  audio.onpause = () => {
    if (playingId === id) setPlaying(null)
  }
  setPlaying(id)
  // 浏览器拦了自动播放（没和页面交互过）：留着 ▶ 让人自己点。
  void audio.play().catch(() => setPlaying(null))
}

export function stopOperatorVoice(): void {
  audio?.pause()
  audio = null
  setPlaying(null)
}

/** 现在在放哪一段（正文条目 id）。 */
export function usePlayingOperatorVoice(): string | null {
  return useSyncExternalStore(
    (listener) => {
      playListeners.add(listener)
      return () => playListeners.delete(listener)
    },
    () => playingId,
    () => null,
  )
}

/* ── 念 ─────────────────────────────────────────────────────────── */

/**
 * 念一段：派任务 → 等它好 → 放。状态记在那条正文上（`voice`）。
 * 缺 key / 没绑嗓子不算坏了：条目上标出来，界面就地给配 / 给挑。
 */
export async function speakOperatorReply(
  id: string,
  text: string,
): Promise<void> {
  setOperatorMessageVoice(id, { status: 'pending' })
  const submitted = await speakAssistantReplyAPI({
    text,
    modelId: getOperatorVoicePrefs().modelId,
  })
  if (!submitted.success) {
    setOperatorMessageVoice(id, {
      status:
        submitted.errorCode === 'MISSING_API_KEY'
          ? 'needsKey'
          : submitted.errorCode === 'ASSISTANT_VOICE_UNBOUND'
            ? 'unbound'
            : 'failed',
    })
    return
  }
  const { jobId } = submitted.data
  for (let tries = 0; tries < STUDIO_OPERATOR_VOICE.pollMaxTries; tries += 1) {
    await new Promise((resolve) =>
      window.setTimeout(resolve, STUDIO_OPERATOR_VOICE.pollMs),
    )
    const status = await checkAudioStatusAPI(jobId)
    const data = status.data
    if (!status.success || !data || data.status === 'FAILED') break
    if (data.status === 'COMPLETED') {
      setOperatorMessageVoice(id, { status: 'ready', url: data.generation.url })
      // 关掉了就只记着，⛔ 自己响。
      if (getOperatorVoicePrefs().on) playOperatorVoice(id, data.generation.url)
      return
    }
  }
  setOperatorMessageVoice(id, { status: 'failed' })
}
