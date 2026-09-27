import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const findCards = vi.fn()
const findGenerations = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findMany: (...args: unknown[]) => findCards(...args) },
    generation: { findMany: (...args: unknown[]) => findGenerations(...args) },
  },
}))

import { loadCardBusCharacters } from './card-bus.service'

const ROW = {
  id: 'card-1',
  version: 2,
  handle: 'Denia',
  name: 'Denia',
  characterPrompt: 'pink hair',
  description: null,
  extensions: null,
  referenceSlots: [
    {
      id: 'slot-1',
      role: 'identity',
      url: 'https://cdn.test/1.png',
      isPrimary: true,
    },
    {
      id: 'slot-2',
      role: 'identity',
      url: 'https://cdn.test/2.png',
      isPrimary: false,
    },
    {
      id: 'slot-3',
      role: 'costume',
      url: 'https://cdn.test/3.png',
      isPrimary: false,
    },
  ],
  sourceImageUrl: 'https://cdn.test/1.png',
  sourceImages: [],
  sourceImageEntries: null,
  referenceImages: null,
  referenceRoles: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  findCards.mockResolvedValue([ROW])
  findGenerations.mockResolvedValue([
    { id: 'gen-9', url: 'https://cdn.test/made.png' },
  ])
})

describe('loadCardBusCharacters · 工作台挑的图（owner 09-27）', () => {
  it('没挑就按主图 → 身份 → 其余自动排，不查生成记录', async () => {
    const [character] = await loadCardBusCharacters('user-1', ['card-1'])
    expect(character?.slots.map((slot) => slot.id)).toEqual([
      'slot-1',
      'slot-2',
      'slot-3',
    ])
    expect(findGenerations).not.toHaveBeenCalled()
  })

  it('挑了就只送挑的那几张、按挑的顺序；「用她出的」按本人的图片生成认', async () => {
    const [character] = await loadCardBusCharacters('user-1', ['card-1'], {
      'card-1': [{ slotId: 'slot-3' }, { generationId: 'gen-9' }],
    })
    expect(character?.slots.map((slot) => slot.url)).toEqual([
      'https://cdn.test/3.png',
      'https://cdn.test/made.png',
    ])
    expect(findGenerations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          outputType: 'IMAGE',
        }),
      }),
    )
  })

  it('挑的全都认不出（别人的图 / 已删的槽）就退回自动排，不让她一张图都不带', async () => {
    findGenerations.mockResolvedValue([])
    const [character] = await loadCardBusCharacters('user-1', ['card-1'], {
      'card-1': [{ slotId: 'gone' }, { generationId: 'someone-else' }],
    })
    expect(character?.slots[0]?.id).toBe('slot-1')
  })
})
