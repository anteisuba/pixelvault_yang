import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { zh as zhMessages } from '@/messages'
import type { VoiceCardRecord } from '@/types'
import type { VoiceAsset } from '@/types/voice-library'

import { VoicePickerDialog } from './VoicePickerDialog'

const libraryState = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/hooks/use-voice-library', () => ({
  useVoiceLibrary: () => libraryState.current,
}))
vi.mock('@/components/business/studio/VoiceTrainer', () => ({
  VoiceTrainer: () => null,
}))
vi.mock('@/hooks/use-voice-sample-preview', () => ({
  canPreviewVoiceSample: () => true,
  useVoiceSamplePreview: () => ({
    playingId: null,
    loadingId: null,
    progress: 0,
    toggle: vi.fn(),
    stop: vi.fn(),
  }),
}))

function voice(id: string, name: string): VoiceCardRecord {
  return {
    id,
    name,
    coverImage: null,
    referenceAudioUrl: null,
    sampleAudioUrl: null,
    voiceId: `fish-${id}`,
  } as unknown as VoiceCardRecord
}

const PUBLIC: VoiceAsset = {
  id: 'fish:p1',
  voiceId: 'p1',
  title: 'Narrator',
  author: 'fish',
  tags: [],
  languages: ['zh'],
  coverImage: null,
  sampleUrl: null,
} as unknown as VoiceAsset

function setup() {
  const created = voice('v9', 'Narrator')
  const toggleFavorite = vi.fn(async () => created)
  libraryState.current = {
    tab: 'public',
    setTab: vi.fn(),
    favorites: [voice('v1', 'Warm'), voice('v2', 'Calm')],
    cloned: [],
    cards: [],
    publicVoices: [PUBLIC],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    search: '',
    setSearch: vi.fn(),
    language: 'all',
    setLanguage: vi.fn(),
    sortBy: 'score',
    setSortBy: vi.fn(),
    loadMore: vi.fn(),
    favoriteCardOf: () => null,
    toggleFavorite,
    favoritePendingId: null,
    refreshCards: vi.fn(),
  }
  return { toggleFavorite, created }
}

function renderPicker(props: Partial<Parameters<typeof VoicePickerDialog>[0]>) {
  const onPick = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <VoicePickerDialog
        open
        onOpenChange={onOpenChange}
        onPick={onPick}
        {...props}
      />
    </NextIntlClientProvider>,
  )
  return { onPick, onOpenChange }
}

describe('VoicePickerDialog（挑音色 ui-spec ㉔ · S26）', () => {
  beforeEach(() => {
    setup()
  })

  it('点一格就选上、框关掉；已在场的写「已在」点不了', () => {
    const { onPick, onOpenChange } = renderPicker({
      takenIds: new Set(['v1']),
    })
    expect(screen.getAllByText('挑音色').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '挑 Warm' })).toBeNull()
    expect(screen.getByText('已在')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '挑 Calm' }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'v2' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('公开库的先收藏成一张卡，再把那张卡交出去', async () => {
    const { toggleFavorite, created } = setup()
    const { onPick } = renderPicker({})
    fireEvent.click(screen.getByRole('button', { name: '挑 Narrator' }))
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(created))
    expect(toggleFavorite).toHaveBeenCalledWith(PUBLIC)
  })

  it('位置满了：标题旁写一句，格子都点不了', () => {
    renderPicker({ fullLabel: '最多 4 位' })
    expect(screen.getByText('最多 4 位')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^挑 / })).toBeNull()
  })
})
