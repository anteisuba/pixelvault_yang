/**
 * L2a 真库：MCP 的读项目 / 看画面 / 改画布 / 出片工具。
 * 项目行直接落库，读写都走真的画布服务与真渲染服务。
 * 只假边界：CDN 抽帧与渲染 worker（fetch）、next-intl 的服务端取词。核返回值、项目行与任务行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { en } = await import('@/messages')
  return {
    getTranslations: async (options: { namespace: string }) =>
      createTranslator({
        locale: 'en',
        messages: en,
        namespace: options.namespace as never,
      }),
  }
})

import { db } from '@/lib/db'
import {
  applyOpsForMcp,
  getRenderForMcp,
  listProjectsForMcp,
  lookAtForMcp,
  McpToolError,
  readProjectForMcp,
  renderForMcp,
} from '@/services/mcp/mcp-tools.service'
import {
  RENDER_DRAFT_JOB_MODEL,
  RENDER_JOB_ADAPTER,
  RENDER_JOB_MODEL,
  RENDER_JOB_PROVIDER,
  RENDER_MAX_ACTIVE_JOBS_PER_USER,
} from '@/services/video/render-video.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

const CDN = 'https://cdn.test.com'
const RENDER_WORKER = 'https://render.test'
const NOW = '2026-09-28T00:00:00.000Z'

function mediaNode(
  id: string,
  kind: 'video' | 'image',
  url: string,
  shotNo?: number,
) {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind,
      subtype: kind === 'video' ? 'shot' : 'result',
      name: `${id}·name`,
      label: `${id}·name`,
      createdAt: NOW,
      ...(shotNo !== undefined ? { shotNo } : {}),
      outputs: { versions: [{ id: `${id}_v1`, url, createdAt: NOW }], cur: 0 },
    },
  }
}

const STATE = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [
    mediaNode('v1', 'video', `${CDN}/shots/v1.mp4`, 1),
    mediaNode('v2', 'video', 'https://fal.media/v2.mp4', 2),
    mediaNode('i1', 'image', `${CDN}/images/i1.png`, 1),
  ],
  edges: [],
  edit: {
    name: '成片',
    tracks: {
      video: [
        { id: 'c1', sourceNodeId: 'v1', in: 2, out: 6 },
        { id: 'c2', sourceNodeId: 'v2', in: 0, out: 3 },
      ],
      audio: [],
      music: [{ id: 'm1', sourceNodeId: 'a1', in: 0, out: 7 }],
      text: [],
    },
    settings: {},
  },
})

const json = (value: unknown) => JSON.parse(JSON.stringify(value))

let me: Awaited<ReturnType<typeof createTestUser>>
let owner: {
  tokenId: string
  userId: string
  clerkId: string
  access: 'generate'
}
let projectId: string
/** CDN 抽帧 / 渲染 worker 收到的请求地址与正文。 */
let fetched: { url: string; body?: Record<string, unknown> }[]
let cdnReply: (url: string) => Response

async function seedProject(state: unknown, name = '短片', lastActiveAt?: Date) {
  return db.nodeWorkflowProject.create({
    data: {
      userId: me.id,
      name,
      state: json(state),
      ...(lastActiveAt ? { lastActiveAt } : {}),
    },
  })
}
const stateOf = async (id: string) =>
  NodeWorkflowStateV4Schema.parse(
    (await db.nodeWorkflowProject.findUniqueOrThrow({ where: { id } })).state,
  )
const versionOf = async (id: string) =>
  (await readProjectForMcp(owner, { projectId: id })).version
const cdnUrls = () =>
  fetched.map((call) => call.url).filter((url) => url.startsWith(CDN))
const renderJobs = () =>
  db.generationJob.findMany({
    where: { userId: me.id, adapterType: RENDER_JOB_ADAPTER },
  })
