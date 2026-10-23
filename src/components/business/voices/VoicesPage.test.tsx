import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { zh as zhMessages } from '@/messages'
import type { CharacterCardRecord, VoiceCardRecord } from '@/types'
import type { UseVoicesPageReturn } from '@/hooks/use-voices-page'

import { VoicesPage } from './VoicesPage'

const pageState = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/hooks/use-voices-page', () => ({
  useVoicesPage: () => pageState.current,
}))
vi.mock('@/components/business/studio/VoiceTrainer', () => ({
  VoiceTrainer: () => null,
}))
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

function voice(id: string, name: string, cloned = false): VoiceCardRecord {
  return {
    id,
    name,
    coverImage: null,
    referenceAudioUrl: cloned ? 'https://cdn.test/ref.mp3' : null,
    sampleAudioUrl: null,
    voiceId: `fish-${id}`,
  } as unknown as VoiceCardRecord
}

const DENIA = {
  id: 'denia',
  name: 'Denia',
  voiceCardId: 'v1',
  looks: [
    {
      id: 'look',
      isDefault: true,
      referenceSlots: [{ url: 'https://cdn.test/denia.png', isPrimary: true }],
    },
  ],
} as unknown as CharacterCardRecord

function setup(tab: 'favorites' | 'cloned' | 'public' = 'favorites') {
  const setTab = vi.fn()
  const favorites = [voice('v1', 'Warm'), voice('v2', 'Calm')]
  const cloned = [voice('v3', 'Mine', true)]
  pageState.current = {
    library: {
      tab,
      setTab,
      favorites,
      cloned,
      cards: [...favorites, ...cloned],
      publicVoices: [],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      search: '',
      setSearch: vi.fn(),
      loadMore: vi.fn(),
      favoriteCardOf: () => null,
      toggleFavorite: vi.fn(),
      favoritePendingId: null,
      refreshCards: vi.fn(),
    },
    characters: [DENIA],
    preview: {
      playingId: null,
      loadingId: null,
      progress: 0,
      toggle: vi.fn(),
      stop: vi.fn(),
    },
    pendingId: null,
    rename: vi.fn(),
    setCoverUrl: vi.fn(),
    uploadCover: vi.fn(),
    bindCharacter: vi.fn(),
    remove: vi.fn(),
  } as unknown as UseVoicesPageReturn
  render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <VoicesPage />
    </NextIntlClientProvider>,
  )
  return { setTab }
}

describe('VoicesPage', () => {
  it('shows my saved voices with counts and who uses them', () => {
    setup()
    expect(screen.getByRole('tab', { name: '我的收藏 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: '我的克隆 1' })).toBeInTheDocument()
    expect(screen.getByText('Warm')).toBeInTheDocument()
    expect(screen.getByText('角色：Denia')).toBeInTheDocument()
    // 搜索框只在「找音色」出现。
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('switches tabs through the shared library kernel', () => {
    const { setTab } = setup()
    fireEvent.click(screen.getByRole('tab', { name: '找音色' }))
    expect(setTab).toHaveBeenCalledWith('public')
  })

  it('lists cloned voices on the cloned tab', () => {
    setup('cloned')
    expect(screen.getByText('Mine')).toBeInTheDocument()
  })
})
