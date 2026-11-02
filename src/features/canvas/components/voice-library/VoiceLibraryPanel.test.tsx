import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AUDIO_CLIP_SOURCE } from '@/constants/audio-options'
import type { UseVoiceLibraryClipsOptions } from '@/hooks/use-voice-library-clips'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

/** 克隆流程是另一条路（自带一堆 provider）——本组只看列表怎么排。 */
vi.mock('../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: () => null,
}))

const clipsState = vi.hoisted(() => ({
  clips: [] as unknown[],
  isLoading: false,
  error: null as string | null,
}))
const hookArgs = vi.hoisted(() => ({
  last: null as UseVoiceLibraryClipsOptions | null,
}))
vi.mock('@/hooks/use-voice-library-clips', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-voice-library-clips')>()),
  useVoiceLibraryClips: (options: UseVoiceLibraryClipsOptions) => {
    hookArgs.last = options
    return clipsState
  },
}))

import { VoiceLibraryPanel } from './VoiceLibraryPanel'

const clip = (id: string, createdAt: string | null) => ({
  id,
  name: id,
  subtitle: null,
  url: `https://cdn.test/${id}.mp3`,
  durationSec: 3,
  voiceId: null,
  sourceKind: 'generated',
  sourceLabel: id,
  createdAt,
})

function setup() {
  return render(
    <VoiceLibraryPanel
      open
      onClose={vi.fn()}
      onUseClip={vi.fn()}
      onSetVoice={vi.fn()}
    />,
  )
}

const groups = () =>
  Array.from(document.querySelectorAll('[data-voice-library-group]')).map(
    (item) => item.getAttribute('data-voice-library-group'),
  )

describe('声音库列表分组（S5c 尾项）', () => {
  it('录音那几栏按 今天 / 昨天 / 更早 分组，⛔ 空组不出现', () => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    clipsState.clips = [
      clip('a', now.toISOString()),
      clip('b', yesterday.toISOString()),
    ]
    setup()
    fireEvent.click(
      document.querySelector('[data-voice-library-tab="history"]')!,
    )
    expect(groups()).toEqual(['today', 'yesterday'])
    expect(document.querySelectorAll('[data-voice-library-row]')).toHaveLength(
      2,
    )
  })

  it('音色那两栏（平台样本 / 收藏）平铺，⛔ 不给嗓子扣一个日期帽子', () => {
    clipsState.clips = [clip('p1', null)]
    setup()
    expect(groups()).toEqual([])
    expect(document.querySelectorAll('[data-voice-library-row]')).toHaveLength(
      1,
    )
  })
})

// 「用这段」把这行字记进卡的 `source.label`（落库，schema 上限 200）。
describe('来源那行小字', () => {
  it('截到 200 个码元时 emoji 跨在截断点上 —— 退掉半个字，⛔ 不让整份 state 被 jsonb 拒收', () => {
    clipsState.clips = []
    setup()
    const labelOf = hookArgs.last!.labelOf
    // 翻译桩原样回 key：前缀就是 `generated · `。
    const prefix = `${AUDIO_CLIP_SOURCE.generated} · `
    const room = 200 - prefix.length
    expect(
      labelOf(AUDIO_CLIP_SOURCE.generated, `${'声'.repeat(room - 1)}😀尾`),
    ).toBe(`${prefix}${'声'.repeat(room - 1)}`)
    expect(
      labelOf(AUDIO_CLIP_SOURCE.generated, `${'声'.repeat(room - 2)}😀尾`),
    ).toBe(`${prefix}${'声'.repeat(room - 2)}😀`)
  })
})

describe('切页签（声音库动效表 A）', () => {
  it('打开时列表不淡入（框自己在长出来）；切页签那一下换一块新列表从 0 淡进来', () => {
    clipsState.clips = []
    setup()
    const list = () =>
      document.querySelector<HTMLElement>('[data-voice-library-list]')!
    expect(list().style.opacity).toBe('1')
    fireEvent.click(
      document.querySelector('[data-voice-library-tab="history"]')!,
    )
    // ⛔ 两份列表不同时在（退场叠放会把框撑高）。
    expect(document.querySelectorAll('[data-voice-library-list]')).toHaveLength(
      1,
    )
    expect(list().getAttribute('data-voice-library-list')).toBe('history')
    expect(list().style.opacity).toBe('0')
  })
})
