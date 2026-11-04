/**
 * L2a 真库：导出成片（入队 → 查状态 → 取消 → worker 回写 → 落回画布）。
 * 只假边界：渲染 worker（fetch）、next-intl 的服务端取词。核任务行、作品行、画布与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { en, zh } = await import('@/messages')
  const bundles = { en, zh }
  return {
    getTranslations: async (options: {
      locale: keyof typeof bundles
      namespace: string
    }) =>
      createTranslator({
        locale: options.locale,
        messages: bundles[options.locale],
        namespace: options.namespace as never,
      }),
  }
})

import { RENDER_STEP_IDS, RENDER_WORKER } from '@/constants/render-video'
import { db } from '@/lib/db'
import {
  RenderPlanSchema,
  RenderSubmitSchema,
  cancelRenderJob,
  decodeProgress,
  getRenderJob,
  handleRenderCallback,
  RENDER_DRAFT_JOB_MODEL,
  RENDER_JOB_ADAPTER,
  RENDER_JOB_MODEL,
  RENDER_JOB_PROVIDER,
  submitRenderJob,
  toDraftRenderPlan,
  type RenderCallbackInput,
  type RenderSubmitInput,
} from '@/services/video/render-video.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

const WORKER = 'https://render.test'
const NOW = '2026-09-28T00:00:00.000Z'

function plan(patch: Record<string, unknown> = {}) {
  return {
    version: 1,
    name: '成片',
    projectId: 'proj_1',
    output: {
      aspect: '16:9',
      resolution: '1080p',
      width: 1920,
      height: 1080,
      fps: 25,
    },
    video: [
      {
        id: 'c1',
        src: 'https://cdn.example.com/v1.mp4',
        in: 0,
        out: 4,
        speed: 1,
        muted: false,
        transitionOut: 'none',
        transitionSec: 0,
        durationSec: 4,
        sourceNodeId: 'v1',
      },
    ],
    audio: [],
    music: [],
    totalDurationSec: 4,
    ...patch,
  }
}

describe('RenderPlanSchema', () => {
  it('放行一份最小合法计划', () => {
    expect(RenderPlanSchema.safeParse(plan()).success).toBe(true)
  })

  it('拒绝空的画面轨 —— 渲染不能出一条没有画面的片', () => {
    expect(RenderPlanSchema.safeParse(plan({ video: [] })).success).toBe(false)
  })

  it('拒绝不认识的载荷版本', () => {
    expect(RenderPlanSchema.safeParse(plan({ version: 2 })).success).toBe(false)
  })

  it('拒绝非 URL 的 src（浏览器来的东西一律不可信）', () => {
    expect(
      RenderPlanSchema.safeParse(
        plan({
          video: [{ ...plan().video[0], src: 'file:///etc/passwd' }],
        }),
      ).success,
    ).toBe(false)
  })

  it('toCanvas 缺省为 true', () => {
    const parsed = RenderSubmitSchema.parse({ plan: plan() })
    expect(parsed.toCanvas).toBe(true)
  })
})

describe('toDraftRenderPlan', () => {
  it('短边缩到 480、两边偶数，字幕同比缩；段一字不动', () => {
    const base = RenderPlanSchema.parse(
      plan({
        output: {
          aspect: '16:9',
          resolution: '720p',
          width: 1280,
          height: 720,
          fps: 25,
        },
        texts: [
          {
            id: 't1',
            text: '你好',
            startSec: 0,
            durationSec: 2,
            anchor: 'bc',
            fontSizePx: 36,
            marginPx: 45,
            tone: 'light',
            fadeSec: 0,
          },
        ],
      }),
    )
    const draft = toDraftRenderPlan(base)
    expect(draft.output).toEqual({
      aspect: '16:9',
      resolution: '480p',
      width: 852,
      height: 480,
      fps: 25,
    })
    expect(draft.texts[0]).toMatchObject({ fontSizePx: 24, marginPx: 30 })
    expect(draft.video).toEqual(base.video)
    expect(RenderPlanSchema.safeParse(draft).success).toBe(true)
  })

  it('竖屏也按短边缩', () => {
    const draft = toDraftRenderPlan(
      RenderPlanSchema.parse(
        plan({
          output: {
            aspect: '9:16',
            resolution: '720p',
            width: 720,
            height: 1280,
            fps: 25,
          },
        }),
      ),
    )
    expect(draft.output).toMatchObject({ width: 480, height: 852 })
  })
})

describe('decodeProgress', () => {
  it('认识的步骤才认', () => {
    expect(decodeProgress('encode:0.5')).toEqual({
      step: 'encode',
      progress: 0.5,
    })
    expect(decodeProgress('nonsense:1')).toEqual({ progress: 1 })
    expect(decodeProgress(null)).toEqual({})
  })
})

let me: Awaited<ReturnType<typeof createTestUser>>
/** 渲染 worker 收到的每一次请求；`reply` 决定它怎么回。 */
let sent: { url: string; body: Record<string, unknown>; headers: Headers }[]
let reply: () => Response | Promise<Response>