function seedRenderJob(data: Record<string, unknown> = {}) {
  return db.generationJob.create({
    data: {
      userId: me.id,
      adapterType: RENDER_JOB_ADAPTER,
      provider: RENDER_JOB_PROVIDER,
      modelId: RENDER_JOB_MODEL,
      status: 'RUNNING',
      prompt: '成片',
      ...data,
    },
  })
}

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  owner = {
    tokenId: 'tok_1',
    userId: me.id,
    clerkId: me.clerkId,
    access: 'generate',
  }
  projectId = (await seedProject(STATE)).id
  fetched = []
  cdnReply = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/jpeg' },
    })
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
  vi.stubEnv('RENDER_WORKER_BASE_URL', RENDER_WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'secret')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      fetched.push({
        url,
        ...(typeof init?.body === 'string'
          ? { body: JSON.parse(init.body) }
          : {}),
      })
      if (url.startsWith(RENDER_WORKER)) return Response.json({ ok: true })
      return cdnReply(url)
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('listProjectsForMcp', () => {
  it('每个项目都概括一行，坏了的那个也不连累整张表', async () => {
    const old = await seedProject(
      { nodes: [{}, {}] },
      '旧项目',
      new Date('2026-01-01'),
    )
    const broken = await seedProject('garbage', '坏的', new Date('2025-01-01'))
    const strangers = await createTestUser()
    await db.nodeWorkflowProject.create({
      data: { userId: strangers.id, name: '别人的', state: json(STATE) },
    })

    const list = await listProjectsForMcp(owner)

    expect(list.map((row) => row.projectId)).toEqual([
      projectId,
      old.id,
      broken.id,
    ])
    expect(list[0]).toMatchObject({
      name: '短片',
      nodeCount: 3,
      timeline: { clipCount: 3, durationSec: 7 },
    })
    expect(list[0]).not.toHaveProperty('needsUpgrade')
    expect(list[1]).toMatchObject({ nodeCount: 2, needsUpgrade: true })
    expect(list[1]).not.toHaveProperty('timeline')
    expect(list[2]).toMatchObject({ nodeCount: 0, needsUpgrade: true })
  })
})

describe('readProjectForMcp', () => {
  it('读她自己的项目：版本号、时间线各段、镜头与每张卡当前那一版', async () => {
    const row = await db.nodeWorkflowProject.findUniqueOrThrow({
      where: { id: projectId },
    })

    const view = await readProjectForMcp(owner, { projectId })

    expect(view.version).toBe(row.updatedAt.toISOString())
    expect(view.timeline?.clips.map((clip) => clip.clipId)).toEqual([
      'c1',
      'c2',
      'm1',
    ])
    expect(view.canvas.shots.length).toBeGreaterThan(0)
    expect(view.takes).toEqual([
      { nodeId: 'v1', url: `${CDN}/shots/v1.mp4` },
      { nodeId: 'v2', url: 'https://fal.media/v2.mp4' },
      { nodeId: 'i1', url: `${CDN}/images/i1.png` },
    ])
  })

  it('不是她的项目：指她去 list_projects', async () => {
    const stranger = await createTestUser()

    await expect(
      readProjectForMcp(
        { ...owner, userId: stranger.id, clerkId: stranger.clerkId },
        { projectId },
      ),
    ).rejects.toThrow(/list_projects/)
  })

  it('还不是 v4：拒，⛔ 服务端替她升级', async () => {
    const legacy = await seedProject({ nodes: [], edges: [] })

    await expect(
      readProjectForMcp(owner, { projectId: legacy.id }),
    ).rejects.toBeInstanceOf(McpToolError)
    expect(
      (
        await db.nodeWorkflowProject.findUniqueOrThrow({
          where: { id: legacy.id },
        })
      ).state,
    ).toEqual({ nodes: [], edges: [] })
  })
})

