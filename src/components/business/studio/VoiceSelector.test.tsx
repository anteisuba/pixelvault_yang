import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VoiceSelector } from './VoiceSelector'

const { dispatchMock, refreshMock, listVoicesAPIMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  refreshMock: vi.fn(),
  listVoicesAPIMock: vi.fn(),
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
    cards: [],
    isLoading: false,
    error: null,
    findCard: () => null,
    refresh: refreshMock,
  }),
}))

vi.mock('@/lib/api-client', () => ({
  createVoiceCardAPI: vi.fn(),
  deleteVoiceCardAPI: vi.fn(),
  listVoicesAPI: listVoicesAPIMock,
}))

describe('VoiceSelector', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    refreshMock.mockClear()
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
})
