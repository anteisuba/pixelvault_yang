import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const voicesState = vi.hoisted(() => ({
  publicVoices: [
    {
      id: 'fish_audio:p1',
      voiceId: 'p1',
      title: '莫宁',
      author: '平台',
      sampleUrl: 'https://cdn.test/sample.mp3',
    },
  ],
  favorites: [
    {
      id: 'f1',
      name: '旁白 · 标准',
      voiceId: 'fav1',
      tone: ['低沉'],
      sampleAudioUrl: 'https://cdn.test/fav.mp3',
      referenceAudioUrl: null,
    },
  ],
  setSearch: vi.fn(),
  setTab: vi.fn(),
  isLoading: false,
}))
vi.mock('@/hooks/use-voice-library', () => ({
  useVoiceLibrary: () => voicesState,
}))

const fetchGallery = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({ fetchGalleryImages: fetchGallery }))

const listRooms = vi.hoisted(() => vi.fn())
const getRoom = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/voiceroom', () => ({
  listVoiceRoomsAPI: listRooms,
  getVoiceRoomAPI: getRoom,
}))

import { useVoiceLibraryClips } from '@/hooks/use-voice-library-clips'

const labelOf = (kind: string, name: string) => `${kind} · ${name}`

function generation(patch: Record<string, unknown>) {
  return {
    id: 'g1',
    url: 'https://cdn.test/g1.mp3',
    prompt: '把她还给我',
    model: 'fish-s2',
    provider: 'fish_audio',
    duration: 7,
    ...patch,
  }
}

function run(tab: string) {
  return renderHook(() =>
    useVoiceLibraryClips({
      tab: tab as never,
      enabled: true,
      search: '',
      labelOf,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchGallery.mockResolvedValue({
    success: true,
    data: {
      generations: [
        generation({}),
        generation({ id: 'g2', provider: 'user-upload' }),
      ],
    },
  })
  listRooms.mockResolvedValue({ success: true, data: [{ id: 'r1' }] })
  getRoom.mockResolvedValue({
    success: true,
    data: {
      name: '站台',
      lines: [
        {
          id: 'l1',
          speakerName: '莫宁',
          text: '你听见了吗',
          audio: { url: 'https://cdn.test/l1.mp3', duration: 3 },
        },
        { id: 'l2', speakerName: '旁白', text: '还没录', audio: null },
      ],
    },
  })
})

describe('五个页签各自的供数（S5c，画板 AudioLibrary）', () => {
  it('平台样本 = 公开音色的样本音频，带 voiceId 所以「设为音色」按得动', async () => {
    const { result } = run('platformSample')
    await waitFor(() => expect(result.current.clips).toHaveLength(1))
    expect(result.current.clips[0]).toMatchObject({
      url: 'https://cdn.test/sample.mp3',
      voiceId: 'p1',
      sourceKind: 'platformSample',
    })
  })

  it('我的历史 = 生成出来的音频，⛔ 排除上传（那是素材库那一栏）', async () => {
    const { result } = run('history')
    await waitFor(() => expect(result.current.clips).toHaveLength(1))
    expect(result.current.clips[0]).toMatchObject({
      id: 'g1',
      sourceKind: 'history',
      durationSec: 7,
    })
    // 历史那一栏⛔ 不按 provider 过滤请求（服务端只按类型取）。
    expect(fetchGallery.mock.calls[0]![2]).not.toHaveProperty('provider')
  })

  it('素材库 = 上传的音频（provider 分流，与 /assets 同一条判据）', async () => {
    const { result } = run('library')
    await waitFor(() => expect(result.current.clips.length).toBeGreaterThan(0))
    expect(fetchGallery.mock.calls[0]![2]).toMatchObject({
      provider: 'user-upload',
    })
    expect(result.current.clips[0]?.sourceKind).toBe('library')
  })

  it('配音间 = VoiceLine 的产物，⛔ 还没录出声的那条不列', async () => {
    const { result } = run('voiceRoom')
    await waitFor(() => expect(result.current.clips).toHaveLength(1))
    expect(result.current.clips[0]).toMatchObject({
      id: 'l1',
      subtitle: '站台',
      sourceKind: 'voiceRoom',
      voiceId: null,
    })
  })

  it('收藏 = 音色卡，试听地址取 sampleAudioUrl', async () => {
    const { result } = run('favorites')
    await waitFor(() => expect(result.current.clips).toHaveLength(1))
    expect(result.current.clips[0]).toMatchObject({
      url: 'https://cdn.test/fav.mp3',
      voiceId: 'fav1',
    })
  })

  it('搜索在本地过一遍名与副标', async () => {
    const { result } = renderHook(() =>
      useVoiceLibraryClips({
        tab: 'voiceRoom' as never,
        enabled: true,
        search: '没有这个词',
        labelOf,
      }),
    )
    await waitFor(() => expect(listRooms).toHaveBeenCalled())
    expect(result.current.clips).toHaveLength(0)
  })
})
