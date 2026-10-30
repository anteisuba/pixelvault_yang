'use client'

import { useEffect, useState } from 'react'

import { getVoiceCardAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { VoiceCardRecord } from '@/types'

/**
 * 角色人物组「声音」格要显示的那张音色卡（第 ② 步）：名字、头像、试听用的示例。
 * 没绑 / 读不到 = `null`（格子写「还没挑」）。
 */
export function useVoiceCardDetail(voiceCardId: string | null) {
  const [loaded, setLoaded] = useState<VoiceCardRecord | null>(null)

  useEffect(() => {
    if (!voiceCardId) return
    let alive = true
    const cancel = deferEffectTask(() => {
      void getVoiceCardAPI(voiceCardId).then((result) => {
        if (alive && result.success && result.data) setLoaded(result.data)
      })
    })
    return () => {
      alive = false
      cancel()
    }
  }, [voiceCardId])

  return loaded && loaded.id === voiceCardId ? loaded : null
}
