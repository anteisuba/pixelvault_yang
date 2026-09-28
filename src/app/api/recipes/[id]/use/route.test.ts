import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockMarkUsed = vi.fn()

vi.mock('@/services/prompts/recipe.service', () => ({
  markRecipeUsed: (...args: unknown[]) => mockMarkUsed(...args),
}))

import { POST } from '@/app/api/recipes/[id]/use/route'
import { NextRequest } from 'next/server'

const CONTEXT = { params: Promise.resolve({ id: 'recipe_abc' }) }

function post(body: unknown) {
  return new NextRequest('http://localhost/api/recipes/recipe_abc/use', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/recipes/[id]/use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockMarkUsed.mockResolvedValue({
      id: 'recipe_abc',
      lastUsedAt: new Date('2026-09-28T04:00:00.000Z'),
    })
  })

  it('records the use for the signed-in owner', async () => {
    const response = await POST(post({}), CONTEXT)

    expect(response.status).toBe(200)
    expect(mockMarkUsed).toHaveBeenCalledWith(expect.any(String), 'recipe_abc')
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(true)
  })

  it('is 404 when the template is not theirs', async () => {
    mockMarkUsed.mockResolvedValueOnce(null)

    const response = await POST(post({}), CONTEXT)

    expect(response.status).toBe(404)
  })

  it('refuses a body with fields', async () => {
    const response = await POST(post({ usageCount: 99 }), CONTEXT)

    expect(response.status).toBe(400)
    expect(mockMarkUsed).not.toHaveBeenCalled()
  })

  it('is 401 when signed out', async () => {
    mockUnauthenticated()

    const response = await POST(post({}), CONTEXT)

    expect(response.status).toBe(401)
  })
})
