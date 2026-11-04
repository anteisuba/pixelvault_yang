// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_VOICE } from '@/constants/studio-operator-voice'

const mocks = vi.hoisted(() => ({
  getVoiceBenchAPI: vi.fn(),
  speakAssistantReplyAPI: vi.fn(),
  checkAudioStatusAPI: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  getVoiceBenchAPI: mocks.getVoiceBenchAPI,
  speakAssistantReplyAPI: mocks.speakAssistantReplyAPI,
  checkAudioStatusAPI: mocks.checkAudioStatusAPI,
}))

import { getOperatorVoicePrefs } from '@/features/assistant/hooks/use-operator-voice'

import { useVoiceBench, voiceBenchLines } from './use-voice-bench'

/** 浏览器放音：记下放了哪段（真 `playOperatorVoice` 用 `new Audio(url)`）。 */
const played: string[] = []
class FakeAudio {
  onended: (() => void) | null = null
  onpause: (() => void) | null = null
  constructor(url: string) {
    played.push(url)
  }
  play() {
    return Promise.resolve()
  }
  pause() {}
}

const line = (id: string, text: string) => ({
  id,
  text,
  url: `https://cdn.test/${id}.mp3`,
  duration: 2,
  createdAt: '2026-10-26T10:00:00Z',
})

beforeEach(() => {
  vi.clearAllMocks()
  played.length = 0
  vi.stubGlobal('Audio', FakeAudio)
  mocks.getVoiceBenchAPI.mockResolvedValue({
    success: true,
    data: {
      characterCardId: 'c1',
      voiceCardId: 'v1',
      lines: [line('g1', '在吗')],
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useVoiceBench（配音台 ③）', () => {
  it('一行一句，空行不算', () => {
    expect(voiceBenchLines(' 欢迎\n\n 请安静 \n')).toEqual(['欢迎', '请安静'])
  })

  it('念：先挂一行「正在念」，好了读回列表、放刚念好的那条', async () => {
    mocks.speakAssistantReplyAPI.mockResolvedValue({
      success: true,
      data: { jobId: 'job-1' },
    })
    mocks.checkAudioStatusAPI.mockResolvedValue({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: { url: 'https://cdn.test/g2.mp3' },
      },
    })
    const { result } = renderHook(() => useVoiceBench('c1|v1'))
    await waitFor(() => expect(result.current.data?.lines).toHaveLength(1))
    // 念好要轮询：只假 setTimeout，拨过去，⛔ 不真等。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await act(async () => {
      void result.current.speak('[whispering]欢迎来到图书馆。')
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0]).toMatchObject({ status: 'pending' })
    expect(mocks.speakAssistantReplyAPI).toHaveBeenCalledWith({
      text: '[whispering]欢迎来到图书馆。',
      modelId: getOperatorVoicePrefs().modelId,
    })

    mocks.getVoiceBenchAPI.mockResolvedValue({
      success: true,
      data: {
        characterCardId: 'c1',
        voiceCardId: 'v1',
        lines: [line('g1', '在吗'), line('g2', '[whispering]欢迎来到图书馆。')],
      },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STUDIO_OPERATOR_VOICE.pollMs)
    })
    // ⚠ 假时钟下不用 waitFor（它收尾要等一拍真 setTimeout）。
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.data?.lines).toHaveLength(2)
    expect(played).toEqual(['https://cdn.test/g2.mp3'])
  })

  it('没嗓子 / 缺 key：那一句标出来，就地处理完再念', async () => {
    mocks.speakAssistantReplyAPI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      errorCode: 'ASSISTANT_VOICE_UNBOUND',
    })
    const { result } = renderHook(() => useVoiceBench('c1|'))
    await act(async () => {
      await result.current.speak('在呢')
    })
    expect(result.current.pending[0]).toMatchObject({ status: 'unbound' })

    mocks.speakAssistantReplyAPI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      errorCode: 'MISSING_API_KEY',
    })
    act(() => result.current.retry(result.current.pending[0]!.key))
    await waitFor(() =>
      expect(result.current.pending[0]).toMatchObject({ status: 'needsKey' }),
    )
  })
})
