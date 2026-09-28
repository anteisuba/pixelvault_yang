import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))

const mockVerify = vi.fn()
vi.mock('@/services/mcp/mcp-token.service', () => ({
  verifyMcpToken: (...args: unknown[]) => mockVerify(...args),
}))

const mockList = vi.fn()
const mockRead = vi.fn()
const mockLookAt = vi.fn()
const mockApply = vi.fn()
vi.mock('@/services/mcp/mcp-tools.service', () => ({
  McpToolError: class McpToolError extends Error {},
  listProjectsForMcp: (...args: unknown[]) => mockList(...args),
  readProjectForMcp: (...args: unknown[]) => mockRead(...args),
  lookAtForMcp: (...args: unknown[]) => mockLookAt(...args),
  applyOpsForMcp: (...args: unknown[]) => mockApply(...args),
  renderForMcp: vi.fn(),
  getRenderForMcp: vi.fn(),
}))

import { McpToolError } from '@/services/mcp/mcp-tools.service'
import { MCP_TOKEN_PREFIX } from '@/constants/mcp'

import { POST } from './route'

const TOKEN = `${MCP_TOKEN_PREFIX}test`
const OWNER = { tokenId: 'tok_1', userId: 'db_user_1', clerkId: 'clerk_1' }

let nextId = 1

/** 一次 JSON-RPC 往返；回包可能是 JSON，也可能是一段 SSE。 */
async function rpc(
  method: string,
  params: Record<string, unknown> = {},
  token: string | null = TOKEN,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await POST(
    new Request('https://www.anteisuba.com/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    }),
  )
  const text = await response.text()
  const json = text.includes('data:')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .pop()
    : text
  return {
    status: response.status,
    body: json ? (JSON.parse(json) as Record<string, unknown>) : null,
  }
}

function resultOf(body: Record<string, unknown> | null) {
  return body?.result as {
    tools?: { name: string; inputSchema?: unknown }[]
    content?: { type: string; text?: string; data?: string }[]
    isError?: boolean
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue(OWNER)
  mockRateLimit.mockResolvedValue({ success: true, remaining: 10 })
})

describe('/api/mcp', () => {
  it('answers 401 without a bearer token, before any tool runs', async () => {
    const { status } = await rpc('tools/list', {}, null)

    expect(status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('answers 401 for a token that does not verify', async () => {
    mockVerify.mockResolvedValue(null)

    expect((await rpc('tools/list')).status).toBe(401)
  })

  it('lists the read tools, the write tool and the two render tools', async () => {
    const { status, body } = await rpc('tools/list')

    expect(status).toBe(200)
    expect(
      resultOf(body)
        .tools?.map((tool) => tool.name)
        .sort(),
    ).toEqual([
      'apply_ops',
      'get_render',
      'list_projects',
      'look_at',
      'read_project',
      'render',
    ])
  })

  it('runs a tool as the token’s owner', async () => {
    mockList.mockResolvedValue([{ projectId: 'p1', name: '短片' }])

    const { body } = await rpc('tools/call', {
      name: 'list_projects',
      arguments: {},
    })

    expect(mockList).toHaveBeenCalledWith(OWNER)
    expect(JSON.parse(resultOf(body).content?.[0]?.text ?? '')).toEqual([
      { projectId: 'p1', name: '短片' },
    ])
  })

  it('returns frames as image content with their labels', async () => {
    mockLookAt.mockResolvedValue([
      {
        label: '1s into the take',
        ok: true,
        mimeType: 'image/jpeg',
        base64: 'AAA=',
      },
      { label: '99s into the take', ok: false, reason: 'past the end' },
    ])

    const { body } = await rpc('tools/call', {
      name: 'look_at',
      arguments: { projectId: 'p1', nodeId: 'v1', times: [1, 99] },
    })

    expect(resultOf(body).content).toEqual([
      { type: 'text', text: '1s into the take' },
      { type: 'image', data: 'AAA=', mimeType: 'image/jpeg' },
      { type: 'text', text: '99s into the take: past the end' },
    ])
  })

  it('turns a tool’s own refusal into a readable error result', async () => {
    mockRead.mockRejectedValue(new McpToolError('No project nope.'))

    const { body } = await rpc('tools/call', {
      name: 'read_project',
      arguments: { projectId: 'nope' },
    })

    expect(resultOf(body)).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'No project nope.' }],
    })
  })

  it('hides an unexpected failure behind a generic message', async () => {
    mockRead.mockRejectedValue(
      new Error('connection reset by peer at 10.0.0.1'),
    )

    const { body } = await rpc('tools/call', {
      name: 'read_project',
      arguments: { projectId: 'p1' },
    })

    expect(resultOf(body).isError).toBe(true)
    expect(resultOf(body).content?.[0]?.text).not.toContain('10.0.0.1')
  })

  it('stops a caller who is over the rate limit', async () => {
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0 })

    const { body } = await rpc('tools/call', {
      name: 'list_projects',
      arguments: {},
    })

    expect(resultOf(body).isError).toBe(true)
    expect(mockList).not.toHaveBeenCalled()
  })
})

describe('/api/mcp apply_ops', () => {
  it('offers no op that generates or only reads', async () => {
    const { body } = await rpc('tools/list')
    const applyTool = resultOf(body).tools?.find(
      (tool) => tool.name === 'apply_ops',
    )
    const schema = JSON.stringify(applyTool?.inputSchema)

    expect(schema).toContain('"edit_update_clip"')
    expect(schema).toContain('"set_review_state"')
    expect(schema).not.toContain('"generate"')
    expect(schema).not.toContain('"read_canvas"')
  })

  it('applies a batch as the token’s owner', async () => {
    mockApply.mockResolvedValue({
      version: 'v2',
      applied: 1,
      skipped: [],
      changedNodeIds: [],
      createdNodeIds: [],
    })

    const { body } = await rpc('tools/call', {
      name: 'apply_ops',
      arguments: {
        projectId: 'p1',
        baseVersion: 'v1',
        ops: [
          {
            op: 'edit_update_clip',
            track: 'video',
            clipId: 'c1',
            patch: { speed: 2 },
          },
        ],
      },
    })

    expect(mockApply).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({ projectId: 'p1', baseVersion: 'v1' }),
    )
    expect(JSON.parse(resultOf(body).content?.[0]?.text ?? '')).toMatchObject({
      version: 'v2',
      applied: 1,
    })
  })

  it('refuses a generate op before any service runs', async () => {
    const { body } = await rpc('tools/call', {
      name: 'apply_ops',
      arguments: {
        projectId: 'p1',
        baseVersion: 'v1',
        ops: [{ op: 'generate', target: 'v1' }],
      },
    })

    expect(mockApply).not.toHaveBeenCalled()
    expect(resultOf(body)?.isError ?? body?.error).toBeTruthy()
  })
})
