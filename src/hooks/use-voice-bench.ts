'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { SPEAK_SOURCE, VOICE_BENCH } from '@/constants/studio-operator-voice'
import {
  getOperatorVoicePrefs,
  playOperatorVoice,
  waitForAudioJob,
} from '@/features/assistant/hooks'
import { getVoiceBenchAPI, speakAssistantReplyAPI } from '@/lib/api-client'
import type { VoiceBenchData } from '@/types/voice-bench'

/** 还没念好的那一句（念好了就从素材库里读回来，换成真的那一行）。 */
export interface VoiceBenchPending {
  key: string
  text: string
  /**
   * `unbound` = 她还没嗓子（就地挑）；`needsKey` = 缺 Fish key（就地配）；
   * `unlisted` = 念好了（已计费）但重读的列表里还没有它 —— 留着这一行能放（`url`），⛔ 无声消失（11-17）。
   */
  status: 'pending' | 'failed' | 'unbound' | 'needsKey' | 'unlisted'
  /** 语速（配音台「语速」药丸）；不给 = 默认念法。重念沿用这一句当时的语速。 */
  speed?: number
  /** `unlisted` 时念好的那条音频。 */
  url?: string
}

/** 打了几行就是几句（一行一句），太长的截掉。 */
export function voiceBenchLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim().slice(0, VOICE_BENCH.lineMaxChars))
    .filter(Boolean)
}

let pendingSeq = 0

/**
 * 配音台（③）：台上那几句 = 素材库里她这副嗓子念过的音频（⛔ 另存台词表，用户 10-26）。
 * 念一句 = 派任务 → 等它好 → 重新读一遍列表、放刚念好的那条。想改哪句：↻ 放回输入框改了再念（新的一条，旧的留着）。
 *
 * `personaKey` 变了（换人 / 换嗓子）就重新读。
 * `tempVoiceCardId` = 本次的临时音色（声音库「用这副嗓子配音」/ 做同款带来的原音色）：台上读它念过的、
 * 念也用它（⛔ 改角色卡绑定）；不给 = 角色绑的那副。
 */
export function useVoiceBench(personaKey: string, tempVoiceCardId?: string) {
  const [data, setData] = useState<VoiceBenchData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<VoiceBenchPending[]>([])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async (): Promise<VoiceBenchData | null> => {
    const result = await getVoiceBenchAPI(tempVoiceCardId)
    if (!alive.current) return null
    if (!result.success) {
      setError(result.error)
      return null
    }
    setData(result.data)
    setError(null)
    // 先前没在列表里的那几句，这回读到了就换成真的那一行。
    const listed = new Set(result.data.lines.map((line) => line.url))
    setPending((list) =>
      list.some((item) => item.url && listed.has(item.url))
        ? list.filter((item) => !(item.url && listed.has(item.url)))
        : list,
    )
    return result.data
  }, [tempVoiceCardId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 换人后重新向服务端取一次（外部系统），不是级联推导
    void refresh()
  }, [personaKey, refresh])

  const patch = (key: string, next: Partial<VoiceBenchPending> | null) =>
    setPending((list) =>
      next === null
        ? list.filter((item) => item.key !== key)
        : list.map((item) => (item.key === key ? { ...item, ...next } : item)),
    )

  const run = useCallback(
    async (item: VoiceBenchPending) => {
      const submitted = await speakAssistantReplyAPI({
        text: item.text,
        modelId: getOperatorVoicePrefs().modelId,
        ...(item.speed !== undefined ? { speed: item.speed } : {}),
        // 配音台念的台词是用户作品：素材库照常显示。
        source: SPEAK_SOURCE.VOICE_BENCH,
        ...(tempVoiceCardId ? { voiceCardId: tempVoiceCardId } : {}),
      })
      if (!submitted.success) {
        patch(item.key, {
          status:
            submitted.errorCode === 'MISSING_API_KEY'
              ? 'needsKey'
              : submitted.errorCode === 'ASSISTANT_VOICE_UNBOUND'
                ? 'unbound'
                : 'failed',
        })
        return
      }
      const url = await waitForAudioJob(submitted.data.jobId)
      if (!alive.current) return
      if (!url) {
        patch(item.key, { status: 'failed' })
        return
      }
      const fresh = await refresh()
      if (!alive.current) return
      // 念好就放一遍（和对话里 🔊 一样）；放的那一行按素材库里那条认。
      const line = fresh?.lines.find((entry) => entry.url === url)
      // 列表里找不到它（还没落库 / 读列表失败）：⛔ 删掉 —— 钱已经花了。留成能放的一行，下次读到再换。
      patch(item.key, line ? null : { status: 'unlisted', url })
      playOperatorVoice(line?.id ?? item.key, url)
    },
    [refresh, tempVoiceCardId],
  )

  /** 念：打了几行就排几句，一句念完再念下一句（顺序就是台上的顺序）。 */
  const speak = useCallback(
    async (text: string, speed?: number) => {
      const items = voiceBenchLines(text).map(
        (line): VoiceBenchPending => ({
          key: `p${(pendingSeq += 1)}`,
          text: line,
          status: 'pending',
          ...(speed !== undefined ? { speed } : {}),
        }),
      )
      setPending((list) => [...list, ...items])
      for (const item of items) await run(item)
    },
    [run],
  )

  /** 没念出来那句再念一次（刚挑完嗓子 / 刚配好 key 也走它）。 */
  const retry = useCallback(
    (key: string) => {
      const item = pending.find((entry) => entry.key === key)
      if (!item) return
      patch(key, { status: 'pending' })
      void run({ ...item, status: 'pending' })
    },
    [pending, run],
  )

  return {
    data,
    error,
    loading: data === null && error === null,
    pending,
    speak,
    retry,
    refresh,
  }
}
