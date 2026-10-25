import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockAuthenticated, parseJSON } from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockSetFavorite = vi.fn()

vi.mock('@/services/prompts/recipe.service', () => ({
  setRecipeFavorite: (...args: unknown[]) => mockSetFavorite(...args),
}))

import { PUT } from '@/app/api/recipes/[id]/favorite/route'
import { NextRequest } from 'next/server'

const CONTEXT = { params: Promise.resolve({ id: 'recipe_abc' }) }

function put(body: unknown) {
  return new NextRequest('http://localhost/api/recipes/recipe_abc/favorite', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PUT /api/recipes/[id]/favorite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockSetFavorite.mockResolvedValue({ id: 'recipe_abc', isFavorite: true })
  })

  it('favorites the signed-in owner’s template', async () => {
    const response = await PUT(put({ isFavorite: true }), CONTEXT)

    expect(response.status).toBe(200)
    expect(mockSetFavorite).toHaveBeenCalledWith(
      expect.any(String),
      'recipe_abc',
      true,
    )
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(true)
  })

  it('is 404 when the template is not theirs', async () => {
    mockSetFavorite.mockResolvedValueOnce(null)

    const response = await PUT(put({ isFavorite: false }), CONTEXT)

    expect(response.status).toBe(404)
  })

  it('refuses extra fields', async () => {
    const response = await PUT(put({ isFavorite: true, version: 9 }), CONTEXT)

    expect(response.status).toBe(400)
    expect(mockSetFavorite).not.toHaveBeenCalled()
  })
})
