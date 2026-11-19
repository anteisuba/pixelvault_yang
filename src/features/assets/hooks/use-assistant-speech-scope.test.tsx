import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_ASSISTANT_SPEECH_STORAGE_KEY } from '@/constants/assets-grid'
import type { GalleryFilters } from '@/hooks/use-gallery'

import {
  isAudioOnlyTypes,
  useAssistantSpeechScope,
} from './use-assistant-speech-scope'

const base: GalleryFilters = {
  search: '',
  models: [],
  sort: 'newest',
  types: [],
  timeRange: 'all',
  liked: false,
  published: false,
  projectId: '',
  provider: '',
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('useAssistantSpeechScope（素材库「含助手朗读」，11-19）', () => {
  it('只有「恰好只看音频」才算音频分段', () => {
    expect(isAudioOnlyTypes(['audio'])).toBe(true)
    expect(isAudioOnlyTypes([])).toBe(false)
    expect(isAudioOnlyTypes(['audio', 'image'])).toBe(false)
  })

  it('默认关：切到音频也不带朗读，⛔ 多取一次', () => {
    const setGallery = vi.fn()
    const { result } = renderHook(() =>
      useAssistantSpeechScope(base, setGallery),
    )
    expect(result.current.speechPrefOn).toBe(false)
    expect(setGallery).not.toHaveBeenCalled()
    act(() => result.current.setFilters({ ...base, types: ['audio'] }))
    expect(setGallery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        types: ['audio'],
        includeAssistantSpeech: false,
      }),
    )
  })

  it('音频分段里打开：记进本机偏好，并按新口径重取（带朗读）', () => {
    const setGallery = vi.fn()
    const audio = { ...base, types: ['audio'] } satisfies GalleryFilters
    const { result } = renderHook(() =>
      useAssistantSpeechScope(audio, setGallery),
    )
    act(() => result.current.setSpeechPrefOn(true))
    expect(
      window.localStorage.getItem(ASSET_ASSISTANT_SPEECH_STORAGE_KEY),
    ).toBe('1')
    expect(setGallery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeAssistantSpeech: true }),
    )
  })

  it('开着时切走音频 / 清空类型：自动不带（不靠各处自己记得清）', () => {
    window.localStorage.setItem(ASSET_ASSISTANT_SPEECH_STORAGE_KEY, '1')
    const setGallery = vi.fn()
    const audio = {
      ...base,
      types: ['audio'],
      includeAssistantSpeech: true,
    } satisfies GalleryFilters
    const { result } = renderHook(() =>
      useAssistantSpeechScope(audio, setGallery),
    )
    expect(setGallery).not.toHaveBeenCalled()
    act(() => result.current.setFilters({ ...audio, types: [] }))
    expect(setGallery).toHaveBeenLastCalledWith(
      expect.objectContaining({ types: [], includeAssistantSpeech: false }),
    )
  })

  it('首屏筛选不知道偏好（SSR）：偏好是开的就补取一次', () => {
    window.localStorage.setItem(ASSET_ASSISTANT_SPEECH_STORAGE_KEY, '1')
    const setGallery = vi.fn()
    renderHook(() =>
      useAssistantSpeechScope({ ...base, types: ['audio'] }, setGallery),
    )
    expect(setGallery).toHaveBeenCalledTimes(1)
    expect(setGallery).toHaveBeenCalledWith(
      expect.objectContaining({ includeAssistantSpeech: true }),
    )
  })
})