function submitInput(
  patch: Partial<RenderSubmitInput> & { plan?: unknown } = {},
): RenderSubmitInput {
  return RenderSubmitSchema.parse({ plan: plan(), toCanvas: true, ...patch })
}

const jobsOfMe = () => db.generationJob.findMany({ where: { userId: me.id } })

function seedRenderJob(
  data: Partial<{
    userId: string
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
    modelId: string
    adapterType: string
    externalRequestId: string
    providerJobId: string
    generationId: string
    prompt: string
  }> = {},
) {
  return db.generationJob.create({
    data: {
      userId: me.id,
      adapterType: RENDER_JOB_ADAPTER,
      provider: RENDER_JOB_PROVIDER,
      modelId: RENDER_JOB_MODEL,
      status: 'RUNNING',
      prompt: '我的成片',
      ...data,
    },
  })
}

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  sent = []
  reply = () => Response.json({ accepted: true })
  vi.stubEnv('RENDER_WORKER_BASE_URL', WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'secret')
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', 'https://cdn.test')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({
        url,
        body: JSON.parse(String(init.body)),
        headers: new Headers(init.headers),
      })
      return reply()
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('submitRenderJob', () => {
  it('建任务 → 签名派发给 worker → 回任务号', async () => {
    const view = await submitRenderJob(me.clerkId, submitInput())

    const [job] = await jobsOfMe()
    expect(view).toEqual({ jobId: job!.id, status: 'queued', name: '成片' })
    expect(job).toMatchObject({
      adapterType: RENDER_JOB_ADAPTER,
      modelId: RENDER_JOB_MODEL,
      prompt: '成片',
    })
    expect(['QUEUED', 'RUNNING']).toContain(job!.status)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe(`${WORKER}${RENDER_WORKER.SUBMIT_PATH}`)
    expect(sent[0]!.headers.get('X-Execution-Signature')).toMatch(
      /^[0-9a-f]{64}$/,
    )
  })

  it('落卡上下文随任务交给 worker（任务表里没地方放，结果回调原样带回）', async () => {
    await submitRenderJob(
      me.clerkId,
      submitInput({
        plan: plan({
          video: [
            plan().video[0],
            { ...plan().video[0], id: 'c2' },
            { ...plan().video[0], id: 'c3', sourceNodeId: 'v2' },
          ],
        }) as never,
        locale: 'zh',
      }),
    )

    const [job] = await jobsOfMe()
    expect(sent[0]!.body.outputKeyBase).toBe(`renders/proj_1/${job!.id}`)
    expect(sent[0]!.body.landing).toEqual({
      draft: false,
      toCanvas: true,
      canvasProjectId: 'proj_1',
      sourceNodeIds: ['v1', 'v2'],
      sourceLabel: '来自剪辑台 · 成片',
    })
  })

  it('没带界面语言 → 「来源」用默认语言拼', async () => {
    await submitRenderJob(me.clerkId, submitInput({ toCanvas: false }))

    expect(sent[0]!.body.landing).toMatchObject({
      toCanvas: false,
      sourceLabel: 'From the edit desk · 成片',
    })
  })

  it('小样：标记在模型上、输出路径在 drafts 下并记进任务，⛔ 不落画布', async () => {
    const view = await submitRenderJob(me.clerkId, submitInput(), {
      draft: true,
    })

    const [job] = await jobsOfMe()
    expect(job!.modelId).toBe(RENDER_DRAFT_JOB_MODEL)
    expect(job!.externalRequestId).toMatch(/^renders\/drafts\/proj_1\/.+/)
    expect(sent[0]!.body.outputKeyBase).toBe(job!.externalRequestId)
    expect(sent[0]!.body.landing).toMatchObject({
      draft: true,
      toCanvas: false,
    })
    expect(view.draft).toBe(true)
  })

  it('worker 没部署时大声失败，并把任务标 FAILED', async () => {
    vi.stubEnv('RENDER_WORKER_BASE_URL', '')

    await expect(submitRenderJob(me.clerkId, submitInput())).rejects.toThrow(
      /RENDER_WORKER_BASE_URL/,
    )
    const [job] = await jobsOfMe()
    expect(job).toMatchObject({
      status: 'FAILED',
      errorCode: 'RENDER_DISPATCH_FAILED',
    })
  })

  it('worker 拒收 → 抛错 + 任务标 FAILED（⛔ 不留一个永远 QUEUED 的任务）', async () => {
    reply = () => new Response('nope', { status: 500 })

    await expect(submitRenderJob(me.clerkId, submitInput())).rejects.toThrow(
      /Render worker rejected/,
    )
    expect((await jobsOfMe())[0]!.status).toBe('FAILED')
  })

  it('在飞任务已满 → 429，不再建任务（一期不扣积分，这就是那道闸）', async () => {
    await seedRenderJob({ status: 'QUEUED' })
    await seedRenderJob({ status: 'RUNNING' })

    await expect(
      submitRenderJob(me.clerkId, submitInput()),
    ).rejects.toMatchObject({
      errorCode: 'RENDER_TOO_MANY_ACTIVE',
      httpStatus: 429,
    })
    expect(await jobsOfMe()).toHaveLength(2)
    expect(sent).toEqual([])
  })
})

