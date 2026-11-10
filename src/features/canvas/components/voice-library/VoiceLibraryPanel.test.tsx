/**
 * L2b：真面板 + 真 `useVoiceLibraryClips` / `useVoiceLibrary` + 真文案，只假网络（api-client）。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUDIO_CLIP_SOURCE } from '@/constants/audio-options'

const server = vi.hoisted(() => ({
  generations: [] as Array<Record<string, unknown>>,
  publicVoices: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn(async () => ({
    success: true,
    data: { generations: server.generations },
  })),
  importVoiceSampleAPI: vi.fn(),
  listVoicesAPI: vi.fn(async () => ({
    success: true,
    data: { total: server.publicVoices.length, items: server.publicVoices },
  })),
  listVoiceCardsAPI: vi.fn(async () => ({
    success: true,
    data: { total: 0, items: [] },
  })),
  createVoiceCardAPI: vi.fn(),
  deleteVoiceCardAPI: vi.fn(),
}))

import { queryClient } from '@/lib/query-client'
import { message, renderWithApp } from '@/test/app-harness'

import { VoiceLibraryPanel } from './VoiceLibraryPanel'

function generation(id: string, createdAt: string, prompt = id) {
  return {
    id,
    url: `https://cdn.test/${id}.mp3`,
    prompt,
    model: 'fish-s2',
    provider: 'fish_audio',
    duration: 3,
    createdAt,
  }
}

function publicVoice(id: string) {
  return {
    id,
    title: id,
    description: null,
    coverImage: null,
    state: 'trained',
    languages: ['zh'],
    tags: [],
    samples: [{ title: null, text: null, audio: `https://cdn.test/${id}.mp3` }],
    likeCount: 0,
    taskCount: 0,
    visibility: 'public',
    createdAt: '2026-08-01T00:00:00.000Z',
    author: null,
  }
}

function setup(onUseClip = vi.fn()) {
  renderWithApp(
    <VoiceLibraryPanel
      open
      onClose={vi.fn()}
      onUseClip={onUseClip}
      onSetVoice={vi.fn()}
    />,
  )
  return { onUseClip }
}

const groups = () =>
  Array.from(document.querySelectorAll('[data-voice-library-group]')).map(
    (item) => item.getAttribute('data-voice-library-group'),
  )
const rows = () => document.querySelectorAll('[data-voice-library-row]')
const openTab = (tab: string) =>
  fireEvent.click(
    screen.getByRole('tab', {
      name: message(`StudioNode.v4.audio.library.tabs.${tab}`),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  queryClient.clear()
  server.generations = []
  server.publicVoices = []
})

describe('声音库列表分组（S5c 尾项）', () => {
  it('录音那几栏按 今天 / 昨天 / 更早 分组，⛔ 空组不出现', async () => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    server.generations = [
      generation('a', now.toISOString()),
      generation('b', yesterday.toISOString()),
    ]
    setup()
    openTab('history')

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(groups()).toEqual(['today', 'yesterday'])
  })

  it('音色那两栏（平台样本 / 收藏）平铺，⛔ 不给嗓子扣一个日期帽子', async () => {
    server.publicVoices = [publicVoice('p1')]
    setup()

    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(groups()).toEqual([])
  })
})

// 「用这段」把这行字记进卡的 `source.label`（落库，schema 上限 200）。
describe('来源那行小字', () => {
  it('截到 200 个码元时 emoji 跨在截断点上 —— 退掉半个字，⛔ 不让整份 state 被 jsonb 拒收', async () => {
    const prefix = `${message(`StudioNode.v4.audio.source.${AUDIO_CLIP_SOURCE.history}`)} · `
    const room = 200 - prefix.length
    server.generations = [
      generation(
        'cut',
        new Date().toISOString(),
        `${'声'.repeat(room - 1)}😀尾`,
      ),
      generation(
        'keep',
        new Date().toISOString(),
        `${'声'.repeat(room - 2)}😀尾`,
      ),
    ]
    const { onUseClip } = setup()
    openTab('history')
    await waitFor(() => expect(rows()).toHaveLength(2))

    fireEvent.click(document.querySelector('[data-voice-library-use="cut"]')!)
    await waitFor(() => expect(onUseClip).toHaveBeenCalledTimes(1))
    fireEvent.click(document.querySelector('[data-voice-library-use="keep"]')!)
    await waitFor(() => expect(onUseClip).toHaveBeenCalledTimes(2))

    expect(onUseClip.mock.calls[0]![0].sourceLabel).toBe(
      `${prefix}${'声'.repeat(room - 1)}`,
    )
    expect(onUseClip.mock.calls[1]![0].sourceLabel).toBe(
      `${prefix}${'声'.repeat(room - 2)}😀`,
    )
  })
})

describe('切页签（声音库动效表 A）', () => {
  it('打开时列表不淡入（框自己在长出来）；切页签那一下换一块新列表从 0 淡进来', () => {
    setup()
    const list = () =>
      document.querySelector<HTMLElement>('[data-voice-library-list]')!
    expect(list().style.opacity).toBe('1')
    openTab('history')
    // ⛔ 两份列表不同时在（退场叠放会把框撑高）。
    expect(document.querySelectorAll('[data-voice-library-list]')).toHaveLength(
      1,
    )
    expect(list().getAttribute('data-voice-library-list')).toBe('history')
    expect(list().style.opacity).toBe('0')
    expect(screen.getByText(message('StudioNode.v4.audio.library.title')))
  })
})
