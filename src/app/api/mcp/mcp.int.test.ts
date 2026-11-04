/**
 * L2a 真库：`/api/mcp`（外部 AI 连进来的那一条）。令牌、项目、作品、角色、出图请求都是库里的行，
 * 路由 → MCP 服务 → 各工具服务全真。只假边界：Clerk 验 OAuth 令牌、限流的 Redis、
 * CDN 取图 / 执行 Worker（`fetch`）、R2 真 I/O。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)
const clerk = vi.hoisted(() => ({ verify: vi.fn() }))
vi.mock('@clerk/nextjs/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/nextjs/server')>()),
  clerkClient: async () => ({
    idPOAuthAccessToken: { verify: clerk.verify },
  }),
}))
const limiter = vi.hoisted(() => ({ allowed: true }))
vi.mock('@upstash/redis', () => ({ Redis: class {} }))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {}
    }
    async limit() {
      return { success: limiter.allowed, remaining: limiter.allowed ? 9 : 0 }
    }
  },
}))

import { MCP_TOKEN_PREFIX } from '@/constants/mcp'
import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { hashMcpToken } from '@/services/mcp/mcp-token.service'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import { seedGeneration } from '@/test/int/seed-generation'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

import { POST } from './route'

const TOKEN = `${MCP_TOKEN_PREFIX}route-test`
const NOW = '2026-09-28T00:00:00.000Z'

let me: Awaited<ReturnType<typeof createTestUser>>
let tokenId = ''
let projectId = ''
let worker: FakeExecutionWorker
/** CDN 上取不到的那几个地址。 */
let brokenOnCdn = new Set<string>()
let nextId = 1

function mediaNode(id: string, kind: 'video' | 'image', url: string) {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind,
      subtype: kind === 'video' ? 'shot' : 'result',
      name: `${id}·name`,
      label: `${id}·name`,
      createdAt: NOW,
      ...(kind === 'video' ? { shotNo: 1 } : {}),
      outputs: { versions: [{ id: `${id}_v1`, url, createdAt: NOW }], cur: 0 },
    },
  }
}

const STATE = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [mediaNode('v1', 'video', `${FAKE_CDN}/shots/v1.mp4`)],
  edges: [],
  edit: {
    name: '成片',
    tracks: {
      video: [{ id: 'c1', sourceNodeId: 'v1', in: 0, out: 4 }],
      audio: [],
      music: [],
      text: [],
    },
    settings: {},
  },
})

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  clerk.verify.mockReset()
  limiter.allowed = true
  brokenOnCdn = new Set()
  me = await createTestUser()
  tokenId = (
    await db.mcpToken.create({
      data: {
        userId: me.id,
        name: 'Claude Code',
        tokenHash: hashMcpToken(TOKEN),
        last4: TOKEN.slice(-4),
        access: 'generate',
      },
    })
  ).id
  projectId = (
    await db.nodeWorkflowProject.create({
      data: {
        userId: me.id,
        name: '短片',
        state: JSON.parse(JSON.stringify(STATE)),
      },
    })
  ).id
  worker = installFakeExecutionWorker({
    other: (url) =>
      url.startsWith(FAKE_CDN) && ![...brokenOnCdn].some((u) => url.endsWith(u))
        ? new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'image/jpeg' },
          })
        : new Response('not found', { status: 404 }),
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const setAccess = (access: 'read' | 'edit' | 'generate') =>
  db.mcpToken.update({ where: { id: tokenId }, data: { access } })

/** 回包可能是 JSON，也可能是一段 SSE：取最后一帧。 */
async function bodyOf(response: Response) {
  const text = await response.text()
  const json = text.includes('data:')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .pop()
    : text
  return json ? (JSON.parse(json) as Record<string, unknown>) : null
}

/** 一次 JSON-RPC 往返。 */
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
  return { status: response.status, body: await bodyOf(response) }
}

const call = async (name: string, args: Record<string, unknown> = {}) =>
  resultOf((await rpc('tools/call', { name, arguments: args })).body)

function resultOf(body: Record<string, unknown> | null) {
  return body?.result as {
    tools?: { name: string; inputSchema?: unknown }[]
    content?: { type: string; text?: string; data?: string }[]
    isError?: boolean
  }
}

const textOf = (result: ReturnType<typeof resultOf>) =>
  (result.content ?? []).map((part) => part.text ?? '').join('\n')

