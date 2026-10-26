'use client'

import { useEffect, useState } from 'react'

import { useChatPersona } from '@/hooks/use-chat-persona'
import { getVoiceCardAPI, updateCharacterCardAPI } from '@/lib/api-client'

/**
 * 她现在用哪副嗓子（设置里那位角色绑的那张音色卡）、换一副。
 * 换完就写回角色卡：配音台、素材库认的也是这一副。
 */
export function usePersonaVoice() {
  const { ref, name } = useChatPersona()
  const [picked, setPicked] = useState<{
    characterCardId: string
    voiceCardId: string
    name: string
  } | null>(null)
  const current =
    picked && picked.characterCardId === ref.characterCardId ? picked : null
  const voiceCardId = current?.voiceCardId ?? ref.voiceCardId
  const [loaded, setLoaded] = useState<{ id: string; name: string } | null>(
    null,
  )
  useEffect(() => {
    if (!voiceCardId || current) return
    let active = true
    void getVoiceCardAPI(voiceCardId).then((result) => {
      if (active && result.success && result.data)
        setLoaded({ id: voiceCardId, name: result.data.name })
    })
    return () => {
      active = false
    }
  }, [voiceCardId, current])

  const voiceName =
    current?.name ?? (loaded?.id === voiceCardId ? loaded.name : null)
  const bind = async (card: { id: string; name: string }) => {
    if (!ref.characterCardId) return false
    const result = await updateCharacterCardAPI(ref.characterCardId, {
      voiceCardId: card.id,
    })
    if (!result.success) return false
    setPicked({
      characterCardId: ref.characterCardId,
      voiceCardId: card.id,
      name: card.name,
    })
    return true
  }
  return {
    characterCardId: ref.characterCardId,
    personaName: name,
    voiceCardId,
    voiceName,
    bind,
  }
}
