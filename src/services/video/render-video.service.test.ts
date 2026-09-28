import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RENDER_STEP_IDS } from '@/constants/render-video'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockGetUser = vi.fn()
const mockCount = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockCreateJob = vi.fn()
const mockFailJob = vi.fn()
const mockCompleteJob = vi.fn()
const mockCreateGeneration = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      count: (...args: unknown[]) => mockCount(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: vi.fn(),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}))

vi.mock('@/services/user.service', () => ({
  getUserByClerkId: (...args: unknown[]) => mockGetUser(...args),
}))

vi.mock('@/services/usage.service', () => ({
  createGenerationJob: (...args: unknown[]) => mockCreateJob(...args),
  failGenerationJob: (...args: unknown[]) => mockFailJob(...args),
  completeGenerationJob: (...args: unknown[]) => mockCompleteJob(...args),
}))

vi.mock('@/services/generation.service', () => ({
  createGeneration: (...args: unknown[]) => mockCreateGeneration(...args),
}))

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const bundles = {
    en: (await import('@/messages/en.json')).default,
    zh: (await import('@/messages/zh.json')).default,
  }
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

const mockLand = vi.fn()
vi.mock('@/services/video/render-landing.service', () => ({
  landRenderOnCanvas: (...args: unknown[]) => mockLand(...args),
}))

const {
  RenderPlanSchema,
  RenderSubmitSchema,
  cancelRenderJob,
  decodeProgress,
  getRenderJob,
  handleRenderCallback,
  RENDER_DRAFT_JOB_MODEL,
  submitRenderJob,
} = await import('@/services/video/render-video.service')

function dispatched(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(init.body as string) as {
    outputKeyBase: string
    landing: Record<string, unknown>
  }
}

function acceptingWorker() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  process.env.RENDER_WORKER_BASE_URL = 'https://render.example.com'
  process.env.INTERNAL_CALLBACK_SECRET = 'secret'
  mockGetUser.mockResolvedValue({ id: 'user_1' })
  mockCount.mockResolvedValue(0)
  mockCreateJob.mockResolvedValue({ id: 'job_1', userId: 'user_1' })
  mockFailJob.mockResolvedValue({ id: 'job_1' })
  mockCompleteJob.mockResolvedValue({ id: 'job_1' })
})

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

describe('submitRenderJob', () => {
  it('建 job → 签名派发 → 回 jobId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ accepted: true }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const view = await submitRenderJob('clerk_1', {
      plan: plan(),
      toCanvas: true,
    } as never)

    expect(view).toMatchObject({ jobId: 'job_1', status: 'queued' })
    expect(mockCreateJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        adapterType: 'render-video',
        prompt: '成片',
      }),
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(
      (init.headers as Record<string, string>)['X-Execution-Signature'],
    ).toMatch(/^[0-9a-f]{64}$/)
  })

  it('落卡上下文随任务交给 worker（任务表里没地方放，结果回调原样带回）', async () => {
    const fetchMock = acceptingWorker()
    await submitRenderJob('clerk_1', {
      plan: plan({
        video: [
          plan().video[0],
          { ...plan().video[0], id: 'c2' },
          { ...plan().video[0], id: 'c3', sourceNodeId: 'v2' },
        ],
      }),
      toCanvas: true,
      locale: 'zh',
    } as never)

    const body = dispatched(fetchMock)
    expect(body.outputKeyBase).toBe('renders/proj_1/job_1')
    expect(body.landing).toEqual({
      draft: false,
      toCanvas: true,
      canvasProjectId: 'proj_1',
      sourceNodeIds: ['v1', 'v2'],
      sourceLabel: '来自剪辑台 · 成片',
    })
  })

  it('没带界面语言 → 「来源」用默认语言拼', async () => {
    const fetchMock = acceptingWorker()
    await submitRenderJob('clerk_1', { plan: plan(), toCanvas: false } as never)
    const body = dispatched(fetchMock)
    expect(body.landing).toMatchObject({ toCanvas: false })
    expect(body.landing.sourceLabel).toBe('From the edit desk · 成片')
  })

  it('小样：标记在模型上、输出路径在 drafts 下并记进任务，⛔ 不落画布', async () => {
    const fetchMock = acceptingWorker()
    const view = await submitRenderJob(
      'clerk_1',
      { plan: plan(), toCanvas: true } as never,
      { draft: true },
    )

    const created = mockCreateJob.mock.calls[0]![0] as {
      modelId: string
      externalRequestId: string
    }
    expect(created.modelId).toBe(RENDER_DRAFT_JOB_MODEL)
    expect(created.externalRequestId).toMatch(/^renders\/drafts\/proj_1\/.+/)
    const body = dispatched(fetchMock)
    expect(body.outputKeyBase).toBe(created.externalRequestId)
    expect(body.landing).toMatchObject({ draft: true, toCanvas: false })
    expect(view.draft).toBe(true)
  })

  it('worker 没部署时**大声**失败，并把 job 标 FAILED', async () => {
    delete process.env.RENDER_WORKER_BASE_URL
    await expect(
      submitRenderJob('clerk_1', { plan: plan(), toCanvas: true } as never),
    ).rejects.toThrow(/RENDER_WORKER_BASE_URL/)
    expect(mockFailJob).toHaveBeenCalledWith(
      'job_1',
      expect.objectContaining({ errorCode: 'RENDER_DISPATCH_FAILED' }),
    )
  })

  it('worker 拒收 → 502 + job 标 FAILED（⛔ 不留一个永远 QUEUED 的任务）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 500 })),
    )
    await expect(
      submitRenderJob('clerk_1', { plan: plan(), toCanvas: true } as never),
    ).rejects.toThrow(/Render worker rejected/)
    expect(mockFailJob).toHaveBeenCalled()
  })

  it('在飞任务过多 → 429（一期不扣积分，这就是那道闸）', async () => {
    mockCount.mockResolvedValue(2)
    await expect(
      submitRenderJob('clerk_1', { plan: plan(), toCanvas: true } as never),
    ).rejects.toThrow(/Too many renders/)
    expect(mockCreateJob).not.toHaveBeenCalled()
  })
})

