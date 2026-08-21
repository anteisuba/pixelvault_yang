import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'
import { VISION_TASKS } from '@/constants/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'

vi.mock('@/services/vision/vision-analyzer.service', () => ({
  analyzeVisual: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn().mockResolvedValue({ id: 'db_user_1' }),
}))

import { analyzeVisual } from '@/services/vision/vision-analyzer.service'
import { POST } from './route'

const IMAGE_A = 'https://cdn.test.com/a.png'
const IMAGE_B = 'https://cdn.test.com/b.png'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/vision/analyze', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await POST(
      createPOST('/api/vision/analyze', {
        task: VISION_TASKS.characterIdentity,
        mediaUrls: [IMAGE_A],
        surface: ASSISTANT_SURFACE_IDS.imageStudio,
      }),
    )

    expect(res.status).toBe(401)
  })

  it('rejects a compare request that only carries one image', async () => {
    mockAuthenticated()
    mockRateLimitAllowed()

    const res = await POST(
      createPOST('/api/vision/analyze', {
        task: VISION_TASKS.compare,
        mediaUrls: [IMAGE_A],
        surface: ASSISTANT_SURFACE_IDS.imageStudio,
      }),
    )

    expect(res.status).toBe(400)
    expect(analyzeVisual).not.toHaveBeenCalled()
  })

  it('maps the wire field apiKeyId onto the service routeHint', async () => {
    mockAuthenticated()
    mockRateLimitAllowed()
    vi.mocked(analyzeVisual).mockResolvedValue({
      runId: 'run_1',
      task: VISION_TASKS.compare,
      grounded: false,
      observations: {
        task: VISION_TASKS.compare,
        differences: [],
        shared: [],
        uncertainties: [],
      },
      conclusions: [],
      model: 'gemini',
      borrowedRoute: true,
    })

    const res = await POST(
      createPOST('/api/vision/analyze', {
        task: VISION_TASKS.compare,
        mediaUrls: [IMAGE_A, IMAGE_B],
        surface: ASSISTANT_SURFACE_IDS.imageStudio,
        apiKeyId: 'key_deepseek',
        instruction: 'focus on the hands',
      }),
    )

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: true, data: { grounded: false } })
    expect(analyzeVisual).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'db_user_1',
        routeHint: 'key_deepseek',
        instruction: 'focus on the hands',
        mediaUrls: [IMAGE_A, IMAGE_B],
      }),
    )
  })
})
