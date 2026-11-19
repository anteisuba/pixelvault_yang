'use client'

import { useCallback, useEffect } from 'react'

import { ASSET_ASSISTANT_SPEECH_STORAGE_KEY } from '@/constants/assets-grid'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { useLocalPreference } from '@/hooks/use-local-preference'
import type { OutputTypeValue } from '@/types'

/** 类型分面恰好是「音频」一项（「含助手朗读」开关只在这时生效）。 */
export function isAudioOnlyTypes(types: readonly OutputTypeValue[]): boolean {
  return types.length === 1 && types[0] === 'audio'
}

/**
 * 素材库「含助手朗读」（11-19）：对话里 🔊 念的回复默认不进任何视图；只有类型分面恰好是
 * 「音频」且开关开着时才列出来。开关存在本机偏好里（默认关）。
 *
 * ⭐ 宿主所有改筛选的地方都经这里返回的 `setFilters`：由它按「开关 × 是否只看音频」算出
 * `includeAssistantSpeech` —— 切走音频 / 清空筛选时自动不带，⛔ 各处自己记得清。
 * 偏好读到了 / 改了而当前筛选还是另一个口径（首屏 SSR 不知道这条偏好）时，按新口径重取一次。
 */
export function useAssistantSpeechScope(
  filters: GalleryFilters,
  setGalleryFilters: (next: GalleryFilters) => void,
) {
  const [stored, setStored] = useLocalPreference(
    ASSET_ASSISTANT_SPEECH_STORAGE_KEY,
  )
  const speechPrefOn = stored === '1'
  const setFilters = useCallback(
    (next: GalleryFilters) =>
      setGalleryFilters({
        ...next,
        includeAssistantSpeech: speechPrefOn && isAudioOnlyTypes(next.types),
      }),
    [setGalleryFilters, speechPrefOn],
  )
  const audioOnly = isAudioOnlyTypes(filters.types)
  const includeAssistantSpeech = filters.includeAssistantSpeech === true

  useEffect(() => {
    if (includeAssistantSpeech !== (speechPrefOn && audioOnly)) {
      setFilters(filters)
    }
  }, [audioOnly, filters, includeAssistantSpeech, setFilters, speechPrefOn])

  const setSpeechPrefOn = useCallback(
    (on: boolean) => setStored(on ? '1' : '0'),
    [setStored],
  )

  return {
    setFilters,
    audioOnly,
    includeAssistantSpeech,
    speechPrefOn,
    setSpeechPrefOn,
  }
}