describe('getRenderJob', () => {
  it('别人的任务当成没有 —— ⛔ 不回 403（那等于确认 id 存在）', async () => {
    mockFindUnique.mockResolvedValue({ id: 'job_1', userId: 'someone_else' })
    expect(await getRenderJob('clerk_1', 'job_1')).toBeNull()
  })

  it('带出进度与产物', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'RUNNING',
      prompt: '成片',
      providerJobId: 'encode:0.58',
      generation: {
        id: 'gen_1',
        url: 'https://cdn/out.mp4',
        thumbnailUrl: 'https://cdn/out.jpg',
        duration: 12,
      },
    })
    expect(await getRenderJob('clerk_1', 'job_1')).toEqual({
      jobId: 'job_1',
      status: 'running',
      name: '成片',
      step: RENDER_STEP_IDS.encode,
      progress: 0.58,
      url: 'https://cdn/out.mp4',
      thumbnailUrl: 'https://cdn/out.jpg',
      durationSec: 12,
      generationId: 'gen_1',
    })
  })
})

describe('getRenderJob · 小样', () => {
  it('跑完的小样没有 Generation —— 地址由记下的输出路径推出来', async () => {
    process.env.NEXT_PUBLIC_STORAGE_BASE_URL = 'https://cdn.test'
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'COMPLETED',
      prompt: '成片',
      modelId: RENDER_DRAFT_JOB_MODEL,
      externalRequestId: 'renders/drafts/proj_1/abc',
      generation: null,
    })
    expect(await getRenderJob('clerk_1', 'job_1')).toMatchObject({
      status: 'completed',
      url: 'https://cdn.test/renders/drafts/proj_1/abc.mp4',
      thumbnailUrl: 'https://cdn.test/renders/drafts/proj_1/abc.jpg',
      draft: true,
    })
  })

  it('还没跑完的小样不给地址', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'RUNNING',
      prompt: '成片',
      modelId: RENDER_DRAFT_JOB_MODEL,
      externalRequestId: 'renders/drafts/proj_1/abc',
      generation: null,
    })
    const view = await getRenderJob('clerk_1', 'job_1')
    expect(view?.url).toBeUndefined()
    expect(view?.draft).toBe(true)
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

describe('cancelRenderJob', () => {
  it('先落库再通知 worker；通知失败不影响取消结果', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'RUNNING',
      prompt: '成片',
      generation: null,
    })
    mockUpdateMany.mockResolvedValue({ count: 1 })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const view = await cancelRenderJob('clerk_1', 'job_1')
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    )
    expect(view?.jobId).toBe('job_1')
  })
})