describe('getRenderJob', () => {
  it('别人的任务当成没有 —— ⛔ 不回 403（那等于确认 id 存在）', async () => {
    const other = await createTestUser()
    const job = await seedRenderJob({ userId: other.id })

    expect(await getRenderJob(me.clerkId, job.id)).toBeNull()
  })

  it('同一张表里的生成任务不是渲染 —— 当成没有', async () => {
    const job = await seedRenderJob({
      adapterType: 'fal',
      status: 'COMPLETED',
    })

    expect(await getRenderJob(me.clerkId, job.id)).toBeNull()
  })

  it('带出进度与产物', async () => {
    const generation = await seedGeneration(me.id, {
      thumbnailUrl: 'https://cdn.test/out.jpg',
      duration: 12,
    })
    const job = await seedRenderJob({
      prompt: '成片',
      providerJobId: 'encode:0.58',
      generationId: generation.id,
    })

    expect(await getRenderJob(me.clerkId, job.id)).toEqual({
      jobId: job.id,
      status: 'running',
      name: '成片',
      step: RENDER_STEP_IDS.encode,
      progress: 0.58,
      url: generation.url,
      thumbnailUrl: 'https://cdn.test/out.jpg',
      durationSec: 12,
      generationId: generation.id,
    })
  })

  it('跑完的小样没有作品 —— 地址由记下的输出路径推出来', async () => {
    const job = await seedRenderJob({
      status: 'COMPLETED',
      modelId: RENDER_DRAFT_JOB_MODEL,
      externalRequestId: 'renders/drafts/proj_1/abc',
    })

    expect(await getRenderJob(me.clerkId, job.id)).toMatchObject({
      status: 'completed',
      url: 'https://cdn.test/renders/drafts/proj_1/abc.mp4',
      thumbnailUrl: 'https://cdn.test/renders/drafts/proj_1/abc.jpg',
      draft: true,
    })
  })

  it('还没跑完的小样不给地址', async () => {
    const job = await seedRenderJob({
      modelId: RENDER_DRAFT_JOB_MODEL,
      externalRequestId: 'renders/drafts/proj_1/abc',
    })

    const view = await getRenderJob(me.clerkId, job.id)
    expect(view?.url).toBeUndefined()
    expect(view?.draft).toBe(true)
  })
})

