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

const {
  RenderPlanSchema,
  RenderSubmitSchema,
  cancelRenderJob,
  decodeProgress,
  getRenderJob,
  handleRenderCallback,
  submitRenderJob,
} = await import('@/services/video/render-video.service')

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
