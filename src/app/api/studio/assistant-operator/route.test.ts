import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
} from '@/test/api-helpers'

vi.mock('@/features/assistant/kernel', () => ({
  runAssistantNext: vi.fn(async function* () {}),
}))
vi.mock('@/lib/assistant-operator-stream', () => ({
  toAssistantOperatorSseResponse: vi.fn(
    ({ events }: { events: (signal: AbortSignal) => unknown }) => {
      events(new AbortController().signal)
      return new Response('')
    },
  ),
}))

import { runAssistantNext } from '@/features/assistant/kernel'

import { POST } from './route'

function body(domain: 'canvas' | 'image' | 'lora' | 'video' | 'cards') {
  return {
    messages: [{ role: 'user', content: '看看这张' }],
    domain,
    workspaceKey:
      domain === 'canvas'
        ? 'canvas:project-1'
        : domain === 'lora' || domain === 'video' || domain === 'cards'
          ? domain
          : 'image-natural',
    snapshot: {
      prompt: '',
      availableModels: [],
      ...(domain === 'canvas'
        ? { canvas: { currentShotNo: null, selectedNodeIds: [], shots: [] } }
        : {}),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockRateLimitAllowed()
})

/** 第 9c 步（owner 10-23）：所有人、所有台都走新内核；旧内核 v2 / v3 已删。 */
describe('POST /api/studio/assistant-operator · 一律新内核', () => {
  it.each(['image', 'lora', 'video', 'cards', 'canvas'] as const)(
    '%s 走新内核',
    async (domain) => {
      await POST(createPOST('/api/studio/assistant-operator', body(domain)))
      expect(runAssistantNext).toHaveBeenCalledTimes(1)
    },
  )

  it('旧页面还发着 kernel 字段：照收，照走新内核', async () => {
    await POST(
      createPOST('/api/studio/assistant-operator', {
        ...body('image'),
        kernel: 'v2',
      }),
    )
    expect(runAssistantNext).toHaveBeenCalledTimes(1)
  })
})
