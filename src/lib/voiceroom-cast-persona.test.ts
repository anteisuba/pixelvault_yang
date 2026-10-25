import { describe, expect, it } from 'vitest'

import {
  castMemberForSpeaker,
  isVoicelessMember,
  personaCastMember,
  roomsForPersona,
  soloRoomsForPersona,
} from '@/lib/voiceroom-cast'
import type { VoiceRoomCastMember, VoiceRoomRecord } from '@/types/voiceroom'

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

const denia: VoiceRoomCastMember = {
  id: 'v-denia',
  kind: 'voice',
  name: 'Denia',
  characterCardId: 'card-denia',
}
const furina: VoiceRoomCastMember = {
  id: 'v-furina',
  kind: 'voice',
  name: 'Furina',
  characterCardId: 'card-furina',
}
const assistant = personaCastMember({
  characterCardId: null,
  voiceCardId: null,
  name: '助手',
  coverImage: null,
})

const rooms = [
  room('solo-old', [denia], '2026-10-24T00:00:00.000Z'),
  room('group', [denia, furina], '2026-10-25T03:00:00.000Z'),
  room('solo-new', [denia], '2026-10-25T01:00:00.000Z'),
  room('furina', [furina], '2026-10-25T05:00:00.000Z'),
  room('assistant', [assistant], '2026-10-25T06:00:00.000Z'),
  // 10-25 之前开的：班底里没记角色卡，按嗓子认她。
  room(
    'legacy',
    [{ id: 'v-denia', kind: 'voice', name: 'Denia' }],
    '2026-10-20T00:00:00.000Z',
  ),
]

describe('聊天跟着全局人设', () => {
  const deniaRef = { characterCardId: 'card-denia', voiceCardId: 'v-denia' }

  it('lists her rooms (groups included), newest first', () => {
    expect(roomsForPersona(rooms, deniaRef).map((item) => item.id)).toEqual([
      'group',
      'solo-new',
      'solo-old',
      'legacy',
    ])
  })

  it('opens into her latest solo room, skipping groups', () => {
    expect(soloRoomsForPersona(rooms, deniaRef)[0]?.id).toBe('solo-new')
  })

  it('the default assistant only sees its own rooms', () => {
    expect(
      roomsForPersona(rooms, { characterCardId: null, voiceCardId: null }).map(
        (item) => item.id,
      ),
    ).toEqual(['assistant'])
  })
})

describe('还没嗓子的那一位', () => {
  it('gets a voiceless placeholder that can be told apart', () => {
    expect(assistant).toMatchObject({
      id: 'novoice:assistant',
      assistant: true,
      characterCardId: null,
    })
    expect(isVoicelessMember(assistant)).toBe(true)
    expect(
      isVoicelessMember(
        personaCastMember({
          characterCardId: 'card-x',
          voiceCardId: 'v-x',
          name: 'X',
          coverImage: null,
        }),
      ),
    ).toBe(false)
  })

  it('old lines still find her after she picked a voice', () => {
    const voiced = { ...assistant, id: 'v-picked' }
    expect(castMemberForSpeaker([voiced], 'novoice:assistant')).toBe(voiced)
    const card = { ...denia }
    expect(castMemberForSpeaker([card], 'novoice:card-denia')).toBe(card)
    expect(castMemberForSpeaker([card], 'v-other')).toBeUndefined()
  })
})
