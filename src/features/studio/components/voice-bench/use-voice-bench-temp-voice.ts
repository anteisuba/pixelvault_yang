'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { STUDIO_VOICE_QUERY } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import { getVoiceCardAPI } from '@/lib/api-client'

/** 配音台本次的临时音色（一张音色卡）。 */
export interface VoiceBenchTempVoice {
  id: string
  name: string
}

/**
 * 配音台**本次会话**的临时音色：声音库「用这副嗓子配音」（`?voice=<音色卡 id>`）/ 做同款带来的原音色。
 * - 念、台上列的台词都用它；⛔ 改角色卡上的绑定（要绑由用户点「绑到「角色」」，走 `usePersonaVoice().bind`）。
 * - 只住在组件 state：读完参数就从地址栏删掉，刷新 = 没有（⛔ 落库、⛔ 存 storage）。
 * - 卡查不到（不是我的 / 已删）= 不用它，说一句。
 */
export function useVoiceBenchTempVoice() {
  const t = useTranslations('VoiceBench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const voiceParam = searchParams.get(STUDIO_VOICE_QUERY)
  const [tempVoice, setTempVoice] = useState<VoiceBenchTempVoice | null>(null)
  const handled = useRef<string | null>(null)
  const latestT = useRef(t)
  useEffect(() => {
    latestT.current = t
  })

  useEffect(() => {
    if (!voiceParam || handled.current === voiceParam) return
    handled.current = voiceParam
    const query = new URLSearchParams(searchParams.toString())
    query.delete(STUDIO_VOICE_QUERY)
    const rest = query.toString()
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })
    void getVoiceCardAPI(voiceParam).then((result) => {
      if (result.success && result.data)
        setTempVoice({ id: result.data.id, name: result.data.name })
      else toast.error(latestT.current('tempVoiceUnavailable'))
    })
  }, [pathname, router, searchParams, voiceParam])

  return { tempVoice, setTempVoice }
}