describe('/api/mcp', () => {
  it('没带令牌：401，什么工具都不跑；验不过的令牌同样 401', async () => {
    expect((await rpc('tools/list', {}, null)).status).toBe(401)
    expect(
      (await rpc('tools/list', {}, `${MCP_TOKEN_PREFIX}nope`)).status,
    ).toBe(401)
  })

  it('列出读、写、出片与库里那几样工具', async () => {
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

  it('按令牌主人跑工具：列的是她的项目', async () => {
    const stranger = await createTestUser()
    await db.nodeWorkflowProject.create({
      data: { userId: stranger.id, name: '别人的', state: { nodes: [] } },
    })

    const text = textOf(await call('list_projects'))

    expect(text).toContain(projectId)
    expect(text).toContain('短片')
    expect(text).not.toContain('别人的')
  })

  it('取帧按图片内容回，带各自的标签；片段外的那一下说原因', async () => {
    const result = await call('look_at', {
      projectId,
      clipId: 'c1',
      times: [1, 99],
    })

    const content = result.content ?? []
    expect(content.filter((part) => part.type === 'image')).toEqual([
      { type: 'image', data: 'AQID', mimeType: 'image/jpeg' },
    ])
    expect(textOf(result)).toMatch(/99s.*outside/)
  })

  it('工具自己的拒绝翻成读得懂的错误结果', async () => {
    const result = await call('read_project', { projectId: 'nope' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('nope')
  })

  it('超了限流：拒，什么都不读', async () => {
    limiter.allowed = false

    const result = await call('list_projects')

    expect(result.isError).toBe(true)
    expect(textOf(result)).not.toContain('短片')
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
  return bodyOf(response)
}

describe('/api/mcp generate（她在客户端里确认）', () => {
  const ARGS = { prompt: 'rainy street', model: AI_MODELS.OPENAI_GPT_IMAGE_2 }
  const requests = () =>
    db.mcpGenerationRequest.findMany({ where: { userId: me.id } })
  const jobs = () => db.generationJob.findMany({ where: { userId: me.id } })

  it('出图之前先请客户端确认：只记下请求，一张都还没出', async () => {
    const body = await rpc2026('generate', ARGS)
    const result = body?.result as Record<string, unknown>

    const [pending] = await requests()
    expect(result.resultType).toBe('input_required')
    expect(result.requestState).toBe(pending!.id)
    expect(JSON.stringify(result.inputRequests)).toContain('elicitation/create')
    expect(pending).toMatchObject({ status: 'pending' })
    expect(await jobs()).toEqual([])
  })

  it('她在客户端点了确认：出图，请求记成已确认', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const asked = (await rpc2026('generate', ARGS))?.result as {
      requestState: string
    }

    const body = await rpc2026('generate', ARGS, {
      requestState: asked.requestState,
      inputResponses: {
        confirm: { action: 'accept', content: { confirm: true } },
      },
    })

    expect(JSON.stringify(body?.result)).toContain('Confirmed')
    expect(await jobs()).toHaveLength(1)
    expect(worker.requests).toHaveLength(1)
    expect((await requests())[0]).toMatchObject({ status: 'confirmed' })
  })

  it('她拒了：记下拒绝，一张都不出', async () => {
    const asked = (await rpc2026('generate', ARGS))?.result as {
      requestState: string
    }

    const body = await rpc2026('generate', ARGS, {
      requestState: asked.requestState,
      inputResponses: { confirm: { action: 'decline' } },
    })

    expect(JSON.stringify(body?.result)).toContain('declined')
    expect((await requests())[0]).toMatchObject({ status: 'declined' })
    expect(await jobs()).toEqual([])
  })

  it('客户端弹不了确认框：叫她去网站上确认', async () => {
    const body = await rpc2026('generate', ARGS, {}, {})

    const [pending] = await requests()
    const text = JSON.stringify(body?.result)
    expect(text).toContain('/settings/connections')
    expect(text).toContain(pending!.id)
    expect(pending).toMatchObject({ status: 'pending' })
  })

  it('令牌不许出图：说去哪里改，不落请求', async () => {
    await setAccess('edit')

    const body = await rpc2026('generate', ARGS)

    expect(JSON.stringify(body?.result)).toContain('Settings → Connections')
    expect(await requests()).toEqual([])
  })
})

describe('/api/mcp OAuth（Claude.ai / ChatGPT 连接）', () => {
  it('没签名的客户端：401，指向资源元数据', async () => {
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

  it('不带 ANTEI 前缀的令牌当 Clerk OAuth 令牌验；第一次连上只看', async () => {
    clerk.verify.mockResolvedValue({
      clientId: 'client_abcd1234',
      subject: me.clerkId,
      revoked: false,
      expired: false,
      createdAt: Date.now() - 60_000,
    })

    const { body } = await rpc(
      'tools/call',
      { name: 'find', arguments: {} },
      'oat_abc',
    )

    expect(clerk.verify).toHaveBeenCalledWith('oat_abc')
    expect(resultOf(body).isError).toBeFalsy()
    expect(
      await db.mcpToken.findFirst({
        where: { userId: me.id, oauthClientId: 'client_abcd1234' },
      }),
    ).toMatchObject({ access: 'read' })
  })
})

describe('/api/mcp 权限档', () => {
  it('只看的连接要改：拒，并说去哪里调', async () => {
    await setAccess('read')
    await createTestCard(me.id, { name: 'Mio' })

    const result = await call('edit', {
      changes: [
        { op: 'character_profile', character: '角色·Mio', name: 'Mia' },
      ],
    })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/Settings → Connections/)
    expect(
      await db.characterCard.count({ where: { userId: me.id, name: 'Mio' } }),
    ).toBe(1)
  })

  it('只看的连接可以查', async () => {
    await setAccess('read')

    expect((await call('find')).isError).toBeFalsy()
  })
})

describe('/api/mcp find / look', () => {
  it('按令牌主人查库', async () => {
    await createTestCard(me.id, { name: 'Mio' })
    const stranger = await createTestUser()
    await createTestCard(stranger.id, { name: 'Mio 别人的' })

    const result = await call('find', { query: 'Mio', kinds: ['characters'] })

    expect(result.content?.[0]?.type).toBe('text')
    expect(textOf(result)).toContain('角色·Mio')
    expect(textOf(result)).not.toContain('别人的')
  })

  it('look 打开的先回文字，后面跟它的图；取不到的那张说原因', async () => {
    await seedGeneration(me.id, {
      seq: 12,
      outputType: 'IMAGE',
      status: 'COMPLETED',
      url: `${FAKE_CDN}/generations/12.png`,
    })
    await seedGeneration(me.id, {
      seq: 13,
      outputType: 'IMAGE',
      status: 'COMPLETED',
      url: `${FAKE_CDN}/generations/13.png`,
    })
    brokenOnCdn.add('/generations/13.png')

    const result = await call('look', { names: ['图_012', '图_013'] })

    const content = result.content ?? []
    expect(content.filter((part) => part.type === 'image')).toHaveLength(1)
    expect(content[0]).toMatchObject({ type: 'text' })
    expect(content[0]!.text).toContain('图_012')
    expect(textOf(result)).toMatch(/图_013[^\n]*: /)
  })
})

describe('/api/mcp apply_ops', () => {
  const speedUp = {
    op: 'edit_update_clip',
    track: 'video',
    clipId: 'c1',
    patch: { speed: 2 },
  }
  const stateOf = async () =>
    NodeWorkflowStateV4Schema.parse(
      (
        await db.nodeWorkflowProject.findUniqueOrThrow({
          where: { id: projectId },
        })
      ).state,
    )
  const versionNow = async () =>
    (
      JSON.parse(textOf(await call('read_project', { projectId }))) as {
        version: string
      }
    ).version

  it('不提供出图或只读的那几种 op', async () => {
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

  it('按令牌主人整批落下，回新版本号', async () => {
    const baseVersion = await versionNow()

    const result = await call('apply_ops', {
      projectId,
      baseVersion,
      ops: [speedUp],
    })

    expect(JSON.parse(textOf(result))).toMatchObject({ applied: 1 })
    expect((await stateOf()).edit?.tracks.video[0]?.speed).toBe(2)
  })

  it('出图的 op 在跑任何服务之前就拒，项目不动', async () => {
    const before = await stateOf()

    const { body } = await rpc('tools/call', {
      name: 'apply_ops',
      arguments: {
        projectId,
        baseVersion: await versionNow(),
        ops: [{ op: 'generate', target: 'v1' }],
      },
    })

    expect(resultOf(body)?.isError ?? body?.error).toBeTruthy()
    expect(await stateOf()).toEqual(before)
  })
})
