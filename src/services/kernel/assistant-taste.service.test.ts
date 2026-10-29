import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  seesImages: vi.fn(),
  findPersona: vi.fn(),
  upsertPersona: vi.fn(),
  likeCount: vi.fn(),
  likeFind: vi.fn(),
  generationCount: vi.fn(),
  generationFind: vi.fn(),
  queryRaw: vi.fn(),
  listShown: vi.fn(),
  record: vi.fn(),
  complete: vi.fn(),
  conversationFind: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/constants/assistant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/assistant')>()),
  assistantAdapterSupportsImage: mocks.seesImages,
}))
vi.mock('@/lib/db', () => ({
  db: {
    assistantPersona: {
      findUnique: mocks.findPersona,
      upsert: mocks.upsertPersona,
    },
    userLike: { count: mocks.likeCount, findMany: mocks.likeFind },
    generation: {
      count: mocks.generationCount,
      findMany: mocks.generationFind,
    },
    assistantConversation: { findMany: mocks.conversationFind },
    $queryRaw: mocks.queryRaw,
  },
}))
vi.mock('@/services/assistant-memory.service', () => ({
  listAssistantMemoriesForReview: mocks.listShown,
  recordAssistantMemories: mocks.record,
}))
vi.mock('@/services/kernel/assistant-completion.service', () => ({
  completeAssistantTextWithContextRetry: mocks.complete,
}))
vi.mock('@/services/kernel/assistant-operator.service', () => ({
  resolveMemoryChanges: (draft: {
    memories: { kind: string; text: string }[]
  }) => ({ candidates: draft.memories, replacements: [], forget: [] }),
}))

import { maybeDistillTaste } from './assistant-taste.service'

const assistant = {
  route: {
    adapterType: 'gemini',
    apiKey: 'k',
    providerConfig: { label: 'Gemini', baseUrl: '' },
  },
  modelId: 'gemini-3.8-flash',
} as unknown as Parameters<typeof maybeDistillTaste>[0]['assistant']

describe('maybeDistillTaste（口味提炼）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.seesImages.mockReturnValue(true)
    mocks.findPersona.mockResolvedValue({ tasteDistilledAt: null })
    mocks.likeCount.mockResolvedValue(5)
    mocks.generationCount.mockResolvedValue(1)
    mocks.queryRaw
      .mockResolvedValueOnce([{ count: BigInt(3) }])
      .mockResolvedValueOnce([
        {
          id: 'g-1',
          url: 'https://cdn/x.png',
          prompt: 'soft backlight girl',
          state: 'approved',
          reason: null,
        },
        {
          id: 'g-2',
          url: 'https://cdn/y.png',
          prompt: 'glossy 3d render',
          state: 'blocked',
          reason: '塑料皮肤',
        },
      ])
    mocks.likeFind.mockResolvedValue([])
    mocks.generationFind.mockResolvedValue([])
    mocks.listShown.mockResolvedValue([])
    mocks.conversationFind.mockResolvedValue([
      {
        title: '逆光的猫',
        messages: [
          { kind: 'user', id: 'u1', text: '发色还是没变浅', attachments: [] },
          { kind: 'message', id: 'm1', text: '这次把参考图强度降了一档' },
        ],
      },
    ])
  })

  it('看不了图的型号不跑，一次库都不查', async () => {
    mocks.seesImages.mockReturnValue(false)
    expect(await maybeDistillTaste({ userId: 'u', assistant })).toBe(false)
    expect(mocks.findPersona).not.toHaveBeenCalled()
  })

  it('离上次不到一天不跑', async () => {
    mocks.findPersona.mockResolvedValue({
      tasteDistilledAt: new Date(Date.now() - 60_000),
    })
    expect(await maybeDistillTaste({ userId: 'u', assistant })).toBe(false)
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('新信号不够不跑', async () => {
    mocks.likeCount.mockResolvedValue(0)
    mocks.generationCount.mockResolvedValue(0)
    mocks.queryRaw.mockReset().mockResolvedValueOnce([{ count: BigInt(2) }])
    expect(await maybeDistillTaste({ userId: 'u', assistant })).toBe(false)
    expect(mocks.upsertPersona).not.toHaveBeenCalled()
  })

  it('攒够了：先记时间，再看留下 / 否掉的图，写进「关于你」', async () => {
    mocks.complete.mockResolvedValue(
      JSON.stringify({
        memories: [{ kind: 'preference', text: '偏好柔和逆光，不要塑料皮肤' }],
        forget: [],
      }),
    )
    expect(await maybeDistillTaste({ userId: 'u', assistant })).toBe(true)
    expect(mocks.upsertPersona.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.complete.mock.invocationCallOrder[0] ?? 0,
    )
    const call = mocks.complete.mock.calls[0]?.[0] as {
      imageData: string[]
      imageLabels: string[]
    }
    expect(call.imageData).toEqual(['https://cdn/x.png', 'https://cdn/y.png'])
    expect(call.imageLabels[1]).toContain('塑料皮肤')
    // 复盘：最近对话的结尾跟着一起给模型。
    const material = (
      mocks.complete.mock.calls[0]?.[0] as { buildUserPrompt: () => string }
    ).buildUserPrompt()
    expect(material).toContain('发色还是没变浅')
    expect(material).toContain('这次把参考图强度降了一档')
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u',
        scope: 'global',
        candidates: [
          { kind: 'preference', text: '偏好柔和逆光，不要塑料皮肤' },
        ],
      }),
    )
  })
})
