import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
} from '@/test/api-helpers'

vi.mock('@/services/kernel/assistant-operator.service', () => ({
  runAssistantOperator: vi.fn(async function* () {}),
}))
vi.mock('@/services/kernel/assistant-v3.service', () => ({
  runAssistantV3: vi.fn(async function* () {}),
}))
vi.mock('@/lib/assistant-operator-stream', () => ({
  toAssistantOperatorSseResponse: vi.fn(
    ({ events }: { events: (signal: AbortSignal) => unknown }) => {
      events(new AbortController().signal)
      return new Response('')
    },
  ),
}))

import { runAssistantOperator } from '@/services/kernel/assistant-operator.service'
import { runAssistantV3 } from '@/services/kernel/assistant-v3.service'

import { POST } from './route'

function body(
  domain: 'canvas' | 'image' | 'lora' | 'video',
  kernel?: 'v2' | 'v3',
) {
  return {
    messages: [{ role: 'user', content: '看看这张' }],
    domain,
    workspaceKey:
      domain === 'canvas'
        ? 'canvas:project-1'
        : domain === 'lora' || domain === 'video'
          ? domain
          : 'image-natural',
    snapshot: {
      prompt: '',
      availableModels: [],
      ...(domain === 'canvas'
        ? { canvas: { currentShotNo: null, selectedNodeIds: [], shots: [] } }
        : {}),
    },
    ...(kernel ? { kernel } : {}),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockRateLimitAllowed()
})

/** S6（owner 2026-10-09）：画布、LoRA 台、图片台默认走 v3，开关选 v2 才回旧内核；别的工作台还在旧内核上。 */
describe('POST /api/studio/assistant-operator · 走哪个内核', () => {
  it('画布默认走 v3，不看是不是管理员', async () => {
    await POST(createPOST('/api/studio/assistant-operator', body('canvas')))
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
    expect(runAssistantOperator).not.toHaveBeenCalled()
  })

  it('开关选了 v2：画布照走旧内核', async () => {
    await POST(
      createPOST('/api/studio/assistant-operator', body('canvas', 'v2')),
    )
    expect(runAssistantOperator).toHaveBeenCalledTimes(1)
    expect(runAssistantV3).not.toHaveBeenCalled()
  })

  it('LoRA 台默认走 v3，开关选 v2 照走旧内核', async () => {
    await POST(createPOST('/api/studio/assistant-operator', body('lora')))
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
    await POST(createPOST('/api/studio/assistant-operator', body('lora', 'v2')))
    expect(runAssistantOperator).toHaveBeenCalledTimes(1)
  })

  it('图片台默认走 v3，开关选 v2 照走旧内核', async () => {
    await POST(createPOST('/api/studio/assistant-operator', body('image')))
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
    await POST(
      createPOST('/api/studio/assistant-operator', body('image', 'v2')),
    )
    expect(runAssistantOperator).toHaveBeenCalledTimes(1)
  })

  it('视频台还在旧内核上，带着 v3 也一样', async () => {
    await POST(
      createPOST('/api/studio/assistant-operator', body('video', 'v3')),
    )
    expect(runAssistantOperator).toHaveBeenCalledTimes(1)
    expect(runAssistantV3).not.toHaveBeenCalled()
  })
})
