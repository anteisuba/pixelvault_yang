import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPUT,
} from '@/test/api-helpers'

vi.mock('@/services/project.service', () => ({
  reorderProjects: vi.fn(),
}))

import { PUT } from '@/app/api/projects/order/route'
import { reorderProjects } from '@/services/project.service'

const mockReorderProjects = vi.mocked(reorderProjects)

describe('PUT /api/projects/order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockReorderProjects.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await PUT(
      createPUT('/api/projects/order', { kind: 'pins', ids: ['a'] }),
    )
    expect(res.status).toBe(401)
  })

  it('rejects an unknown group kind', async () => {
    const res = await PUT(
      createPUT('/api/projects/order', { kind: 'everything', ids: ['a'] }),
    )
    expect(res.status).toBe(400)
  })

  it('reorders one level of the tree', async () => {
    const res = await PUT(
      createPUT('/api/projects/order', {
        kind: 'tree',
        parentId: null,
        ids: ['b', 'a'],
      }),
    )
    expect(res.status).toBe(200)
    expect(mockReorderProjects).toHaveBeenCalledWith('clerk_test_user', {
      kind: 'tree',
      parentId: null,
      ids: ['b', 'a'],
    })
  })
})
