import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnsureUser = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockProjectFindMany = vi.fn()
const mockProjectCreate = vi.fn()
const mockProjectUpdate = vi.fn()
const mockProjectCount = vi.fn()
const mockTransaction = vi.fn()
const mockGenUpdateMany = vi.fn()
const mockGenFindMany = vi.fn()
const mockGenCount = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findMany: (...a: unknown[]) => mockProjectFindMany(...a),
      create: (...a: unknown[]) => mockProjectCreate(...a),
      update: (...a: unknown[]) => mockProjectUpdate(...a),
      count: (...a: unknown[]) => mockProjectCount(...a),
    },
    generation: {
      updateMany: (...a: unknown[]) => mockGenUpdateMany(...a),
      findMany: (...a: unknown[]) => mockGenFindMany(...a),
      count: (...a: unknown[]) => mockGenCount(...a),
    },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}))

import {
  listProjects,
  createProject,
  deleteProject,
  getProjectHistory,
} from '@/services/project.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_PROJECT_ROW = {
  id: 'proj_1',
  name: 'Design Sprint',
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { generations: 3 },
  generations: [{ url: 'https://example.com/thumb.png' }],
}
const FAKE_GENERATION_ROW = {
  id: 'gen_1',
  createdAt: new Date(),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://example.com/gen.png',
  storageKey: 'generations/u1/image/gen.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  duration: null,
  referenceImageUrl: null,
  prompt: 'A red circle',
  negativePrompt: null,
  model: 'seedream-4.5',
  provider: 'fal.ai',
  requestCount: 2,
  isPublic: false,
  isPromptPublic: false,
  userId: FAKE_USER.id,
}

describe('listProjects', () => {
  it('returns an empty list when no projects exist', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockProjectFindMany.mockResolvedValue([])
    const result = await listProjects('clerk_1')
    expect(result).toEqual([])
  })

  it('maps DB rows to ProjectRecord shape', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockProjectFindMany.mockResolvedValue([FAKE_PROJECT_ROW])
    const result = await listProjects('clerk_1')
    expect(result[0].name).toBe('Design Sprint')
    expect(result[0].generationCount).toBe(3)
    expect(result[0].latestGenerationUrl).toBe('https://example.com/thumb.png')
  })
})

describe('createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockProjectCount.mockResolvedValue(0)
    mockProjectCreate.mockResolvedValue(FAKE_PROJECT_ROW)
  })

  it('creates a project and returns a ProjectRecord', async () => {
    const result = await createProject('clerk_1', { name: 'Design Sprint' })
    expect(result.name).toBe('Design Sprint')
    expect(mockProjectCreate).toHaveBeenCalled()
  })

  it('throws when project limit is reached', async () => {
    mockProjectCount.mockResolvedValue(999)
    await expect(createProject('clerk_1', { name: 'Extra' })).rejects.toThrow(
      'Maximum',
    )
  })
})

describe('deleteProject', () => {
  it('runs in a transaction that nulls generation projectId then soft-deletes', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockGenUpdateMany.mockResolvedValue({})
    mockProjectUpdate.mockResolvedValue({})
    mockTransaction.mockResolvedValue([{}, {}])
    await deleteProject('clerk_1', 'proj_1')
    expect(mockTransaction).toHaveBeenCalled()
  })
})

describe('getProjectHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('skips exact count for unassigned history', async () => {
    mockGenFindMany.mockResolvedValue([FAKE_GENERATION_ROW])

    const result = await getProjectHistory('clerk_1', null, undefined, 20)

    expect(result.total).toBe(1)
    expect(result.hasMore).toBe(false)
    expect(mockGenCount).not.toHaveBeenCalled()
  })

  it('uses exact count for real project history', async () => {
    mockGenFindMany.mockResolvedValue([FAKE_GENERATION_ROW])
    mockGenCount.mockResolvedValue(8)

    const result = await getProjectHistory('clerk_1', 'proj_1', undefined, 20)

    expect(result.total).toBe(8)
    expect(mockGenCount).toHaveBeenCalledWith({
      where: { userId: FAKE_USER.id, projectId: 'proj_1' },
    })
  })
})
