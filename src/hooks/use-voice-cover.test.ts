import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getVoiceSpy = vi.hoisted(() =>
  vi.fn(async (voiceId: string) => ({
    success: true,
    data: { coverImage: `https://cover.test/${voiceId}.png` },
  })),
)
vi.mock('@/lib/api-client', () => ({ getVoiceAPI: getVoiceSpy }))

import { rememberVoiceCovers, useVoiceCover } from '@/hooks/use-voice-cover'

describe('useVoiceCover（卡上只记 voiceId，封面现查）', () => {
  it('库里见过的直接给，⛔ 再问', () => {
    rememberVoiceCovers([
      { voiceId: 'seen', cover: 'https://cover.test/seen.png' },
    ])
    const { result } = renderHook(() => useVoiceCover('seen'))
    expect(result.current).toBe('https://cover.test/seen.png')
    expect(getVoiceSpy).not.toHaveBeenCalledWith('seen')
  })

  it('没见过的问一次声音库，问过不再问', async () => {
    const first = renderHook(() => useVoiceCover('fresh'))
    await waitFor(() =>
      expect(first.result.current).toBe('https://cover.test/fresh.png'),
    )
    renderHook(() => useVoiceCover('fresh'))
    expect(
      getVoiceSpy.mock.calls.filter(([id]) => id === 'fresh'),
    ).toHaveLength(1)
  })

  it('没有 voiceId = 没有封面', () => {
    const { result } = renderHook(() => useVoiceCover(undefined))
    expect(result.current).toBeNull()
  })
})
