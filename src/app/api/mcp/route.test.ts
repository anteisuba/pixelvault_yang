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

const mockVerifyOAuth = vi.fn()
vi.mock('@/services/mcp/mcp-oauth.service', () => ({
  verifyMcpOAuthToken: (...args: unknown[]) => mockVerifyOAuth(...args),
}))

const mockCreateRequest = vi.fn()
const mockReadPending = vi.fn()
const mockDecide = vi.fn()
const mockGetGeneration = vi.fn()
vi.mock('@/services/mcp/mcp-generate.service', () => ({
  createGenerationRequest: (...args: unknown[]) => mockCreateRequest(...args),
  readPendingSummary: (...args: unknown[]) => mockReadPending(...args),
  decideGenerationRequest: (...args: unknown[]) => mockDecide(...args),
  getGenerationForMcp: (...args: unknown[]) => mockGetGeneration(...args),
  listModelsForMcp: vi.fn(),
}))

const mockFind = vi.fn()
const mockLook = vi.fn()
const mockEdit = vi.fn()
vi.mock('@/services/mcp/mcp-edit.service', () => ({
  editForMcp: (...args: unknown[]) => mockEdit(...args),
  undoForMcp: vi.fn(),
}))
vi.mock('@/services/mcp/mcp-library.service', () => ({
  findForMcp: (...args: unknown[]) => mockFind(...args),
  lookForMcp: (...args: unknown[]) => mockLook(...args),
}))

import { McpToolError } from '@/services/mcp/mcp-tools.service'
import { MCP_TOKEN_PREFIX } from '@/constants/mcp'

import { POST } from './route'

const TOKEN = `${MCP_TOKEN_PREFIX}test`
const OWNER = {
  tokenId: 'tok_1',
  userId: 'db_user_1',
  clerkId: 'clerk_1',
  access: 'generate' as const,
}

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

  it('lists the read tools, the write tool, the two render tools and the library tools', async () => {
    const { status, body } = await rpc('tools/list')

    expect(status).toBe(200)
    expect(
      resultOf(body)
        .tools?.map((tool) => tool.name)
        .sort(),
    ).toEqual([
      'apply_ops',
      'edit',
      'find',
      'generate',
      'get_generation',
      'get_render',
      'list_models',
      'list_projects',
      'look',
      'look_at',
      'read_project',
      'render',
      'undo',
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

/** 2026-07-28 那一代（Claude Code 2.1 起）：每个请求自带信封，弹框走多轮往返。 */
async function rpc2026(
  name: string,
  args: Record<string, unknown>,
  extra: Record<string, unknown> = {},
  capabilities: Record<string, unknown> = { elicitation: { form: {} } },
): Promise<Record<string, unknown> | null> {
  const response = await POST(
    new Request('https://www.anteisuba.com/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': name,
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
          ...extra,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'test',
              version: '1',
            },
            'io.modelcontextprotocol/clientCapabilities': capabilities,
          },
        },
      }),
    }),
  )
  const text = await response.text()
  const line = text.includes('data:')
    ? text
        .split('\n')
        .filter((entry) => entry.startsWith('data:'))
        .map((entry) => entry.slice(5).trim())
        .pop()
    : text
  return line ? (JSON.parse(line) as Record<string, unknown>) : null
}

