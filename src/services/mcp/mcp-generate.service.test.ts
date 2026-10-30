import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  mcpGenerationRequest: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  userApiKey: { findMany: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db }))

const mockResolvePicture = vi.fn()
vi.mock('@/features/assistant/workspace.service', () => ({
  resolvePicture: (...args: unknown[]) => mockResolvePicture(...args),
}))

const mockSubmit = vi.fn()
const mockStatus = vi.fn()
vi.mock('@/services/image/submit-image.service', () => ({
  submitImageGeneration: (...args: unknown[]) => mockSubmit(...args),
  checkImageGenerationStatus: (...args: unknown[]) => mockStatus(...args),
}))
vi.mock('@/services/model-config.service', () => ({
  getResolvedModelOptions: vi.fn(),
}))
vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/mcp/mcp-tools.service', () => ({
  McpToolError: class McpToolError extends Error {},
}))

import {
  createGenerationRequest,
  decideGenerationRequest,
  getGenerationForMcp,
} from '@/services/mcp/mcp-generate.service'

const OWNER = {
  tokenId: 'tok_1',
  userId: 'db_user_1',
  clerkId: 'clerk_1',
  access: 'generate' as const,
}
const NOW = new Date('2026-10-30T09:00:00.000Z')
const LATER = new Date('2026-10-30T10:00:00.000Z')

function stored(patch: Record<string, unknown> = {}) {
  return {
    id: 'req_1',
    userId: 'db_user_1',
    request: {
      count: 2,
      generate: { prompt: 'rain', modelId: 'm1', aspectRatio: '1:1' },
    },
    summary: '2 × m1 · 1:1',
    status: 'confirmed',
    jobIds: [],
    error: null,
    createdAt: NOW,
    expiresAt: LATER,
    ...patch,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('createGenerationRequest', () => {
  it('only records what to generate; nothing is submitted yet', async () => {
    db.mcpGenerationRequest.create.mockImplementation(
      async ({ data }: { data: { summary: string } }) => ({
        id: 'req_1',
        summary: data.summary,
      }),
    )

    const pending = await createGenerationRequest(
      OWNER,
      { prompt: 'rain', model: 'm1', count: 2 },
      NOW,
    )

    expect(pending.requestId).toBe('req_1')
    expect(pending.summary).toContain('2 × m1')
    const data = db.mcpGenerationRequest.create.mock.calls[0]![0].data
    expect(data).toMatchObject({
      userId: 'db_user_1',
      tokenId: 'tok_1',
      kind: 'image',
    })
    expect(data.expiresAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('refuses reference pictures that are not theirs', async () => {
    mockResolvePicture.mockResolvedValue(null)

    await expect(
      createGenerationRequest(OWNER, {
        prompt: 'rain',
        model: 'm1',
        references: ['图_9'],
      }),
    ).rejects.toThrow(/图_9/)
    expect(db.mcpGenerationRequest.create).not.toHaveBeenCalled()
  })
})

describe('decideGenerationRequest', () => {
  it('generates once per picture when this click wins the confirmation', async () => {
    db.mcpGenerationRequest.updateMany.mockResolvedValue({ count: 1 })
    db.mcpGenerationRequest.findFirst.mockResolvedValue(stored())
    mockSubmit
      .mockResolvedValueOnce({ jobId: 'j1' })
      .mockResolvedValueOnce({ jobId: 'j2' })

    const result = await decideGenerationRequest(OWNER, 'req_1', 'confirm', NOW)

    expect(db.mcpGenerationRequest.updateMany.mock.calls[0]![0].where).toEqual({
      id: 'req_1',
      userId: 'db_user_1',
      status: 'pending',
      expiresAt: { gt: NOW },
    })
    expect(mockSubmit).toHaveBeenCalledTimes(2)
    expect(mockSubmit.mock.calls[0]![0]).toBe('clerk_1')
    expect(result).toEqual({
      status: 'confirmed',
      jobIds: ['j1', 'j2'],
      error: null,
    })
  })

  it('generates nothing when the request was already decided elsewhere', async () => {
    db.mcpGenerationRequest.updateMany.mockResolvedValue({ count: 0 })
    db.mcpGenerationRequest.findFirst.mockResolvedValue(
      stored({ jobIds: ['j1'] }),
    )

    const result = await decideGenerationRequest(OWNER, 'req_1', 'confirm', NOW)

    expect(mockSubmit).not.toHaveBeenCalled()
    expect(result?.jobIds).toEqual(['j1'])
  })

  it('never generates on a decline', async () => {
    db.mcpGenerationRequest.updateMany.mockResolvedValue({ count: 1 })
    db.mcpGenerationRequest.findFirst.mockResolvedValue(
      stored({ status: 'declined' }),
    )

    const result = await decideGenerationRequest(OWNER, 'req_1', 'decline', NOW)

    expect(mockSubmit).not.toHaveBeenCalled()
    expect(result?.status).toBe('declined')
  })

  it('cannot reach someone else’s request', async () => {
    db.mcpGenerationRequest.updateMany.mockResolvedValue({ count: 0 })
    db.mcpGenerationRequest.findFirst.mockResolvedValue(null)

    expect(
      await decideGenerationRequest(OWNER, 'req_x', 'confirm', NOW),
    ).toBeNull()
    expect(mockSubmit).not.toHaveBeenCalled()
  })
})

describe('getGenerationForMcp', () => {
  it('says a request nobody confirmed in time was dropped', async () => {
    db.mcpGenerationRequest.findFirst.mockResolvedValue(
      stored({ status: 'pending', expiresAt: NOW }),
    )

    expect(await getGenerationForMcp(OWNER, 'req_1', LATER)).toMatch(/dropped/)
  })

  it('names finished pictures by number', async () => {
    db.mcpGenerationRequest.findFirst.mockResolvedValue(
      stored({ jobIds: ['j1', 'j2'] }),
    )
    mockStatus
      .mockResolvedValueOnce({
        jobId: 'j1',
        status: 'COMPLETED',
        generation: { id: 'g1', seq: 12, outputType: 'IMAGE' },
      })
      .mockResolvedValueOnce({ jobId: 'j2', status: 'IN_PROGRESS' })

    const text = await getGenerationForMcp(OWNER, 'req_1', NOW)

    expect(text).toMatch(/图_0*12: done/)
    expect(text).toMatch(/in progress/)
  })
})
