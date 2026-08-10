import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { VoiceCardRecord } from '@/types'

import { VoiceSelector } from './VoiceSelector'

const {
  dispatchMock,
  refreshMock,
  listVoicesAPIMock,
  createVoiceCardAPIMock,
  deleteVoiceCardAPIMock,
  getVoiceAPIMock,
  updateVoiceCardAPIMock,
  voiceCardsRef,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  refreshMock: vi.fn(),
  listVoicesAPIMock: vi.fn(),
  createVoiceCardAPIMock: vi.fn(),
  deleteVoiceCardAPIMock: vi.fn(),
  getVoiceAPIMock: vi.fn(),
  updateVoiceCardAPIMock: vi.fn(),
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
  createVoiceCardAPI: createVoiceCardAPIMock,
  deleteVoiceCardAPI: deleteVoiceCardAPIMock,
  getVoiceAPI: getVoiceAPIMock,
  listVoicesAPI: listVoicesAPIMock,
  updateVoiceCardAPI: updateVoiceCardAPIMock,
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
  sampleAudioUrl: null,
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
    createVoiceCardAPIMock.mockReset()
    createVoiceCardAPIMock.mockResolvedValue({ success: true })
    updateVoiceCardAPIMock.mockReset()
    updateVoiceCardAPIMock.mockResolvedValue({ success: true })
    getVoiceAPIMock.mockReset()
    getVoiceAPIMock.mockResolvedValue({
      success: true,
      data: {
        samples: [{ audio: 'https://cdn.example.com/from-library.mp3' }],
      },
    })
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

  it('passes the playable sample when an external consumer selects a market voice', async () => {
    const onSelectVoiceId = vi.fn()
    render(<VoiceSelector onSelectVoiceId={onSelectVoiceId} />)

    fireEvent.click(await screen.findByText('Fish Narrator'))

    expect(onSelectVoiceId).toHaveBeenCalledWith({
      voiceId: 'fish-public-1',
      name: 'Fish Narrator',
      coverImage: null,
      sampleUrl: 'https://cdn.example.com/fish-narrator.mp3',
    })
  })

  /**
   * 真机 2026-08-10：owner 的四张音色卡 referenceAudioUrl 全是 NULL、sampleText
   * 全都有 —— 正是收藏时只带走文本、把音频丢掉留下的指纹。于是「收藏 → 从收藏
   * tab 选中」得到的节点只有 voiceId，当视频参考音频时静默发不出去。
   * ⚠ 音频只能落在 sampleAudioUrl：referenceAudioUrl 是克隆 tab 的分流判据，
   * 写进去会把收藏卡错分到克隆 tab。
   */
  it('keeps the sample audio when favoriting a public voice', async () => {
    render(<VoiceSelector />)

    expect(await screen.findByText('Fish Narrator')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'voiceFavorite' }))

    await waitFor(() => {
      expect(createVoiceCardAPIMock).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceId: 'fish-public-1',
          sampleAudioUrl: 'https://cdn.example.com/fish-narrator.mp3',
          sampleText: 'Sample narration.',
        }),
      )
    })
    expect(createVoiceCardAPIMock.mock.calls[0]?.[0]).not.toHaveProperty(
      'referenceAudioUrl',
    )
  })

  it('hands a favorited card its stored sample audio on selection', async () => {
    voiceCardsRef.cards = [
      {
        ...FAVORITE_CARD,
        sampleAudioUrl: 'https://cdn.example.com/favorited.mp3',
      },
    ]
    const onSelectVoiceId = vi.fn()
    render(<VoiceSelector onSelectVoiceId={onSelectVoiceId} />)

    fireEvent.click(screen.getByRole('button', { name: 'voiceFavorites' }))
    fireEvent.click(await screen.findByText('男漂泊者'))

    await waitFor(() => {
      expect(onSelectVoiceId).toHaveBeenCalledWith({
        voiceId: 'voice-fav-1',
        name: '男漂泊者',
        coverImage: null,
        sampleUrl: 'https://cdn.example.com/favorited.mp3',
      })
    })
    // 卡上已有音频就不必再问声音库。
    expect(getVoiceAPIMock).not.toHaveBeenCalled()
  })

  /**
   * 存量收藏卡是「收藏只存文本」年代建的，音频位是空的（owner 四张卡全是）。
   * 选中时直接去声音库取它自带的试听 —— 不合成 —— 并补回卡上，下次不用再查。
   */
  it('pulls a missing sample from the library and backfills the card', async () => {
    voiceCardsRef.cards = [FAVORITE_CARD]
    const onSelectVoiceId = vi.fn()
    render(<VoiceSelector onSelectVoiceId={onSelectVoiceId} />)

    fireEvent.click(screen.getByRole('button', { name: 'voiceFavorites' }))
    fireEvent.click(await screen.findByText('男漂泊者'))

    await waitFor(() => {
      expect(onSelectVoiceId).toHaveBeenCalledWith({
        voiceId: 'voice-fav-1',
        name: '男漂泊者',
        coverImage: null,
        sampleUrl: 'https://cdn.example.com/from-library.mp3',
      })
    })
    expect(getVoiceAPIMock).toHaveBeenCalledWith('voice-fav-1')
    expect(updateVoiceCardAPIMock).toHaveBeenCalledWith('fav-card-1', {
      sampleAudioUrl: 'https://cdn.example.com/from-library.mp3',
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
