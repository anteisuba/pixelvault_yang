import { describe, expect, it } from 'vitest'

import { roomsWithSameCast, voiceRoomCastKey } from '@/lib/voiceroom-cast'
import type { VoiceRoomCastMember, VoiceRoomRecord } from '@/types/voiceroom'

const voice = (id: string): VoiceRoomCastMember => ({
  id,
  kind: 'voice',
  name: id,
})

const room = (
  id: string,
  cast: VoiceRoomCastMember[],
  updatedAt: string,
): VoiceRoomRecord => ({
  id,
  name: null,
  cast,
  bed: null,
  createdAt: updatedAt,
  updatedAt,
})

describe('voiceRoomCastKey', () => {
  it('ignores order and non-voice members', () => {
    const sfx: VoiceRoomCastMember = { id: 'sfx', kind: 'sfx', name: 'sfx' }
    expect(voiceRoomCastKey([voice('b'), sfx, voice('a')])).toBe(
      voiceRoomCastKey([voice('a'), voice('b')]),
    )
  })

  it('is empty without voices', () => {
    expect(voiceRoomCastKey([])).toBe('')
  })
})

describe('roomsWithSameCast', () => {
  it('keeps only the same group, newest first', () => {
    const rooms = [
      room('old', [voice('a')], '2026-10-20T00:00:00.000Z'),
      room('group', [voice('a'), voice('b')], '2026-10-24T00:00:00.000Z'),
      room('new', [voice('a')], '2026-10-25T00:00:00.000Z'),
    ]
    expect(
      roomsWithSameCast(rooms, voiceRoomCastKey([voice('a')])).map(
        (item) => item.id,
      ),
    ).toEqual(['new', 'old'])
  })
})
