import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { VoiceCardRecord } from '@/types'

import { VoiceSelector } from './VoiceSelector'

const {
  dispatchMock,
  refreshMock,
  listVoicesAPIMock,
  deleteVoiceCardAPIMock,
  voiceCardsRef,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  refreshMock: vi.fn(),
  listVoicesAPIMock: vi.fn(),
  deleteVoiceCardAPIMock: vi.fn(),
  voiceCardsRef: { cards: [] as VoiceCardRecord[] },
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string =>
      key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      voiceId: null,
      voiceCardId: null,
    },
    dispatch: dispatchMock,
  }),
  useStudioFormOptional: () => ({
    state: {
      voiceId: null,
      voiceCardId: null,
    },
    dispatch: dispatchMock,
  }),
}))

vi.mock('@/hooks/cards/use-voice-cards', () => ({
  useVoiceCards: () => ({
    cards: voiceCardsRef.cards,
    isLoading: false,
    error: null,
    findCard: () => null,
    refresh: refreshMock,
  }),
}))

vi.mock('@/lib/api-client', () => ({
  createVoiceCardAPI: vi.fn(),
  deleteVoiceCardAPI: deleteVoiceCardAPIMock,
  listVoicesAPI: listVoicesAPIMock,
}))

const FAVORITE_CARD: VoiceCardRecord = {
  id: 'fav-card-1',
  userId: 'user-1',
  name: '男漂泊者',
  provider: 'fish_audio',
  modelId: 'fish-audio-s2-pro',
  voiceId: 'voice-fav-1',
  coverImage: null,
  referenceAudioUrl: null,
  referenceAudioStorageKey: null,
  gender: null,
  age: null,
  tone: [],
  pace: 'normal',
  pitch: null,
  pronunciationDictionary: {},
  sampleText: null,
  isDeleted: false,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

describe('VoiceSelector', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    refreshMock.mockClear()
    voiceCardsRef.cards = []
    deleteVoiceCardAPIMock.mockReset()
    deleteVoiceCardAPIMock.mockResolvedValue({ success: true })
    listVoicesAPIMock.mockReset()
    listVoicesAPIMock.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'fish-public-1',
            title: 'Fish Narrator',
            description: 'A public Fish Audio voice',
            languages: ['en'],
            tags: ['narration'],
            author: { nickname: 'Fish Author' },
            coverImage: null,
            samples: [
              {
                audio: 'https://cdn.example.com/fish-narrator.mp3',
                text: 'Sample narration.',
              },
            ],
          },
        ],
        total: 1,
      },
    })
  })

  it('shows Fish Audio public voices in the default voices panel', async () => {
    render(<VoiceSelector />)

    expect(await screen.findByText('Fish Narrator')).toBeInTheDocument()
    expect(screen.getByText('voiceCardFishAudio')).toBeInTheDocument()
    expect(screen.queryByText('MiniMax')).not.toBeInTheDocument()
  })

  it('selects a Fish Audio market voice and switches to the Fish Audio model', async () => {
    render(<VoiceSelector />)

    fireEvent.click(await screen.findByText('Fish Narrator'))

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'SET_VOICE_CARD_ID',
        payload: null,
      })
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'SET_VOICE_ID',
        payload: 'fish-public-1',
      })
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'SET_OPTION_ID',
        payload: 'workspace:fish-audio-s2-pro',
      })
    })
  })

  it('removes a saved voice from the favorites tab', async () => {
    voiceCardsRef.cards = [FAVORITE_CARD]
    render(<VoiceSelector />)

    fireEvent.click(screen.getByRole('button', { name: 'voiceFavorites' }))
    expect(await screen.findByText('男漂泊者')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'voiceUnfavorite' }))

    await waitFor(() => {
      expect(deleteVoiceCardAPIMock).toHaveBeenCalledWith('fav-card-1')
    })
  })
})