describe('cancelRenderJob', () => {
  it('先落库再通知 worker；通知失败不影响取消结果', async () => {
    const job = await seedRenderJob()
    reply = () => Promise.reject(new Error('offline'))

    const view = await cancelRenderJob(me.clerkId, job.id)

    expect(view).toMatchObject({ jobId: job.id, status: 'cancelled' })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('CANCELLED')
    expect(sent.map((request) => request.url)).toEqual([
      `${WORKER}${RENDER_WORKER.CANCEL_PATH}`,
    ])
  })
})

describe('handleRenderCallback', () => {
  const resultFrame = (
    runId: string,
    extra: Record<string, unknown> = {},
  ): RenderCallbackInput =>
    ({
      runId,
      jobId: runId,
      kind: 'result',
      url: `https://cdn.test/renders/proj_1/${runId}.mp4`,
      storageKey: `renders/proj_1/${runId}.mp4`,
      thumbnailUrl: `https://cdn.test/renders/proj_1/${runId}.jpg`,
      thumbnailStorageKey: `renders/proj_1/${runId}.jpg`,
      mimeType: 'video/mp4',
      outputType: 'VIDEO',
      ...extra,
    }) as RenderCallbackInput
  const jobRow = (id: string) =>
    db.generationJob.findUniqueOrThrow({ where: { id } })

  it('status 帧只推进度', async () => {
    const job = await seedRenderJob({ status: 'QUEUED' })

    const result = await handleRenderCallback({
      runId: job.id,
      jobId: job.id,
      kind: 'status',
      step: 'normalize',
      progress: 0.33,
    } as RenderCallbackInput)

    expect(result.action).toBe('progress')
    expect(await jobRow(job.id)).toMatchObject({
      status: 'RUNNING',
      providerJobId: 'normalize:0.33',
      generationId: null,
    })
    expect(await db.generation.count()).toBe(0)
  })

  it('result 帧建作品（免费、来自剪辑台）并把任务收尾', async () => {
    const job = await seedRenderJob()

    const result = await handleRenderCallback(
      resultFrame(job.id, { duration: 11.5, width: 1920, height: 1080 }),
    )

    expect(result.action).toBe('completed')
    const row = await jobRow(job.id)
    expect(row.status).toBe('COMPLETED')
    const generation = await db.generation.findUniqueOrThrow({
      where: { id: row.generationId! },
    })
    expect(generation).toMatchObject({
      userId: me.id,
      url: `https://cdn.test/renders/proj_1/${job.id}.mp4`,
      thumbnailUrl: `https://cdn.test/renders/proj_1/${job.id}.jpg`,
      duration: 11.5,
      outputType: 'VIDEO',
      sourceSurface: 'EDIT',
      isFreeGeneration: true,
    })
    // 作品名用任务上的成片名（⛔ 退回提示词现算）。
    expect(
      (generation.snapshot as { displayName?: string }).displayName,
    ).toContain('我的成片')
  })

  it('已终态的任务一律忽略 —— 取消之后迟到的完成帧不能把它复活', async () => {
    const job = await seedRenderJob({ status: 'CANCELLED' })

    const result = await handleRenderCallback(resultFrame(job.id))

    expect(result.action).toBe('ignored-terminal')
    expect((await jobRow(job.id)).status).toBe('CANCELLED')
    expect(await db.generation.count()).toBe(0)
  })

  it('没有产物的 result 帧 = 失败', async () => {
    const job = await seedRenderJob()

    const result = await handleRenderCallback({
      runId: job.id,
      jobId: job.id,
      kind: 'result',
      status: 'failed',
      error: 'ffmpeg exited 1',
    } as RenderCallbackInput)

    expect(result.action).toBe('failed')
    expect(await jobRow(job.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'RENDER_FAILED',
    })
  })

  describe('落卡', () => {
    let projectId: string

    beforeEach(async () => {
      const shot = (id: string) => ({
        id,
        position: { x: 0, y: 0 },
        data: {
          kind: 'video',
          subtype: 'shot',
          name: id,
          label: id,
          status: 'done',
          createdAt: NOW,
          url: `https://cdn.test/${id}.mp4`,
        },
      })
      projectId = (
        await db.nodeWorkflowProject.create({
          data: {
            userId: me.id,
            name: 'canvas',
            state: JSON.parse(
              JSON.stringify(
                NodeWorkflowStateV4Schema.parse({
                  version: 4,
                  nodes: [shot('v1'), shot('v2')],
                  edges: [],
                }),
              ),
            ),
          },
        })
      ).id
    })

    const landing = () => ({
      draft: false,
      toCanvas: true,
      canvasProjectId: projectId,
      sourceNodeIds: ['v1', 'v2'],
      sourceLabel: '来自剪辑台 · 我的成片',
    })
    const nodesOnCanvas = async () =>
      NodeWorkflowStateV4Schema.parse(
        (
          await db.nodeWorkflowProject.findUniqueOrThrow({
            where: { id: projectId },
          })
        ).state,
      ).nodes

    it('成片落成画布上一张新卡，指向那件作品，任务完成', async () => {
      const job = await seedRenderJob()

      const outcome = await handleRenderCallback(
        resultFrame(job.id, { landing: landing() }),
      )

      expect(outcome.action).toBe('completed')
      const row = await jobRow(job.id)
      expect(row.status).toBe('COMPLETED')
      const nodes = await nodesOnCanvas()
      expect(nodes).toHaveLength(3)
      const cut = nodes.find((node) => !['v1', 'v2'].includes(node.id))
      expect(cut?.data.name).toBe('我的成片')
      expect(JSON.stringify(cut?.data)).toContain(row.generationId!)
    })

    it('没勾「导出到画布」→ 不落卡，任务照样完成', async () => {
      const job = await seedRenderJob()

      await handleRenderCallback(
        resultFrame(job.id, { landing: { ...landing(), toCanvas: false } }),
      )

      expect(await nodesOnCanvas()).toHaveLength(2)
      expect((await jobRow(job.id)).status).toBe('COMPLETED')
    })

    it('落卡写库抛错 → 只少一张卡，任务照样完成（⛔ 不让 worker 当成失败重渲）', async () => {
      const job = await seedRenderJob()
      vi.spyOn(db.nodeWorkflowProject, 'update').mockRejectedValue(
        new Error('db down'),
      )

      const outcome = await handleRenderCallback(
        resultFrame(job.id, { landing: landing() }),
      )

      expect(outcome.action).toBe('completed')
      const row = await jobRow(job.id)
      expect(row.status).toBe('COMPLETED')
      expect(row.generationId).toBeTruthy()
      expect(await nodesOnCanvas()).toHaveLength(2)
    })

    it('小样：不建作品、不落卡，只把任务收尾', async () => {
      const job = await seedRenderJob({ modelId: RENDER_DRAFT_JOB_MODEL })

      const outcome = await handleRenderCallback(
        resultFrame(job.id, {
          landing: { ...landing(), draft: true, toCanvas: false },
        }),
      )

      expect(outcome.action).toBe('completed-draft')
      expect(await jobRow(job.id)).toMatchObject({
        status: 'COMPLETED',
        generationId: null,
      })
      expect(await db.generation.count()).toBe(0)
      expect(await nodesOnCanvas()).toHaveLength(2)
    })
  })
})
