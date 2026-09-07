import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPATCH,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generation.service', () => ({
  setGenerationReviewState: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

import { PATCH } from '@/app/api/generations/[id]/review/route'
import { setGenerationReviewState } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const mockSetReviewState = vi.mocked(setGenerationReviewState)
const mockEnsureUser = vi.mocked(ensureUser)

// ─── Helpers ──────────────────────────────────────────────────────

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

function patch(id: string, body: unknown) {
  return new NextRequest(
    new URL(`/api/generations/${id}/review`, 'http://localhost:3000'),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

// ─── Tests ────────────────────────────────────────────────────────

describe('PATCH /api/generations/[id]/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockSetReviewState.mockResolvedValue({
      id: 'gen_123',
      state: 'blocked',
      previous: 'pending',
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await PATCH(
      createPATCH('/api/generations/gen_123/review'),
      routeParams('gen_123'),
    )
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
    expect(mockSetReviewState).not.toHaveBeenCalled()
  })

  /**
   * ⚠ 归属校验在**服务端**：不是他的行 → 服务返回 null → 工厂出 404。
   * 路由自己不查库（那会变成两处判据）。
   */
  it('returns 404 when the row is not the caller’s', async () => {
    mockSetReviewState.mockResolvedValue(null)
    const res = await PATCH(
      patch('gen_999', { state: 'blocked' }),
      routeParams('gen_999'),
    )
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(json.error).toBe('Generation not found or access denied')
  })

  it('marks blocked and hands back the previous state (for undo)', async () => {
    const res = await PATCH(
      patch('gen_123', { state: 'blocked', reason: '手指糊了' }),
      routeParams('gen_123'),
    )
    const json = await parseJSON<{
      success: boolean
      data: { id: string; state: string; previous: string }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.data).toEqual({
      id: 'gen_123',
      state: 'blocked',
      previous: 'pending',
    })
    expect(mockSetReviewState).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      'gen_123',
      'blocked',
      '手指糊了',
    )
  })

  /** ⚠ 不给理由 = 清掉上一次的（服务头注）—— 路由照旧透传 undefined。 */
  it('passes undefined when no reason is given', async () => {
    await PATCH(patch('gen_123', { state: 'approved' }), routeParams('gen_123'))

    expect(mockSetReviewState).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      'gen_123',
      'approved',
      undefined,
    )
  })

  it('rejects a state outside the vocabulary', async () => {
    const res = await PATCH(
      patch('gen_123', { state: 'maybe' }),
      routeParams('gen_123'),
    )

    expect(res.status).toBe(400)
    expect(mockSetReviewState).not.toHaveBeenCalled()
  })

  it('rejects an over-long reason', async () => {
    const res = await PATCH(
      patch('gen_123', { state: 'blocked', reason: 'x'.repeat(200) }),
      routeParams('gen_123'),
    )

    expect(res.status).toBe(400)
    expect(mockSetReviewState).not.toHaveBeenCalled()
  })
})
