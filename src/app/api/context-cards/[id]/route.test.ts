import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createDELETE,
  createPATCH,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { CONTEXT_CARD_KIND_IDS } from '@/constants/context-cards'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/context-cards.service', () => ({
  getContextCardForClerkId: vi.fn(),
  updateContextCardForClerkId: vi.fn(),
  deleteContextCardForClerkId: vi.fn(),
}))

vi.mock('@/services/context-cards-avatar.service', () => ({
  purgeContextCardImages: vi.fn(),
}))

import { PATCH, DELETE } from './route'
import {
  deleteContextCardForClerkId,
  getContextCardForClerkId,
  updateContextCardForClerkId,
} from '@/services/context-cards.service'
import { purgeContextCardImages } from '@/services/context-cards-avatar.service'

const mockGet = vi.mocked(getContextCardForClerkId)
const mockUpdate = vi.mocked(updateContextCardForClerkId)
const mockDelete = vi.mocked(deleteContextCardForClerkId)
const mockPurge = vi.mocked(purgeContextCardImages)

const CARD_ID = 'card-1'
const routeParams = { params: Promise.resolve({ id: CARD_ID }) }

const CARD = {
  id: CARD_ID,
  kind: CONTEXT_CARD_KIND_IDS.character,
  name: 'Sigrika',
  summary: '',
  body: '',
  images: [
    {
      url: 'https://cdn.example.com/context-cards/u1/a.png',
      role: 'sheet' as const,
      sourceRef: null,
    },
  ],
  negative: null,
  pinnedScopes: ['video'],
  status: 'confirmed' as const,
  createdAt: '2026-09-07T10:00:00.000Z',
  updatedAt: '2026-09-07T10:00:00.000Z',
}

describe('PATCH /api/context-cards/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockUpdate.mockResolvedValue(CARD)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await PATCH(
      createPATCH(`/api/context-cards/${CARD_ID}`, { name: 'x' }),
      routeParams,
    )
    expect(res.status).toBe(401)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  /** 空 PATCH 是调用方的 bug，⛔ 不静默当成一次成功的空操作。 */
  it('空载荷 400', async () => {
    const res = await PATCH(
      createPATCH(`/api/context-cards/${CARD_ID}`, {}),
      routeParams,
    )
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('pin 与 pinnedScopes 同时给 400', async () => {
    const res = await PATCH(
      createPATCH(`/api/context-cards/${CARD_ID}`, {
        pinnedScopes: ['image'],
        pin: { scope: 'video', pinned: true },
      }),
      routeParams,
    )
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('常挂开关原样透传给 service（读改写在服务端）', async () => {
    const res = await PATCH(
      createPATCH(`/api/context-cards/${CARD_ID}`, {
        pin: { scope: 'video', pinned: true },
      }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith('clerk_test_user', CARD_ID, {
      pin: { scope: 'video', pinned: true },
    })
  })

  it('卡不属于这个用户时 404', async () => {
    mockUpdate.mockResolvedValue(null)
    const res = await PATCH(
      createPATCH(`/api/context-cards/${CARD_ID}`, { name: 'hijack' }),
      routeParams,
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/context-cards/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockGet.mockResolvedValue(CARD)
    mockDelete.mockResolvedValue(true)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await DELETE(
      createDELETE(`/api/context-cards/${CARD_ID}`),
      routeParams,
    )
    expect(res.status).toBe(401)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('卡不存在时 404，且一个对象都不清', async () => {
    mockGet.mockResolvedValue(null)
    const res = await DELETE(
      createDELETE(`/api/context-cards/${CARD_ID}`),
      routeParams,
    )
    expect(res.status).toBe(404)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockPurge).not.toHaveBeenCalled()
  })

  /** ⚠ 顺序：先读出图 → 删库 → 再清对象。 */
  it('删成功之后才清参考图对象', async () => {
    const res = await DELETE(
      createDELETE(`/api/context-cards/${CARD_ID}`),
      routeParams,
    )
    expect(res.status).toBe(200)
    await expect(parseJSON(res)).resolves.toEqual({ success: true, data: null })
    expect(mockDelete).toHaveBeenCalledWith('clerk_test_user', CARD_ID)
    expect(mockPurge).toHaveBeenCalledWith(CARD.images)
  })

  it('删库没删到时不清对象', async () => {
    mockDelete.mockResolvedValue(false)
    const res = await DELETE(
      createDELETE(`/api/context-cards/${CARD_ID}`),
      routeParams,
    )
    expect(res.status).toBe(404)
    expect(mockPurge).not.toHaveBeenCalled()
  })
})