describe('/api/mcp generate (the user confirms)', () => {
  const ARGS = { prompt: 'rainy street', model: 'gemini-image' }
  const PENDING = { requestId: 'req_1', summary: '1 × gemini-image · 1:1' }

  it('asks the client to confirm before anything is generated', async () => {
    mockCreateRequest.mockResolvedValue(PENDING)

    const body = await rpc2026('generate', ARGS)
    const result = body?.result as Record<string, unknown>

    expect(result.resultType).toBe('input_required')
    expect(result.requestState).toBe('req_1')
    expect(JSON.stringify(result.inputRequests)).toContain('elicitation/create')
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('generates once the user accepts in the client', async () => {
    mockReadPending.mockResolvedValue(PENDING)
    mockDecide.mockResolvedValue({
      status: 'confirmed',
      jobIds: ['j1'],
      error: null,
    })
    mockGetGeneration.mockResolvedValue('Confirmed. in queue…')

    const body = await rpc2026('generate', ARGS, {
      requestState: 'req_1',
      inputResponses: {
        confirm: { action: 'accept', content: { confirm: true } },
      },
    })

    expect(mockDecide).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'db_user_1' }),
      'req_1',
      'confirm',
    )
    expect(JSON.stringify(body?.result)).toContain('Confirmed')
  })

  it('records a decline and generates nothing', async () => {
    mockReadPending.mockResolvedValue(PENDING)
    mockDecide.mockResolvedValue({
      status: 'declined',
      jobIds: [],
      error: null,
    })

    const body = await rpc2026('generate', ARGS, {
      requestState: 'req_1',
      inputResponses: { confirm: { action: 'decline' } },
    })

    expect(mockDecide).toHaveBeenCalledWith(
      expect.anything(),
      'req_1',
      'decline',
    )
    expect(JSON.stringify(body?.result)).toContain('declined')
  })

  it('sends the user to the website when the client cannot show a confirmation', async () => {
    mockCreateRequest.mockResolvedValue(PENDING)

    const body = await rpc2026('generate', ARGS, {}, {})

    const text = JSON.stringify(body?.result)
    expect(text).toContain('/settings/connections')
    expect(text).toContain('req_1')
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('needs a token that may generate', async () => {
    mockVerify.mockResolvedValue({ ...OWNER, access: 'edit' })

    const body = await rpc2026('generate', ARGS)

    expect(JSON.stringify(body?.result)).toContain('Settings → Connections')
    expect(mockCreateRequest).not.toHaveBeenCalled()
  })
})

describe('/api/mcp OAuth (Claude.ai / ChatGPT connectors)', () => {
  it('points an unsigned client at the resource metadata', async () => {
    const response = await POST(
      new Request('https://www.anteisuba.com/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://www.anteisuba.com/api/mcp/oauth-protected-resource"',
    )
  })

  it('treats a token without the ANTEI prefix as a Clerk OAuth access token', async () => {
    mockVerifyOAuth.mockResolvedValue({ ...OWNER, access: 'read' })
    mockFind.mockResolvedValue('PICTURES: none found')

    const { body } = await rpc(
      'tools/call',
      { name: 'find', arguments: {} },
      'oat_abc',
    )

    expect(mockVerifyOAuth).toHaveBeenCalledWith('oat_abc')
    expect(mockVerify).not.toHaveBeenCalled()
    expect(resultOf(body).isError).toBeFalsy()
  })
})

describe('/api/mcp access levels', () => {
  it('refuses a change from a view-only connection and says where to raise it', async () => {
    mockVerify.mockResolvedValue({ ...OWNER, access: 'read' })

    const { body } = await rpc('tools/call', {
      name: 'edit',
      arguments: { changes: [{ op: 'favorite_lora', lora: 'LoRA·x' }] },
    })

    expect(resultOf(body).isError).toBe(true)
    expect(resultOf(body).content?.[0]?.text).toMatch(/Settings → Connections/)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  it('lets a view-only connection look', async () => {
    mockVerify.mockResolvedValue({ ...OWNER, access: 'read' })
    mockFind.mockResolvedValue('PICTURES: none found')

    const { body } = await rpc('tools/call', {
      name: 'find',
      arguments: {},
    })

    expect(resultOf(body).isError).toBeFalsy()
  })
})

describe('/api/mcp find / look', () => {
  it('searches the library as the token’s owner', async () => {
    mockFind.mockResolvedValue('CHARACTERS\n角色·Mio')

    const { body } = await rpc('tools/call', {
      name: 'find',
      arguments: { query: 'Mio', kinds: ['characters'] },
    })

    expect(mockFind).toHaveBeenCalledWith(OWNER, {
      query: 'Mio',
      kinds: ['characters'],
    })
    expect(resultOf(body).content?.[0]).toMatchObject({
      type: 'text',
      text: 'CHARACTERS\n角色·Mio',
    })
  })

  it('returns what look opened as text followed by its pictures', async () => {
    mockLook.mockResolvedValue([
      {
        text: '图_12 · recipe',
        frames: [
          { label: '图_12', ok: true, mimeType: 'image/jpeg', base64: 'AAA' },
          {
            label: '图_13',
            ok: false,
            reason: 'timed out fetching this frame',
          },
        ],
      },
    ])

    const { body } = await rpc('tools/call', {
      name: 'look',
      arguments: { names: ['图_12'] },
    })

    expect(resultOf(body).content).toEqual([
      { type: 'text', text: '图_12 · recipe' },
      { type: 'text', text: '图_12' },
      { type: 'image', data: 'AAA', mimeType: 'image/jpeg' },
      { type: 'text', text: '图_13: timed out fetching this frame' },
    ])
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
