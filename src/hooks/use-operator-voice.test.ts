import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  speak: vi.fn(),
  status: vi.fn(),
  setVoice: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  speakAssistantReplyAPI: mocks.speak,
  checkAudioStatusAPI: mocks.status,
}))
vi.mock('@/hooks/use-studio-operator-store', () => ({
  setOperatorMessageVoice: mocks.setVoice,
}))

import { STUDIO_OPERATOR_VOICE } from '@/constants/studio-operator-voice'

import { speakOperatorReply } from './use-operator-voice'

const play = vi.fn(() => Promise.resolve())

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.stubGlobal(
    'Audio',
    vi.fn(function (this: { play: typeof play }) {
      this.play = play
    }),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('speakOperatorReply（②c-2）', () => {
  it('派任务 → 等它好 → 记上地址', async () => {
    mocks.speak.mockResolvedValue({ success: true, data: { jobId: 'job-1' } })
    mocks.status
      .mockResolvedValueOnce({
        success: true,
        data: { jobId: 'job-1', status: 'IN_PROGRESS' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          jobId: 'job-1',
          status: 'COMPLETED',
          generation: { url: 'https://cdn/a.mp3' },
        },
      })
    const run = speakOperatorReply('m-1', '在呢')
    await vi.advanceTimersByTimeAsync(STUDIO_OPERATOR_VOICE.pollMs * 2)
    await run
    expect(mocks.speak).toHaveBeenCalledWith({
      text: '在呢',
      modelId: STUDIO_OPERATOR_VOICE.defaultModelId,
    })
    expect(mocks.setVoice).toHaveBeenNthCalledWith(1, 'm-1', {
      status: 'pending',
    })
    expect(mocks.setVoice).toHaveBeenLastCalledWith('m-1', {
      status: 'ready',
      url: 'https://cdn/a.mp3',
    })
  })

  it('缺 key / 没绑嗓子：标出来让界面就地处理，⛔ 当成坏了', async () => {
    mocks.speak.mockResolvedValueOnce({
      success: false,
      error: 'x',
      errorCode: 'MISSING_API_KEY',
    })
    await speakOperatorReply('m-1', '在呢')
    expect(mocks.setVoice).toHaveBeenLastCalledWith('m-1', {
      status: 'needsKey',
    })

    mocks.speak.mockResolvedValueOnce({
      success: false,
      error: 'x',
      errorCode: 'ASSISTANT_VOICE_UNBOUND',
    })
    await speakOperatorReply('m-2', '在呢')
    expect(mocks.setVoice).toHaveBeenLastCalledWith('m-2', {
      status: 'unbound',
    })
    expect(mocks.status).not.toHaveBeenCalled()
  })
})
