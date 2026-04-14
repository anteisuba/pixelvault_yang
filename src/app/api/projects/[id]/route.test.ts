import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPUT,
  createDELETE,
  parseJSON,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/project.service', () => ({
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

import { PUT, DELETE } from '@/app/api/projects/[id]/route'
import { updateProject, deleteProject } from '@/services/project.service'

const mockUpdateProject = vi.mocked(updateProject)
const mockDeleteProject = vi.mocked(deleteProject)

// ─── Helpers ──────────────────────────────────────────────────────

const FAKE_PROJECT = {
  id: 'proj_123',
  name: 'Test Project',
  description: null,
  generationCount: 5,
  latestGenerationUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const routeParams = (id: string) => ({
  params: Promise.resolve({ id }),
})

// ─── PUT Tests ───────────────────────────────────────────────────

describe('PUT /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockUpdateProject.mockResolvedValue(FAKE_PROJECT as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPUT('/api/projects/proj_123', { name: 'New Name' })
    const res = await PUT(req, routeParams('proj_123'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    const req = createPUT('/api/projects/proj_123', { name: '' })
    const res = await PUT(req, routeParams('proj_123'))
    expect(res.status).toBe(400)
  })

  it('updates project name successfully', async () => {
    const req = createPUT('/api/projects/proj_123', { name: 'Renamed' })
    const res = await PUT(req, routeParams('proj_123'))
    const json = await parseJSON<{
      success: boolean
      data: typeof FAKE_PROJECT
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toBeDefined()
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'clerk_test_user',
      'proj_123',
      { name: 'Renamed' },
    )
  })

  it('returns 500 when service throws', async () => {
    mockUpdateProject.mockRejectedValue(new Error('Not found'))
    const req = createPUT('/api/projects/proj_123', { name: 'Renamed' })
    const res = await PUT(req, routeParams('proj_123'))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
  })
})

// ─── DELETE Tests ────────────────────────────────────────────────

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockDeleteProject.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createDELETE('/api/projects/proj_123')
    const res = await DELETE(req, routeParams('proj_123'))
    expect(res.status).toBe(401)
  })

  it('deletes project and returns 204', async () => {
    const req = createDELETE('/api/projects/proj_123')
    const res = await DELETE(req, routeParams('proj_123'))

    expect(res.status).toBe(200)
    expect(mockDeleteProject).toHaveBeenCalledWith(
      'clerk_test_user',
      'proj_123',
    )
  })

  it('returns 500 when service throws', async () => {
    mockDeleteProject.mockRejectedValue(new Error('Not found'))
    const req = createDELETE('/api/projects/proj_123')
    const res = await DELETE(req, routeParams('proj_123'))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
  })
})