describe('handleRenderCallback', () => {
  it('status 帧只推进度', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'QUEUED',
      startedAt: null,
    })
    const result = await handleRenderCallback({
      runId: 'job_1',
      jobId: 'job_1',
      kind: 'status',
      step: 'normalize',
      progress: 0.33,
    } as never)
    expect(result.action).toBe('progress')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RUNNING',
          providerJobId: 'normalize:0.33',
        }),
      }),
    )
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })

  it('result 帧写回 url / 封面 / 时长，并把 job 收尾', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'RUNNING',
      prompt: '我的成片',
    })
    mockCreateGeneration.mockResolvedValue({ id: 'gen_9' })

    const result = await handleRenderCallback({
      runId: 'job_1',
      jobId: 'job_1',
      kind: 'result',
      url: 'https://cdn/renders/proj_1/job_1.mp4',
      storageKey: 'renders/proj_1/job_1.mp4',
      thumbnailUrl: 'https://cdn/renders/proj_1/job_1.jpg',
      thumbnailStorageKey: 'renders/proj_1/job_1.jpg',
      mimeType: 'video/mp4',
      duration: 11.5,
      width: 1920,
      height: 1080,
      outputType: 'VIDEO',
    } as never)

    expect(result.action).toBe('completed')
    expect(mockCreateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cdn/renders/proj_1/job_1.mp4',
        thumbnailUrl: 'https://cdn/renders/proj_1/job_1.jpg',
        duration: 11.5,
        outputType: 'VIDEO',
        displayLabel: '我的成片',
        sourceSurface: 'EDIT',
        isFreeGeneration: true,
      }),
    )
    expect(mockCompleteJob).toHaveBeenCalledWith(
      'job_1',
      expect.objectContaining({ generationId: 'gen_9' }),
    )
  })

  it('已终态的 job 一律忽略 —— 取消之后迟到的完成帧不能把它复活', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'CANCELLED',
    })
    const result = await handleRenderCallback({
      runId: 'job_1',
      jobId: 'job_1',
      kind: 'result',
      url: 'https://cdn/x.mp4',
      storageKey: 'x.mp4',
    } as never)
    expect(result.action).toBe('ignored-terminal')
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })

  it('没有产物的 result 帧 = 失败', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'RUNNING',
    })
    const result = await handleRenderCallback({
      runId: 'job_1',
      jobId: 'job_1',
      kind: 'result',
      status: 'failed',
      error: 'ffmpeg exited 1',
    } as never)
    expect(result.action).toBe('failed')
    expect(mockFailJob).toHaveBeenCalledWith(
      'job_1',
      expect.objectContaining({ errorCode: 'RENDER_FAILED' }),
    )
  })
})

describe('handleRenderCallback · 落卡', () => {
  const landing = {
    draft: false,
    toCanvas: true,
    canvasProjectId: 'canvas_1',
    sourceNodeIds: ['v1', 'v2'],
    sourceLabel: '来自剪辑台 · 我的成片',
  }

  function result(extra: Record<string, unknown> = {}) {
    return {
      runId: 'job_1',
      jobId: 'job_1',
      kind: 'result',
      url: 'https://cdn/renders/proj_1/job_1.mp4',
      storageKey: 'renders/proj_1/job_1.mp4',
      thumbnailUrl: 'https://cdn/renders/proj_1/job_1.jpg',
      mimeType: 'video/mp4',
      outputType: 'VIDEO',
      ...extra,
    } as never
  }

  beforeEach(() => {
    mockFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: 'user_1',
      status: 'RUNNING',
      prompt: '我的成片',
    })
    mockCreateGeneration.mockResolvedValue({ id: 'gen_9' })
    mockLand.mockResolvedValue('node_cut')
  })

  it('先落卡、再标完成 —— 看到「完成」时卡已经在画布上', async () => {
    const outcome = await handleRenderCallback(result({ landing }))
    expect(outcome.action).toBe('completed')
    expect(mockLand).toHaveBeenCalledWith({
      userId: 'user_1',
      canvasProjectId: 'canvas_1',
      sourceNodeIds: ['v1', 'v2'],
      name: '我的成片',
      sourceLabel: '来自剪辑台 · 我的成片',
      generation: {
        id: 'gen_9',
        url: 'https://cdn/renders/proj_1/job_1.mp4',
        thumbnailUrl: 'https://cdn/renders/proj_1/job_1.jpg',
      },
    })
    expect(mockLand.mock.invocationCallOrder[0]!).toBeLessThan(
      mockCompleteJob.mock.invocationCallOrder[0]!,
    )
  })

  it('没勾「导出到画布」→ 不落卡', async () => {
    await handleRenderCallback(
      result({ landing: { ...landing, toCanvas: false } }),
    )
    expect(mockLand).not.toHaveBeenCalled()
    expect(mockCompleteJob).toHaveBeenCalled()
  })

  it('落卡抛错 → 只少一张卡，任务照样完成（⛔ 不让 worker 当成失败重渲）', async () => {
    mockLand.mockRejectedValue(new Error('db down'))
    const outcome = await handleRenderCallback(result({ landing }))
    expect(outcome.action).toBe('completed')
    expect(mockCompleteJob).toHaveBeenCalledWith(
      'job_1',
      expect.objectContaining({ generationId: 'gen_9' }),
    )
  })

  it('小样：不建 Generation、不落卡，只把任务收尾', async () => {
    const outcome = await handleRenderCallback(
      result({ landing: { ...landing, draft: true, toCanvas: false } }),
    )
    expect(outcome.action).toBe('completed-draft')
    expect(mockCreateGeneration).not.toHaveBeenCalled()
    expect(mockLand).not.toHaveBeenCalled()
    expect(mockCompleteJob).toHaveBeenCalledWith('job_1', { requestCount: 1 })
  })
})
