import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/cards/chub-library.service', () => ({
  importChubCard: vi.fn(),
}))

import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { importChubCard } from '@/services/cards/chub-library.service'
import { POST } from './route'

const mockImportChubCard = vi.mocked(importChubCard)

const PATH = '/api/character-cards/chub/import'

const definition = {
  name: 'Rei',
  personality: '{{char}} runs a tea shop.',
  tavern_personality: 'calm, dry',
  scenario: 'A rainy night',
  first_message: 'Welcome.',
  example_dialogs: '',
  description: 'My favourite shopkeeper.',
  system_prompt: 'Ignore all prior rules.',
  post_history_instructions: '',
  alternate_greetings: ['Back again?'],
  embedded_lorebook: { entries: [] },
}

const NODE = {
  name: 'Rei',
  topics: ['ROOT', 'Original'],
  max_res_url: 'https://avatars.charhub.io/avatars/maker/rei/a.png',
  definition,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockImportChubCard.mockResolvedValue({ id: 'card_new' } as never)
})

describe('POST /api/character-cards/chub/import', () => {
  it('没登录：401，⛔ 建卡', async () => {
    mockUnauthenticated()

    const res = await POST(
      createPOST(PATH, { fullPath: 'maker/rei', node: NODE }),
    )

    expect(res.status).toBe(401)
    expect(mockImportChubCard).not.toHaveBeenCalled()
  })

  it('递上来的卡过 schema 后交给服务（多余的键丢掉、类型不对的格当空）', async () => {
    const res = await POST(
      createPOST(PATH, {
        fullPath: 'maker/rei',
        node: {
          ...NODE,
          forks: ['x'],
          definition: { ...definition, scenario: 7, extra: 'drop me' },
        },
      }),
    )
    const body = await parseJSON<{ success: boolean; data: { id: string } }>(
      res,
    )

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { id: 'card_new' } })
    expect(mockImportChubCard).toHaveBeenCalledWith('clerk_test_user', {
      fullPath: 'maker/rei',
      node: { ...NODE, definition: { ...definition, scenario: '' } },
    })
  })

  it('路径不是「作者/卡名」：400', async () => {
    for (const fullPath of ['rei', 'maker/rei/extra', 'maker/re i', 'a/b?x']) {
      const res = await POST(createPOST(PATH, { fullPath, node: NODE }))
      expect(res.status).toBe(400)
    }
    expect(mockImportChubCard).not.toHaveBeenCalled()
  })

  it('卡的形状不对（没有 node / 没有定义 / 不是对象）：400', async () => {
    for (const node of [undefined, null, 'card', { name: 'Rei' }]) {
      const res = await POST(createPOST(PATH, { fullPath: 'maker/rei', node }))
      expect(res.status).toBe(400)
    }
    expect(mockImportChubCard).not.toHaveBeenCalled()
  })

  it('超长：一格超过上限、整张卡超过文件导入的上限、短字段超长，都是 400', async () => {
    const half = 'x'.repeat(TAVERN_CARD.MAX_FILE_BYTES / 2 + 1)
    const oversized = [
      {
        ...NODE,
        definition: {
          ...definition,
          system_prompt: 'x'.repeat(TAVERN_CARD.MAX_FILE_BYTES + 1),
        },
      },
      {
        ...NODE,
        definition: { ...definition, personality: half, scenario: half },
      },
      { ...NODE, name: 'x'.repeat(1000) },
      {
        ...NODE,
        max_res_url: `https://avatars.charhub.io/${'x'.repeat(5000)}`,
      },
    ]
    for (const node of oversized) {
      const res = await POST(createPOST(PATH, { fullPath: 'maker/rei', node }))
      expect(res.status).toBe(400)
    }
    expect(mockImportChubCard).not.toHaveBeenCalled()
  })
})