describe('lookAtForMcp', () => {
  it('片段上的时间线秒数换算到素材入点之后', async () => {
    // c1 在时间线 0–4 秒，素材入点 2 秒：时间线 1.5 秒 = 素材 3.5 秒。
    const frames = await lookAtForMcp(owner, {
      projectId,
      clipId: 'c1',
      times: [1.5],
    })

    expect(frames[0]).toMatchObject({ ok: true, mimeType: 'image/jpeg' })
    expect(cdnUrls()).toEqual([
      `${CDN}/cdn-cgi/media/mode=frame,time=3500ms,fit=scale-down,width=512,format=jpg/${CDN}/shots/v1.mp4`,
    ])
  })

  it('每个时间点各答各的：片段外的给原因，不去取', async () => {
    const frames = await lookAtForMcp(owner, {
      projectId,
      clipId: 'c1',
      times: [1, 9],
    })

    expect(frames[0]?.ok).toBe(true)
    expect(frames[1]?.ok === false && frames[1].reason).toMatch(/outside/)
    expect(cdnUrls()).toHaveLength(1)
  })

  it('不在我们 CDN 上的素材一律不取', async () => {
    const frames = await lookAtForMcp(owner, {
      projectId,
      nodeId: 'v2',
      times: [1],
    })

    expect(frames[0]).toMatchObject({ ok: false })
    expect(fetched).toEqual([])
  })

  it('图片卡给一张缩过的 JPEG', async () => {
    await lookAtForMcp(owner, { projectId, nodeId: 'i1' })

    expect(cdnUrls()).toEqual([
      `${CDN}/cdn-cgi/image/width=512,fit=scale-down,format=jpeg/${CDN}/images/i1.png`,
    ])
  })

  it('音频片段没有画面：拒', async () => {
    await expect(
      lookAtForMcp(owner, { projectId, clipId: 'm1', times: [1] }),
    ).rejects.toThrow(/audio/)
  })

  it('CDN 抽不出某一帧时其余照给', async () => {
    cdnReply = (url) =>
      url.includes('time=100000ms')
        ? new Response('nope', { status: 415 })
        : new Response(new Uint8Array([1]), {
            headers: { 'content-type': 'image/jpeg' },
          })

    const frames = await lookAtForMcp(owner, {
      projectId,
      nodeId: 'v1',
      times: [100, 1],
    })

    expect(frames.map((frame) => frame.ok)).toEqual([false, true])
  })
})

describe('applyOpsForMcp', () => {
  const speedUp = {
    op: 'edit_update_clip' as const,
    track: 'video' as const,
    clipId: 'c1',
    patch: { speed: 2 },
  }

  it('按读到的版本号写回整批，回新版本号', async () => {
    const baseVersion = await versionOf(projectId)

    const result = await applyOpsForMcp(owner, {
      projectId,
      baseVersion,
      ops: [speedUp],
    })

    expect(result).toMatchObject({ applied: 1, skipped: [] })
    expect(result.version).not.toBe(baseVersion)
    expect(result.version).toBe(await versionOf(projectId))
    expect((await stateOf(projectId)).edit?.tracks.video[0]?.speed).toBe(2)
  })

  it('版本号过期：叫它重读，什么都不写', async () => {
    await expect(
      applyOpsForMcp(owner, {
        projectId,
        baseVersion: '2026-01-01T00:00:00.000Z',
        ops: [speedUp],
      }),
    ).rejects.toThrow(/Read it again/)
    expect((await stateOf(projectId)).edit?.tracks.video[0]?.speed).not.toBe(2)
  })

  it('读完到写入之间另一个标签页先存了：同样叫它重读', async () => {
    const baseVersion = await versionOf(projectId)
    const update = db.nodeWorkflowProject.update.bind(db.nodeWorkflowProject)
    vi.spyOn(db.nodeWorkflowProject, 'update').mockImplementationOnce((async (
      args: Parameters<typeof update>[0],
    ) => {
      await db.$executeRaw`UPDATE "NodeWorkflowProject" SET "updatedAt" = now() + interval '1 second' WHERE "id" = ${projectId}`
      return update(args)
    }) as unknown as typeof update)

    await expect(
      applyOpsForMcp(owner, { projectId, baseVersion, ops: [speedUp] }),
    ).rejects.toThrow(/Read it again/)
    expect((await stateOf(projectId)).edit?.tracks.video[0]?.speed).not.toBe(2)
  })

  it('一条都没落下就不写，并逐条说明为什么跳过', async () => {
    const baseVersion = await versionOf(projectId)

    const result = await applyOpsForMcp(owner, {
      projectId,
      baseVersion,
      ops: [
        { ...speedUp, clipId: 'nope' },
        { op: 'set_model', target: 'v1', modelId: 'some-model' },
      ],
    })

    expect(result.version).toBe(baseVersion)
    expect(await versionOf(projectId)).toBe(baseVersion)
    expect(result.applied).toBe(0)
    expect(result.skipped.map((skip) => [skip.index, skip.op])).toEqual([
      [0, 'edit_update_clip'],
      [1, 'set_model'],
    ])
    expect(result.skipped[1]?.reason).toMatch(/browser/)
  })

  it('不许把画布删空', async () => {
    const baseVersion = await versionOf(projectId)

    await expect(
      applyOpsForMcp(owner, {
        projectId,
        baseVersion,
        ops: ['v1', 'v2', 'i1'].map((target) => ({
          op: 'delete' as const,
          target,
        })),
      }),
    ).rejects.toThrow(/empty/)
    expect((await stateOf(projectId)).nodes).toHaveLength(3)
  })
})

