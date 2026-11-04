// @vitest-environment jsdom
import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 服务端那边：一条公开音色（带样本）、一张收藏的音色卡；真 `useVoiceLibrary` 经 api-client 取。 */
const server = vi.hoisted(() => ({
  publicVoice: {
    id: 'p1',
    title: '莫宁',
    description: null,
    coverImage: null,
    state: 'trained',
    languages: ['zh'],
    tags: [],
    samples: [
      { title: null, text: '示例', audio: 'https://cdn.test/sample.mp3' },
    ],
    likeCount: 0,
    taskCount: 0,
    visibility: 'public',
    createdAt: '2026-08-01T00:00:00.000Z',
    author: { nickname: '平台' },
  },
  favoriteCard: {
    id: 'f1',
    name: '旁白 · 标准',
    description: null,
    provider: 'fish_audio',
    voiceId: 'fav1',
    modelId: 'fish-audio-s2-pro',
    referenceAudioUrl: null,
    referenceText: null,
    tone: ['低沉'],
    language: null,
    speed: null,
    pitch: null,
    pronunciationDictionary: {},
    sampleAudioUrl: 'https://cdn.test/fav.mp3',
    sampleText: null,
    isDeleted: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
}))

const fetchGallery = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: fetchGallery,
  importVoiceSampleAPI: vi.fn(),
  listVoicesAPI: vi.fn(async () => ({
    success: true,
    data: { total: 1, items: [server.publicVoice] },
  })),
  listVoiceCardsAPI: vi.fn(async () => ({
    success: true,
    data: { total: 1, items: [server.favoriteCard] },
  })),
  createVoiceCardAPI: vi.fn(),
  deleteVoiceCardAPI: vi.fn(),
}))

import { queryClient } from '@/lib/query-client'
import { renderHookWithApp } from '@/test/app-harness'
import {
  groupVoiceLibraryClipsByDate,
  useVoiceLibraryClips,
  type VoiceLibraryClip,
} from '@/hooks/use-voice-library-clips'

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
  return renderHookWithApp(() =>
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
  queryClient.clear()
  fetchGallery.mockResolvedValue({
    success: true,
    data: {
      generations: [
        generation({}),
        generation({ id: 'g2', provider: 'user-upload' }),
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

  it('收藏 = 音色卡，试听地址取 sampleAudioUrl', async () => {
    const { result } = run('favorites')
    await waitFor(() => expect(result.current.clips).toHaveLength(1))
    expect(result.current.clips[0]).toMatchObject({
      url: 'https://cdn.test/fav.mp3',
      voiceId: 'fav1',
    })
  })

  it('搜索在本地过一遍名与副标', async () => {
    const { result } = renderHookWithApp(() =>
      useVoiceLibraryClips({
        tab: 'history' as never,
        enabled: true,
        search: '没有这个词',
        labelOf,
      }),
    )
    await waitFor(() => expect(fetchGallery).toHaveBeenCalled())
    expect(result.current.clips).toHaveLength(0)
  })
})

describe('按 今天 / 昨天 / 更早 分组（S5c 尾项）', () => {
  const NOW = new Date('2026-09-10T20:00:00+08:00')
  const clip = (id: string, createdAt: string | null): VoiceLibraryClip =>
    ({
      id,
      name: id,
      subtitle: null,
      url: `https://cdn.test/${id}.mp3`,
      durationSec: 3,
      voiceId: null,
      sourceKind: 'generated',
      sourceLabel: id,
      createdAt,
    }) as VoiceLibraryClip

  it('按本地日历日切，⛔ 不按 UTC（晚上八点后会错一天）', () => {
    const groups = groupVoiceLibraryClipsByDate(
      [
        clip('a', '2026-09-10T21:30:00+08:00'),
        clip('b', '2026-09-09T09:00:00+08:00'),
        clip('c', '2026-09-01T09:00:00+08:00'),
      ],
      NOW,
    )
    expect(
      groups.map((section) => [section.group, section.clips.map((x) => x.id)]),
    ).toEqual([
      ['today', ['a']],
      ['yesterday', ['b']],
      ['earlier', ['c']],
    ])
  })

  it('没有时刻（音色）或时刻读不出来的一律落「更早」——它至少是真的', () => {
    const groups = groupVoiceLibraryClipsByDate(
      [clip('a', null), clip('b', 'not-a-date')],
      NOW,
    )
    expect(groups).toEqual([
      { group: 'earlier', clips: [expect.anything(), expect.anything()] },
    ])
  })

  it('组内保持原有顺序（后端已按新→旧给），且⛔ 不出现空组', () => {
    const groups = groupVoiceLibraryClipsByDate(
      [
        clip('a', '2026-09-10T10:00:00+08:00'),
        clip('b', '2026-09-10T09:00:00+08:00'),
      ],
      NOW,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.clips.map((x) => x.id)).toEqual(['a', 'b'])
  })
})
