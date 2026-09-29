import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FAKE_DB_USER } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))
vi.mock('@/lib/platform-keys', () => ({
  getFishAudioVoiceLibraryApiKey: vi.fn(() => 'platform_key'),
}))
vi.mock('@/services/fish-audio-voice.service', () => ({ getVoice: vi.fn() }))
vi.mock('@/services/storage/r2', () => ({
  getR2PublicUrl: vi.fn((key: string) => `https://cdn.test/${key}`),
  r2ObjectExists: vi.fn(),
  uploadFromHttpToR2: vi.fn(),
}))

import { getVoice } from '@/services/fish-audio-voice.service'
import { r2ObjectExists, uploadFromHttpToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { importVoiceSample } from '@/services/voice-sample.service'

const KEY = `generations/${FAKE_DB_USER.id}/audio/voice-sample_v1.mp3`

describe('importVoiceSample（「用这段」先转存）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ensureUser).mockResolvedValue(FAKE_DB_USER)
  })

  it('已经存过同一副嗓子 = 直接给地址，⛔ 再向 Fish 取', async () => {
    vi.mocked(r2ObjectExists).mockResolvedValue(true)
    await expect(importVoiceSample('clerk_1', 'v1')).resolves.toEqual({
      url: `https://cdn.test/${KEY}`,
    })
    expect(getVoice).not.toHaveBeenCalled()
    expect(uploadFromHttpToR2).not.toHaveBeenCalled()
  })

  it('没存过 = 向 Fish 现问示例，存进这位用户的键', async () => {
    vi.mocked(r2ObjectExists).mockResolvedValue(false)
    vi.mocked(getVoice).mockResolvedValue({
      samples: [
        { title: null, text: null, audio: '' },
        {
          title: null,
          text: null,
          audio:
            'https://acc.r2.cloudflarestorage.com/a.mp3?X-Amz-Expires=3600',
        },
      ],
    } as unknown as Awaited<ReturnType<typeof getVoice>>)
    vi.mocked(uploadFromHttpToR2).mockResolvedValue({
      publicUrl: `https://cdn.test/${KEY}`,
      mimeType: 'audio/mpeg',
    })
    await expect(importVoiceSample('clerk_1', 'v1')).resolves.toEqual({
      url: `https://cdn.test/${KEY}`,
    })
    expect(getVoice).toHaveBeenCalledWith('platform_key', 'v1')
    expect(uploadFromHttpToR2).toHaveBeenCalledWith({
      sourceUrl:
        'https://acc.r2.cloudflarestorage.com/a.mp3?X-Amz-Expires=3600',
      key: KEY,
    })
  })

  it('这副嗓子一段示例都没有 = 404，⛔ 存一个空文件', async () => {
    vi.mocked(r2ObjectExists).mockResolvedValue(false)
    vi.mocked(getVoice).mockResolvedValue({
      samples: [],
    } as unknown as Awaited<ReturnType<typeof getVoice>>)
    await expect(importVoiceSample('clerk_1', 'v1')).rejects.toMatchObject({
      httpStatus: 404,
    })
    expect(uploadFromHttpToR2).not.toHaveBeenCalled()
  })
})