describe('renderForMcp', () => {
  /** 夹具里配乐那段指向一张不存在的卡 —— 出片会（该）拒绝，这组先拿掉它。 */
  let playable: string

  beforeEach(async () => {
    playable = (
      await seedProject({
        ...STATE,
        edit: { ...STATE.edit, tracks: { ...STATE.edit!.tracks, music: [] } },
      })
    ).id
  })
  const dispatchedPlan = () => {
    const call = fetched.find((request) =>
      request.url.startsWith(RENDER_WORKER),
    )
    return call?.body as {
      outputKeyBase: string
      landing: Record<string, unknown>
      plan: {
        projectId: string
        output: Record<string, unknown>
        video: { id: string; in: number; out: number }[]
      }
    }
  }

  it('小样：剪辑台自己的方案缩到 480p，⛔ 落画布', async () => {
    const started = await renderForMcp(owner, {
      projectId: playable,
      kind: 'draft',
    })

    const [job] = await renderJobs()
    expect(started).toEqual({
      jobId: job!.id,
      kind: 'draft',
      status: 'queued',
      durationSec: 7,
    })
    expect(job!.modelId).toBe(RENDER_DRAFT_JOB_MODEL)
    const body = dispatchedPlan()
    expect(body.landing).toMatchObject({ draft: true, toCanvas: false })
    expect(body.plan.projectId).toBe(playable)
    expect(body.plan.output).toMatchObject({
      resolution: '480p',
      width: 852,
      height: 480,
    })
    expect(body.plan.video.map((segment) => segment.id)).toEqual(['c1', 'c2'])
  })

  it('只出一段的成片：只渲那一段，落回画布，「来源」用她的界面语言', async () => {
    await renderForMcp(owner, {
      projectId: playable,
      kind: 'final',
      clipId: 'c2',
      locale: 'en',
    })

    const [job] = await renderJobs()
    expect(job!.modelId).toBe(RENDER_JOB_MODEL)
    const body = dispatchedPlan()
    expect(body.landing).toMatchObject({
      draft: false,
      toCanvas: true,
      sourceLabel: 'From the edit desk · 成片',
    })
    expect(body.plan.output.resolution).toBe('1080p')
    expect(body.plan.video).toHaveLength(1)
    expect(body.plan.video[0]).toMatchObject({ id: 'c2', in: 0, out: 3 })
  })

  it('点名的片段不存在：说出来，⛔ 换别的渲', async () => {
    await expect(
      renderForMcp(owner, {
        projectId: playable,
        kind: 'draft',
        clipId: 'nope',
      }),
    ).rejects.toThrow(/No timeline clip nope/)
    expect(await renderJobs()).toEqual([])
  })

  it('有片段的卡没有素材：点名那段，一段都不渲', async () => {
    await expect(
      renderForMcp(owner, { projectId, kind: 'draft' }),
    ).rejects.toThrow(/Clip m1 has no playable source/)
    expect(await renderJobs()).toEqual([])
  })

  it('项目没有时间线：拒', async () => {
    const bare = await seedProject({ ...STATE, edit: undefined })

    await expect(
      renderForMcp(owner, { projectId: bare.id, kind: 'final' }),
    ).rejects.toThrow(McpToolError)
  })

  it('在飞的渲染已满：把上限说成一句话', async () => {
    for (let i = 0; i < RENDER_MAX_ACTIVE_JOBS_PER_USER; i += 1)
      await seedRenderJob({ status: 'QUEUED' })

    await expect(
      renderForMcp(owner, { projectId: playable, kind: 'draft' }),
    ).rejects.toThrow(/Could not start the render: Too many renders/)
  })
})

