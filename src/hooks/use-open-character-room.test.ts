import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateCharacterCardAPI } from '@/lib/api-client/cards'
import {
  createVoiceRoomAPI,
  listVoiceRoomsAPI,
} from '@/lib/api-client/voiceroom'
import type { ChatCharacterOption } from '@/hooks/use-chat-characters'
import { useOpenCharacterRoom } from '@/hooks/use-open-character-room'
import type { VoiceRoomRecord } from '@/types/voiceroom'

const push = vi.fn()

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/api-client/voiceroom', () => ({
  listVoiceRoomsAPI: vi.fn(),
  createVoiceRoomAPI: vi.fn(),
}))
vi.mock('@/lib/api-client/cards', () => ({
  updateCharacterCardAPI: vi.fn(),
}))

const chat = (voiceCardId: string | null): ChatCharacterOption => ({
  character: { id: 'card-1', name: '雪乃' },
  opening: '',
  avatarUrl: 'https://cdn/x.png',
  voiceCardId,
})

const room = (
  id: string,
  voiceIds: string[],
  updatedAt: string,
): VoiceRoomRecord => ({
  id,
  name: null,
  cast: voiceIds.map((voiceId) => ({
    id: voiceId,
    kind: 'voice',
    name: voiceId,
  })),
  bed: null,
  createdAt: updatedAt,
  updatedAt,
})

describe('useOpenCharacterRoom', () => {
  beforeEach(() => {
    push.mockReset()
    vi.mocked(createVoiceRoomAPI).mockReset()
    vi.mocked(updateCharacterCardAPI).mockReset()
    vi.mocked(listVoiceRoomsAPI).mockResolvedValue({
      success: true,
      data: [
        room('group', ['v1', 'v2'], '2026-10-25T03:00:00.000Z'),
        room('older', ['v1'], '2026-10-24T00:00:00.000Z'),
        room('latest', ['v1'], '2026-10-25T01:00:00.000Z'),
      ],
    })
  })

  it('opens the latest solo room of her voice, skipping group rooms', async () => {
    const { result } = renderHook(() => useOpenCharacterRoom())
    await act(() => result.current.open(chat('v1')))
    expect(push).toHaveBeenCalledWith('/studio/audio?room=latest')
    expect(createVoiceRoomAPI).not.toHaveBeenCalled()
  })

  it('creates a room with her as the cast when none exists', async () => {
    vi.mocked(createVoiceRoomAPI).mockResolvedValue({
      success: true,
      data: room('fresh', ['v9'], '2026-10-25T04:00:00.000Z'),
    })
    const { result } = renderHook(() => useOpenCharacterRoom())
    await act(() => result.current.open(chat('v9')))
    expect(createVoiceRoomAPI).toHaveBeenCalledWith({
      cast: [
        {
          id: 'v9',
          kind: 'voice',
          name: '雪乃',
          coverImage: 'https://cdn/x.png',
        },
      ],
    })
    expect(push).toHaveBeenCalledWith('/studio/audio?room=fresh')
  })

  it('asks for a voice first, then binds it to the card and enters', async () => {
    const { result } = renderHook(() => useOpenCharacterRoom())
    await act(() => result.current.open(chat(null)))
    expect(result.current.needsVoice?.character.id).toBe('card-1')
    expect(push).not.toHaveBeenCalled()

    await act(() => result.current.bindVoiceAndOpen('v1'))
    expect(updateCharacterCardAPI).toHaveBeenCalledWith('card-1', {
      voiceCardId: 'v1',
    })
    expect(push).toHaveBeenCalledWith('/studio/audio?room=latest')
    expect(result.current.needsVoice).toBeNull()
  })
})
