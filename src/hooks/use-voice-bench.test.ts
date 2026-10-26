import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getVoiceBenchAPI: vi.fn(),
  speakAssistantReplyAPI: vi.fn(),
  waitForAudioJob: vi.fn(),
  playOperatorVoice: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  getVoiceBenchAPI: mocks.getVoiceBenchAPI,
  speakAssistantReplyAPI: mocks.speakAssistantReplyAPI,
}))
vi.mock('@/hooks/use-operator-voice', () => ({
  getOperatorVoicePrefs: () => ({ on: false, modelId: 'fish-free' }),
  playOperatorVoice: mocks.playOperatorVoice,
  waitForAudioJob: mocks.waitForAudioJob,
}))

import { useVoiceBench, voiceBenchLines } from './use-voice-bench'

const line = (id: string, text: string) => ({
  id,
  text,
  url: `https://cdn.test/${id}.mp3`,
  duration: 2,
  createdAt: '2026-10-26T10:00:00Z',
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getVoiceBenchAPI.mockResolvedValue({
    success: true,
    data: {
      characterCardId: 'c1',
      voiceCardId: 'v1',
      lines: [line('g1', '在吗')],
    },
  })
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
    let finish: (url: string) => void = () => {}
    mocks.waitForAudioJob.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    )
    const { result } = renderHook(() => useVoiceBench('c1|v1'))
    await waitFor(() => expect(result.current.data?.lines).toHaveLength(1))

    act(() => {
      void result.current.speak('欢迎来到图书馆。', 'whisper')
    })
    await waitFor(() => expect(result.current.pending).toHaveLength(1))
    expect(result.current.pending[0]).toMatchObject({ status: 'pending' })
    expect(mocks.speakAssistantReplyAPI).toHaveBeenCalledWith({
      text: '欢迎来到图书馆。',
      modelId: 'fish-free',
      emotion: 'whisper',
    })

    mocks.getVoiceBenchAPI.mockResolvedValue({
      success: true,
      data: {
        characterCardId: 'c1',
        voiceCardId: 'v1',
        lines: [line('g1', '在吗'), line('g2', '[whispering]欢迎来到图书馆。')],
      },
    })
    await act(async () => finish('https://cdn.test/g2.mp3'))
    await waitFor(() => expect(result.current.pending).toHaveLength(0))
    expect(result.current.data?.lines).toHaveLength(2)
    expect(mocks.playOperatorVoice).toHaveBeenCalledWith(
      'g2',
      'https://cdn.test/g2.mp3',
    )
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