describe('getRenderForMcp', () => {
  it('跑完的成片：指出它落在了哪张卡上', async () => {
    const generation = await seedGeneration(me.id, {
      url: `${CDN}/renders/p1/job_1.mp4`,
    })
    const landed = mediaNode('cut', 'video', generation.url)
    const project = await seedProject({
      ...STATE,
      nodes: [
        ...STATE.nodes,
        {
          ...landed,
          data: {
            ...landed.data,
            outputs: {
              versions: [
                {
                  id: 'cut_v1',
                  url: generation.url,
                  createdAt: NOW,
                  generationId: generation.id,
                },
              ],
              cur: 0,
            },
          },
        },
      ],
    })
    const job = await seedRenderJob({
      status: 'COMPLETED',
      generationId: generation.id,
    })

    const view = await getRenderForMcp(owner, {
      projectId: project.id,
      jobId: job.id,
    })

    expect(view).toMatchObject({
      kind: 'final',
      status: 'completed',
      url: generation.url,
      landedNodeId: 'cut',
    })
  })

  it('小样从不落卡，也不去读项目', async () => {
    const job = await seedRenderJob({
      modelId: RENDER_DRAFT_JOB_MODEL,
      providerJobId: 'encode:0.4',
    })

    // 项目号是不存在的：要是去读项目就会报「没有这个项目」。
    const view = await getRenderForMcp(owner, {
      projectId: 'no-such-project',
      jobId: job.id,
    })

    expect(view).toEqual({
      jobId: job.id,
      kind: 'draft',
      status: 'running',
      name: '成片',
      step: 'encode',
      progress: 0.4,
    })
  })

  it('别人的任务（或没有这个任务）就是不存在', async () => {
    const stranger = await createTestUser()
    const foreign = await db.generationJob.create({
      data: {
        userId: stranger.id,
        adapterType: RENDER_JOB_ADAPTER,
        provider: RENDER_JOB_PROVIDER,
        modelId: RENDER_JOB_MODEL,
        status: 'RUNNING',
      },
    })

    await expect(
      getRenderForMcp(owner, { projectId, jobId: foreign.id }),
    ).rejects.toThrow(`No render ${foreign.id}`)
  })
})

describe('lookAtForMcp on a render', () => {
  it('从 CDN 抽渲好的片子的帧', async () => {
    const job = await seedRenderJob({
      status: 'COMPLETED',
      modelId: RENDER_DRAFT_JOB_MODEL,
      externalRequestId: 'renders/drafts/p1/abc',
    })

    const frames = await lookAtForMcp(owner, {
      projectId,
      renderJobId: job.id,
      times: [2.5],
    })

    expect(frames[0]).toMatchObject({ ok: true, label: '2.5s into the render' })
    expect(cdnUrls()).toEqual([
      `${CDN}/cdn-cgi/media/mode=frame,time=2500ms,fit=scale-down,width=512,format=jpg/${CDN}/renders/drafts/p1/abc.mp4`,
    ])
  })

  it('还没渲完：叫它去轮询 get_render', async () => {
    const job = await seedRenderJob({ modelId: RENDER_DRAFT_JOB_MODEL })

    await expect(
      lookAtForMcp(owner, { projectId, renderJobId: job.id, times: [1] }),
    ).rejects.toThrow(/Poll get_render/)
    expect(fetched).toEqual([])
  })
})
