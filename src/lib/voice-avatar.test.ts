import { describe, expect, it } from 'vitest'

import {
  charactersOfVoice,
  voiceAvatarCover,
  voicePersonaCard,
  voiceSpeakerLook,
} from '@/lib/voice-avatar'
import type { CharacterCardRecord } from '@/types'

function character(
  id: string,
  voiceCardId: string | null,
  cover: string | null,
): Pick<CharacterCardRecord, 'id' | 'name' | 'voiceCardId' | 'looks'> {
  return {
    id,
    name: id,
    voiceCardId,
    looks: [
      {
        id: `${id}-look`,
        isDefault: true,
        referenceSlots: cover ? [{ url: cover, isPrimary: true }] : [],
      },
    ] as unknown as CharacterCardRecord['looks'],
  }
}

describe('voiceAvatarCover', () => {
  const voice = { id: 'v1', coverImage: 'https://cdn.test/voice.png' }

  it('uses the bound character avatar first', () => {
    const cards = [
      character('other', 'v2', 'https://cdn.test/other.png'),
      character('denia', 'v1', 'https://cdn.test/denia.png'),
    ]
    expect(voiceAvatarCover(voice, cards)).toBe('https://cdn.test/denia.png')
  })

  it('falls back to the voice cover when no bound character has a picture', () => {
    expect(voiceAvatarCover(voice, [character('denia', 'v1', null)])).toBe(
      'https://cdn.test/voice.png',
    )
    expect(voiceAvatarCover(voice, [])).toBe('https://cdn.test/voice.png')
  })

  it('returns null when nothing has a picture', () => {
    expect(voiceAvatarCover({ id: 'v1', coverImage: null }, [])).toBeNull()
  })
})

describe('charactersOfVoice', () => {
  it('keeps only characters bound to that voice, in order', () => {
    const cards = [
      character('a', 'v1', null),
      character('b', null, null),
      character('c', 'v1', null),
    ]
    expect(charactersOfVoice('v1', cards).map((card) => card.id)).toEqual([
      'a',
      'c',
    ])
  })
})

describe('voicePersonaCard / voiceSpeakerLook', () => {
  const cards = [
    character('denia', 'v1', 'https://cdn.test/denia.png'),
    character('yuki', 'v2', 'https://cdn.test/yuki.png'),
  ]
  const voice = { id: 'v1', name: 'Warm', coverImage: null }

  it('falls back to the first character bound to the voice', () => {
    expect(voicePersonaCard(voice, cards)?.id).toBe('denia')
    expect(voiceSpeakerLook(voice, cards)).toEqual({
      name: 'denia',
      cover: 'https://cdn.test/denia.png',
    })
  })

  it('uses the card picked for this room, even if bound to another voice', () => {
    const picked = { ...voice, characterCardId: 'yuki' }
    expect(voicePersonaCard(picked, cards)?.id).toBe('yuki')
    expect(voiceSpeakerLook(picked, cards)).toEqual({
      name: 'yuki',
      cover: 'https://cdn.test/yuki.png',
    })
  })

  it('ignores a picked card that no longer exists', () => {
    const gone = { ...voice, characterCardId: 'deleted' }
    expect(voicePersonaCard(gone, cards)?.id).toBe('denia')
  })
})
