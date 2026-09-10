import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
vi.mock('@/hooks/use-voice-library-clips', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-voice-library-clips')>()),
  useVoiceLibraryClips: () => clipsState,
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
