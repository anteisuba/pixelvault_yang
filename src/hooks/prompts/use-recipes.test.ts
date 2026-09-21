import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { listRecipesAPI } from '@/lib/api-client/recipes'
import type { RecipeRecord } from '@/types'
import { useRecipes } from './use-recipes'

vi.mock('@/lib/api-client/recipes', () => ({ listRecipesAPI: vi.fn() }))
const api = vi.mocked(listRecipesAPI)
const recipe = (id: number) => ({ id: String(id) }) as RecipeRecord
beforeEach(() => vi.clearAllMocks())

it('loads every page and does not truncate when saving a new template', async () => {
  api
    .mockResolvedValueOnce({
      success: true,
      data: {
        recipes: Array.from({ length: 50 }, (_, i) => recipe(i)),
        total: 51,
      },
    })
    .mockResolvedValueOnce({
      success: true,
      data: { recipes: [recipe(50)], total: 51 },
    })
  const { result } = renderHook(() => useRecipes())
  await waitFor(() => expect(result.current.recipes).toHaveLength(51))
  expect(api).toHaveBeenNthCalledWith(2, 2, 50)
  act(() => result.current.addRecipe(recipe(51)))
  expect(result.current.recipes).toHaveLength(52)
})

it('reports a failed later page and retries instead of presenting a partial list as complete', async () => {
  api
    .mockResolvedValueOnce({
      success: true,
      data: { recipes: [recipe(1)], total: 2 },
    })
    .mockResolvedValueOnce({ success: false, error: 'offline' })
  const { result } = renderHook(() => useRecipes())
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.recipes).toHaveLength(0)
  api.mockResolvedValueOnce({
    success: true,
    data: { recipes: [recipe(1), recipe(2)], total: 2 },
  })
  await act(() => result.current.refresh())
  expect(result.current.error).toBe(false)
  expect(result.current.recipes).toHaveLength(2)
})

it('waits until the picker opens', async () => {
  api.mockResolvedValue({ success: true, data: { recipes: [], total: 0 } })
  const { rerender } = renderHook(({ enabled }) => useRecipes(enabled), {
    initialProps: { enabled: false },
  })
  expect(api).not.toHaveBeenCalled()
  rerender({ enabled: true })
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
})
