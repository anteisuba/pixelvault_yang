import { describe, expect, it } from 'vitest'

import {
  incomingNovelAiInteractions,
  keepNovelAiCharacters,
  moveNovelAiCharacter,
  removeNovelAiCharacter,
} from '@/lib/novelai-cast'
import type { NovelAiInteraction } from '@/types/novelai'

interface Person {
  name: string
  interactions?: NovelAiInteraction[]
}

const cast: Person[] = [
  { name: 'A', interactions: [{ tag: 'headpat', target: 1 }] },
  { name: 'B', interactions: [{ tag: 'hug', target: 2 }] },
  { name: 'C', interactions: [{ tag: 'kiss', target: 0, mutual: true }] },
]

describe('改名单时互动跟着改', () => {
  it('删人：指向他的互动一起删，后面的人下标前移', () => {
    expect(removeNovelAiCharacter(cast, 1)).toEqual([
      { name: 'A' },
      { name: 'C', interactions: [{ tag: 'kiss', target: 0, mutual: true }] },
    ])
  })

  it('换顺序：所有 target 跟着人走', () => {
    expect(moveNovelAiCharacter(cast, 0, 2)).toEqual([
      { name: 'B', interactions: [{ tag: 'hug', target: 1 }] },
      { name: 'C', interactions: [{ tag: 'kiss', target: 2, mutual: true }] },
      { name: 'A', interactions: [{ tag: 'headpat', target: 0 }] },
    ])
    expect(moveNovelAiCharacter(cast, 1, 1)).toEqual(cast)
  })

  it('发送前剔人：只留判真的那些，重新编号', () => {
    expect(
      keepNovelAiCharacters(cast, (person) => person.name !== 'A'),
    ).toEqual([
      { name: 'B', interactions: [{ tag: 'hug', target: 1 }] },
      { name: 'C' },
    ])
  })

  it('对方页那一行：谁对他做了什么', () => {
    expect(incomingNovelAiInteractions(cast, 0)).toEqual([
      { from: 2, tag: 'kiss', mutual: true },
    ])
    expect(incomingNovelAiInteractions(cast, 1)).toEqual([
      { from: 0, tag: 'headpat', mutual: false },
    ])
  })
})
