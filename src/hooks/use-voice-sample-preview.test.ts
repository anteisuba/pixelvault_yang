import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getVoiceSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({ getVoiceAPI: getVoiceSpy }))

import { useVoiceSamplePreview } from '@/hooks/use-voice-sample-preview'

const played: string[] = []

class FakeAudio {
  onended: (() => void) | null = null
  constructor(readonly src: string) {}
  play() {
    played.push(this.src)
    return Promise.resolve()
  }
  pause() {}
}

describe('useVoiceSamplePreview', () => {
  beforeEach(() => {
    played.length = 0
    getVoiceSpy.mockReset()
    vi.stubGlobal('Audio', FakeAudio)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('地址能用 = 直接放；再点同一行 = 停', () => {
    const { result } = renderHook(() => useVoiceSamplePreview())
    act(() => result.current.toggle({ id: 'a', url: 'https://x.test/a.mp3' }))
    expect(played).toEqual(['https://x.test/a.mp3'])
    expect(result.current.playingId).toBe('a')
    act(() => result.current.toggle({ id: 'a', url: 'https://x.test/a.mp3' }))
    expect(result.current.playingId).toBeNull()
    expect(getVoiceSpy).not.toHaveBeenCalled()
  })

  it('签名链接 / 没有地址 + 带 voiceId = 先现取一条新的再放（真机：大半行按不响）', async () => {
    getVoiceSpy.mockResolvedValue({
      success: true,
      data: { samples: [{ audio: 'https://fresh.test/v.mp3' }] },
    })
    const { result } = renderHook(() => useVoiceSamplePreview())
    act(() =>
      result.current.toggle({
        id: 'v',
        url: 'https://acc.r2.cloudflarestorage.com/a.mp3?X-Amz-Expires=3600',
        voiceId: 'fish_v',
      }),
    )
    expect(result.current.loadingId).toBe('v')
    await waitFor(() => expect(played).toEqual(['https://fresh.test/v.mp3']))
    expect(getVoiceSpy).toHaveBeenCalledWith('fish_v')
    expect(result.current.playingId).toBe('v')
    expect(result.current.loadingId).toBeNull()
  })

  it('现取途中换了一行 = 先回来的那条作废', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    getVoiceSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve
      }),
    )
    const { result } = renderHook(() => useVoiceSamplePreview())
    act(() => result.current.toggle({ id: 'v', url: null, voiceId: 'fish_v' }))
    act(() => result.current.toggle({ id: 'b', url: 'https://x.test/b.mp3' }))
    await act(async () => {
      resolveFirst({
        success: true,
        data: { samples: [{ audio: 'https://fresh.test/v.mp3' }] },
      })
    })
    expect(played).toEqual(['https://x.test/b.mp3'])
    expect(result.current.playingId).toBe('b')
  })
})
