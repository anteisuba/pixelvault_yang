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
vi.mock('@/features/assistant/kernel', () => ({
  runAssistantNext: vi.fn(async function* () {}),
}))
/** owner = `ADMIN_USER_IDS` 里的那一位（`isAdmin`）。 */
const adminState = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('@/lib/admin', () => ({
  isAdmin: vi.fn(() => adminState.isAdmin),
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
import { runAssistantNext } from '@/features/assistant/kernel'

import { POST } from './route'

function body(
  domain: 'canvas' | 'image' | 'lora' | 'video' | 'cards',
  kernel?: 'v2' | 'v3' | 'next',
) {
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
    ...(kernel ? { kernel } : {}),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  adminState.isAdmin = true
  mockAuthenticated()
  mockRateLimitAllowed()
})

/**
 * S6（owner 2026-10-09）：五张脸（画布、LoRA 台、图片台、角色页、视频台）默认走 v3，开关选 v2
 * 才回旧内核 —— ⚠ 只有 owner 认这个开关（owner 2026-10-15，下面那组用例）。
 */
describe('POST /api/studio/assistant-operator · 走哪个内核', () => {
  it('画布默认走 v3，不看是不是管理员', async () => {
    await POST(createPOST('/api/studio/assistant-operator', body('canvas')))
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
    expect(runAssistantOperator).not.toHaveBeenCalled()
  })

  it('owner 开关选了 v2：画布照走旧内核', async () => {
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

  it('角色页默认走 v3', async () => {
    await POST(
      createPOST('/api/studio/assistant-operator', {
        messages: [{ role: 'user', content: '查一下罗恩' }],
        domain: 'cards',
        workspaceKey: 'cards',
        snapshot: {
          prompt: '',
          availableModels: [],
          cards: { total: 0, characters: [], open: null },
        },
      }),
    )
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
  })

  it('视频台默认走 v3，开关选 v2 照走旧内核', async () => {
    await POST(createPOST('/api/studio/assistant-operator', body('video')))
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
    await POST(
      createPOST('/api/studio/assistant-operator', body('video', 'v2')),
    )
    expect(runAssistantOperator).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/studio/assistant-operator · 旧内核开关只有 owner 认', () => {
  it.each(['canvas', 'lora', 'image', 'video'] as const)(
    '⛔ 不是 owner：%s 发了 v2 也照走 v3',
    async (domain) => {
      adminState.isAdmin = false
      await POST(
        createPOST('/api/studio/assistant-operator', body(domain, 'v2')),
      )
      expect(runAssistantV3).toHaveBeenCalledTimes(1)
      expect(runAssistantOperator).not.toHaveBeenCalled()
    },
  )

  it('不是 owner、也没发 v2：照常 v3', async () => {
    adminState.isAdmin = false
    await POST(createPOST('/api/studio/assistant-operator', body('image')))
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/studio/assistant-operator · 新内核（next）只给 owner、只接 ASSISTANT_NEXT_DOMAINS 的台', () => {
  it.each(['image', 'lora', 'video', 'cards', 'canvas'] as const)(
    'owner：%s 发了 next 走新内核',
    async (domain) => {
      await POST(
        createPOST('/api/studio/assistant-operator', body(domain, 'next')),
      )
      expect(runAssistantNext).toHaveBeenCalledTimes(1)
      expect(runAssistantV3).not.toHaveBeenCalled()
    },
  )

  it('⛔ 不是 owner：发了 next 照走 v3', async () => {
    adminState.isAdmin = false
    await POST(
      createPOST('/api/studio/assistant-operator', body('image', 'next')),
    )
    expect(runAssistantV3).toHaveBeenCalledTimes(1)
    expect(runAssistantNext).not.toHaveBeenCalled()
  })
})
