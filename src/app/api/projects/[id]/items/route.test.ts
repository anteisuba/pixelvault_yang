import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPATCH,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/project.service', () => ({
  updateFolderItems: vi.fn(),
}))

import { PATCH } from '@/app/api/projects/[id]/items/route'
import { updateFolderItems } from '@/services/project.service'

const mockUpdateFolderItems = vi.mocked(updateFolderItems)

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('PATCH /api/projects/[id]/items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockUpdateFolderItems.mockResolvedValue({ added: ['g1'], removed: [] })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await PATCH(
      createPATCH('/api/projects/f1/items', { add: ['g1'] }),
      routeParams('f1'),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when there is nothing to add or remove', async () => {
    const res = await PATCH(
      createPATCH('/api/projects/f1/items', {}),
      routeParams('f1'),
    )
    expect(res.status).toBe(400)
    expect(mockUpdateFolderItems).not.toHaveBeenCalled()
  })

  it('adds and reports what was really added', async () => {
    const res = await PATCH(
      createPATCH('/api/projects/f1/items', { add: ['g1', 'g2'] }),
      routeParams('f1'),
    )
    const json = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(json.data).toEqual({ added: ['g1'], removed: [] })
    expect(mockUpdateFolderItems).toHaveBeenCalledWith(
      'clerk_test_user',
      'f1',
      {
        add: ['g1', 'g2'],
      },
    )
  })

  it('returns 404 when the folder is not theirs', async () => {
    mockUpdateFolderItems.mockResolvedValue(null)
    const res = await PATCH(
      createPATCH('/api/projects/f1/items', { remove: ['g1'] }),
      routeParams('f1'),
    )
    expect(res.status).toBe(404)
  })
})
