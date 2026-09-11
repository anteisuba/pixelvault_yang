import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  CONTEXT_CARD_KIND_IDS,
  CONTEXT_CARD_LIMITS,
} from '@/constants/context-cards'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockList = vi.fn()
const mockCreate = vi.fn()

vi.mock('@/services/context-cards.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/context-cards.service')
  >('@/services/context-cards.service')
  return {
    ContextCardLimitError: actual.ContextCardLimitError,
    listContextCardsForClerkId: (...args: unknown[]) => mockList(...args),
    createContextCardForClerkId: (...args: unknown[]) => mockCreate(...args),
  }
})

import { GET, POST } from '@/app/api/context-cards/route'
import { ContextCardLimitError } from '@/services/context-cards.service'

const CARD = {
  id: 'card-1',
  kind: CONTEXT_CARD_KIND_IDS.character,
  name: 'Sigrika',
  summary: 'Silver hair, gold eyes.',
  body: '',
  images: [],
  negative: null,
  pinnedScopes: ['video'],
  status: 'confirmed' as const,
  createdAt: '2026-09-07T10:00:00.000Z',
  updatedAt: '2026-09-07T10:00:00.000Z',
}

describe('GET /api/context-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockList.mockResolvedValue([CARD])
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await GET(createGET('/api/context-cards'))
    expect(res.status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('不带过滤时取全部', async () => {
    const res = await GET(createGET('/api/context-cards'))
    expect(res.status).toBe(200)
    await expect(parseJSON(res)).resolves.toEqual({
      success: true,
      data: [CARD],
    })
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', {
      kind: null,
      // ⚠ 缺席 = 只要已确认的（服务端默认）—— 待确认区显式传 `proposed`。
      status: null,
      pinnedScope: null,
    })
  })

  it('kind 与 pinnedScope 透传给 service', async () => {
    await GET(
      createGET('/api/context-cards', { kind: 'style', pinnedScope: 'image' }),
    )
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', {
      kind: 'style',
      status: null,
      pinnedScope: 'image',
    })
  })

  /** 待确认区那一次查询（v2 §8.1）—— 唯一会传 `status` 的调用方。 */
  it('status=proposed 透传给 service', async () => {
    await GET(createGET('/api/context-cards', { status: 'proposed' }))
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', {
      kind: null,
      status: 'proposed',
      pinnedScope: null,
    })
  })

  it('词表外的 status 400', async () => {
    const res = await GET(createGET('/api/context-cards', { status: 'draft' }))
    expect(res.status).toBe(400)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('词表外的 kind 400', async () => {
    const res = await GET(createGET('/api/context-cards', { kind: 'mood' }))
    expect(res.status).toBe(400)
    expect(mockList).not.toHaveBeenCalled()
  })
})

describe('POST /api/context-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreate.mockResolvedValue(CARD)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await POST(
      createPOST('/api/context-cards', {
        kind: CONTEXT_CARD_KIND_IDS.character,
        name: 'x',
      }),
    )
    expect(res.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('空名字 400', async () => {
    const res = await POST(
      createPOST('/api/context-cards', {
        kind: CONTEXT_CARD_KIND_IDS.character,
        name: '   ',
      }),
    )
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  /** ⛔ 参考图 URL 不走这条路 —— 递进来的多余字段整条请求拒掉。 */
  it('客户端递参考图 URL 进来 400', async () => {
    const res = await POST(
      createPOST('/api/context-cards', {
        kind: CONTEXT_CARD_KIND_IDS.character,
        name: 'Sigrika',
        images: [{ url: 'https://evil.example.com/x.png', role: 'sheet' }],
      }),
    )
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('合法载荷落到 service 上（摘要与正文缺省为空串）', async () => {
    const res = await POST(
      createPOST('/api/context-cards', {
        kind: CONTEXT_CARD_KIND_IDS.character,
        name: 'Sigrika',
      }),
    )
    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith('clerk_test_user', {
      kind: CONTEXT_CARD_KIND_IDS.character,
      name: 'Sigrika',
      summary: '',
      body: '',
      pinnedScopes: [],
    })
  })

  /** 上限是一条真的会拒的闸 —— 用户读得到一句话，⛔ 不静默丢弃。 */
  it('撞上限时 409 且带 i18n 键', async () => {
    mockCreate.mockRejectedValue(
      new ContextCardLimitError(CONTEXT_CARD_LIMITS.maxPerUser),
    )

    const res = await POST(
      createPOST('/api/context-cards', {
        kind: CONTEXT_CARD_KIND_IDS.style,
        name: 'one more',
      }),
    )
    expect(res.status).toBe(409)
    await expect(parseJSON(res)).resolves.toMatchObject({
      success: false,
      errorCode: 'CONTEXT_CARD_LIMIT_REACHED',
      i18nKey: 'errors.contextCard.limitReached',
    })
  })
})
