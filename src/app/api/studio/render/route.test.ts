/**
 * `POST /api/studio/render` 的三件事：**auth → Zod → service**（Hard Rule 4）。
 *
 * ⚠ service 是桩：路由层不该知道 worker、不该知道 ffmpeg，⛔ 这里也不测它们。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/video/render-video.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/video/render-video.service')
  >('@/services/video/render-video.service')
  return {
    ...actual,
    submitRenderJob: vi.fn(),
    getRenderJob: vi.fn(),
    cancelRenderJob: vi.fn(),
  }
})

const { POST } = await import('@/app/api/studio/render/route')
const { GET } = await import('@/app/api/studio/render/[jobId]/route')
const { POST: CANCEL } =
  await import('@/app/api/studio/render/[jobId]/cancel/route')
const { submitRenderJob, getRenderJob, cancelRenderJob } =
  await import('@/services/video/render-video.service')

const mockSubmit = vi.mocked(submitRenderJob)
const mockGetJob = vi.mocked(getRenderJob)
const mockCancel = vi.mocked(cancelRenderJob)

const PLAN = {
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
      src: 'https://cdn.test/v1.mp4',
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
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/studio/render', () => {
  it('未登录 → 401，service 不被调用', async () => {
    mockUnauthenticated()
    const response = await POST(
      createPOST('/api/studio/render', { plan: PLAN, toCanvas: true }),
    )
    expect(response.status).toBe(401)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('载荷不合法 → 400，service 不被调用', async () => {
    mockAuthenticated()
    const response = await POST(
      createPOST('/api/studio/render', {
        plan: { ...PLAN, video: [] },
        toCanvas: true,
      }),
    )
    expect(response.status).toBe(400)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('合法载荷 → 交给 service，回 jobId', async () => {
    mockAuthenticated('clerk_1')
    mockSubmit.mockResolvedValue({
      jobId: 'job_1',
      status: 'queued',
      name: '成片',
    })
    const response = await POST(
      createPOST('/api/studio/render', { plan: PLAN, toCanvas: false }),
    )
    const body = (await parseJSON(response)) as { data?: unknown }
    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ jobId: 'job_1' })
    expect(mockSubmit).toHaveBeenCalledWith(
      'clerk_1',
      expect.objectContaining({ toCanvas: false }),
    )
  })
})

describe('GET /api/studio/render/[jobId]', () => {
  it('未登录 → 401', async () => {
    mockUnauthenticated()
    const response = await GET(createGET('/api/studio/render/job_1'), {
      params: Promise.resolve({ jobId: 'job_1' }),
    })
    expect(response.status).toBe(401)
  })

  it('不是自己的（service 回 null）→ 404，⛔ 不是 403', async () => {
    mockAuthenticated('clerk_1')
    mockGetJob.mockResolvedValue(null)
    const response = await GET(createGET('/api/studio/render/job_1'), {
      params: Promise.resolve({ jobId: 'job_1' }),
    })
    expect(response.status).toBe(404)
  })

  it('自己的 → 带出状态', async () => {
    mockAuthenticated('clerk_1')
    mockGetJob.mockResolvedValue({
      jobId: 'job_1',
      status: 'running',
      name: '成片',
      progress: 0.5,
    })
    const response = await GET(createGET('/api/studio/render/job_1'), {
      params: Promise.resolve({ jobId: 'job_1' }),
    })
    const body = (await parseJSON(response)) as { data?: unknown }
    expect(body.data).toMatchObject({ status: 'running', progress: 0.5 })
    expect(mockGetJob).toHaveBeenCalledWith('clerk_1', 'job_1')
  })
})

describe('POST /api/studio/render/[jobId]/cancel', () => {
  it('未登录 → 401', async () => {
    mockUnauthenticated()
    const response = await CANCEL(
      createPOST('/api/studio/render/job_1/cancel', {}),
      { params: Promise.resolve({ jobId: 'job_1' }) },
    )
    expect(response.status).toBe(401)
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('自己的 → 交给 service', async () => {
    mockAuthenticated('clerk_1')
    mockCancel.mockResolvedValue({
      jobId: 'job_1',
      status: 'cancelled',
      name: '成片',
    })
    const response = await CANCEL(
      createPOST('/api/studio/render/job_1/cancel', {}),
      { params: Promise.resolve({ jobId: 'job_1' }) },
    )
    const body = (await parseJSON(response)) as { data?: unknown }
    expect(body.data).toMatchObject({ status: 'cancelled' })
    expect(mockCancel).toHaveBeenCalledWith('clerk_1', 'job_1')
  })
})
