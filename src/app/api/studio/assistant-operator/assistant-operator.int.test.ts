/**
 * L2a 真库：工作台助手的工具环接口。只假 Clerk 登录与模型那一头（SDK 包，见 `fake-model.ts`）；
 * 路由、新内核、库全真。第 9c 步（owner 10-23）：所有台都走新内核，旧页面带的 `kernel` 字段照收。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@ai-sdk/anthropic', async (importOriginal) =>
  (await import('@/test/assistant-bench/fake-model')).fakeAnthropic(
    await importOriginal(),
  ),
)
vi.mock('@ai-sdk/openai', async (importOriginal) =>
  (await import('@/test/assistant-bench/fake-model')).fakeOpenAI(
    await importOriginal(),
  ),
)

import { db } from '@/lib/db'
import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
} from '@/test/api-helpers'
import {
  fakeModels,
  resetFakeModels,
  scriptedModel,
  textTurn,
} from '@/test/assistant-bench/fake-model'
import {
  IMAGE_SNAPSHOT,
  kernelUser,
  LORA_SNAPSHOT,
} from '@/test/assistant-bench/kernel-harness'
import { resetDatabase } from '@/test/int/db'

import { POST } from './route'

const PATH = '/api/studio/assistant-operator'
type Domain = 'canvas' | 'image' | 'lora' | 'video' | 'cards'

let projectId = ''

beforeEach(async () => {
  await resetDatabase()
  resetFakeModels()
  const user = await kernelUser()
  projectId = (
    await db.nodeWorkflowProject.create({
      data: { userId: user.id, name: '短片', state: { nodes: [], edges: [] } },
    })
  ).id
  mockAuthenticated(user.clerkId)
  mockRateLimitAllowed()
})

function body(domain: Domain) {
  const workspaceKey =
    domain === 'canvas'
      ? `canvas:${projectId}`
      : domain === 'image'
        ? 'image-natural'
        : domain
  const snapshot =
    domain === 'lora'
      ? LORA_SNAPSHOT
      : domain === 'canvas'
        ? {
            prompt: '',
            availableModels: [],
            canvas: { currentShotNo: null, selectedNodeIds: [], shots: [] },
          }
        : domain === 'image'
          ? IMAGE_SNAPSHOT
          : domain === 'cards'
            ? {
                prompt: '',
                availableModels: [],
                cards: { total: 0, characters: [], open: null },
              }
            : { prompt: '', availableModels: [] }
  return {
    messages: [{ role: 'user', content: '看看这张' }],
    domain,
    workspaceKey,
    snapshot,
  }
}

/** 整条事件流读完，按帧拆开。 */
async function framesOf(response: Response) {
  const text = await response.text()
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice('data:'.length)) as { type: string })
}

describe('POST /api/studio/assistant-operator · 一律新内核', () => {
  it.each(['image', 'lora', 'video', 'cards', 'canvas'] as const)(
    '%s 走新内核：模型的话从事件流里出来，收在 done',
    async (domain) => {
      fakeModels.main = scriptedModel([textTurn('看到了。')])
      const response = await POST(createPOST(PATH, body(domain)))
      expect(response.status).toBe(200)
      const frames = await framesOf(response)
      expect(JSON.stringify(frames)).toContain('看到了。')
      expect(frames.at(-1)).toMatchObject({ type: 'done' })
      expect(fakeModels.main.doStreamCalls).toHaveLength(1)
    },
  )

  it('旧页面还发着 kernel 字段：照收，照走新内核', async () => {
    fakeModels.main = scriptedModel([textTurn('看到了。')])
    const response = await POST(
      createPOST(PATH, { ...body('image'), kernel: 'v2' }),
    )
    expect(response.status).toBe(200)
    expect(JSON.stringify(await framesOf(response))).toContain('看到了。')
    expect(fakeModels.main.doStreamCalls).toHaveLength(1)
  })
})
