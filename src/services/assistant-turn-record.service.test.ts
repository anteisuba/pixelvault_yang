import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_PROMPT_VERSION } from '@/constants/assistant-v3'
import { Prisma } from '@/lib/generated/prisma/client'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const { record, after, warn } = vi.hoisted(() => ({
  record: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  after: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { assistantTurnRecord: record },
  isUniqueConstraintError: (error: unknown) =>
    (error as { code?: string } | null)?.code === 'P2002',
}))
vi.mock('next/server', () => ({ after }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn, error: vi.fn() },
}))

import {
  pruneAssistantTurnRecordsOfUser,
  pruneExpiredAssistantTurnRecords,
  recordAssistantTurn,
  writeAssistantTurnRecord,
  type AssistantTurnDraft,
} from './assistant-turn-record.service'

const TURN = '33b9bd2e-b43d-4cc9-872d-bb5d57f8d420'
const NOW = new Date('2026-10-15T12:00:00.000Z')
const PNG = `data:image/png;base64,${'A'.repeat(64)}`

const transcript: AssistantV3Transcript = [
  { type: 'board', text: 'BOARD', images: [], turn: { id: TURN, hop: 1 } },
  { type: 'assistant', text: '好了。', calls: [] },
]

function draft(
  overrides: Partial<AssistantTurnDraft> = {},
): AssistantTurnDraft {
  return {
    userId: 'user-1',
    turnId: TURN,
    hop: 1,
    outcome: 'done',
    request: {
      workspaceKey: 'canvas:project-1',
      domain: 'canvas',
      conversationId: 'conv-1',
      messages: [{ role: 'user', content: '断开高尔' }],
      snapshot: {
        prompt: '',
        availableModels: [],
        references: { items: [{ url: PNG }], limit: 16 },
      },
    } as AssistantOperatorRequest,
    transcript,
    adapterType: 'openai',
    modelId: 'gpt-6-luna',
    routeModel: 'auto',
    apiKeyId: 'key_openai',
    systemPrompt: 'SYSTEM',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  record.findUnique.mockResolvedValue(null)
  record.create.mockResolvedValue({ id: 'row-1' })
  record.updateMany.mockResolvedValue({ count: 1 })
  record.findMany.mockResolvedValue([])
  record.deleteMany.mockResolvedValue({ count: 0 })
})

describe('writeAssistantTurnRecord', () => {
  it('第一跳：建行 —— 快照（摘掉 data: 地址）、本轮记录、厂商 / 型号 / key 的 id、系统提示只存 sha256', async () => {
    await writeAssistantTurnRecord(draft())
    expect(record.findUnique).not.toHaveBeenCalled()
    expect(record.create).toHaveBeenCalledTimes(1)
    const data = record.create.mock.calls[0]![0].data
    expect(data).toMatchObject({
      userId: 'user-1',
      turnId: TURN,
      hops: 1,
      outcome: 'done',
      errorCode: null,
      workspaceKey: 'canvas:project-1',
      domain: 'canvas',
      projectId: 'project-1',
      conversationId: 'conv-1',
      adapterType: 'openai',
      modelId: 'gpt-6-luna',
      routeModel: 'auto',
      apiKeyId: 'key_openai',
      systemPromptHash: createHash('sha256').update('SYSTEM').digest('hex'),
      promptVersion: ASSISTANT_V3_PROMPT_VERSION,
      transcript,
      truncated: [],
    })
    expect(data.snapshot.references.items[0].url).toBe('data:,omitted')
    expect(data.snapshotBytes).toBeGreaterThan(0)
    expect(data.sizeBytes).toBeGreaterThan(data.snapshotBytes)
    expect(JSON.stringify(data)).not.toContain('SYSTEM')
    expect(JSON.stringify(data)).not.toContain('base64')
  })

  it('建完顺手删这个人的：30 天前的、超出最近 200 条的', async () => {
    record.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }])
    await writeAssistantTurnRecord(draft())
    expect(record.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'user-1', createdAt: { lt: expect.any(Date) } },
    })
    expect(record.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 200,
      select: { id: true },
    })
    expect(record.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 'user-1', id: { in: ['old-1', 'old-2'] } },
    })
  })

  it('接力的后几跳：找到同一行，只更新本轮记录、跳数与收尾；⛔ 不拿手上的快照盖开轮那份', async () => {
    record.findUnique.mockResolvedValue({
      id: 'row-1',
      hops: 1,
      snapshotBytes: 900,
      truncated: [],
    })
    await writeAssistantTurnRecord(
      draft({ hop: 2, outcome: 'awaiting_confirm' }),
    )
    expect(record.findUnique).toHaveBeenCalledWith({
      where: { userId_turnId: { userId: 'user-1', turnId: TURN } },
      select: { id: true, hops: true, snapshotBytes: true, truncated: true },
    })
    expect(record.create).not.toHaveBeenCalled()
    const call = record.updateMany.mock.calls[0]![0]
    expect(call.where).toEqual({
      id: 'row-1',
      userId: 'user-1',
      hops: { lte: 2 },
    })
    expect(call.data).toMatchObject({
      hops: 2,
      outcome: 'awaiting_confirm',
      errorCode: null,
      transcript,
      truncated: [],
    })
    expect(call.data).not.toHaveProperty('snapshot')
    expect(call.data.sizeBytes).toBeGreaterThan(900)
    // 后几跳不再删旧的：建行那一跳删过了。
    expect(record.deleteMany).not.toHaveBeenCalled()
  })

  it('更晚的一跳已经写过：⛔ 拿旧的盖新的', async () => {
    record.findUnique.mockResolvedValue({
      id: 'row-1',
      hops: 3,
      snapshotBytes: 0,
      truncated: [],
    })
    await writeAssistantTurnRecord(draft({ hop: 2 }))
    expect(record.updateMany).not.toHaveBeenCalled()
    expect(record.create).not.toHaveBeenCalled()
  })

  it('同一跳再来一次（硬停在交本轮记录之前，前端拿着上一跳的号接力）：照写，后到的盖先到的', async () => {
    record.findUnique.mockResolvedValue({
      id: 'row-1',
      hops: 2,
      snapshotBytes: 0,
      truncated: [],
    })
    await writeAssistantTurnRecord(draft({ hop: 2, outcome: 'done' }))
    expect(record.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'row-1', hops: { lte: 2 } },
      data: { hops: 2, outcome: 'done' },
    })
  })

  it('后几跳截到要丢快照：快照清成 NULL，缺口跟着行走', async () => {
    record.findUnique.mockResolvedValue({
      id: 'row-1',
      hops: 1,
      snapshotBytes: 300 * 1024,
      truncated: ['board_text'],
    })
    await writeAssistantTurnRecord(draft({ hop: 2 }))
    const data = record.updateMany.mock.calls[0]![0].data
    expect(data.snapshot).toBe(Prisma.DbNull)
    expect(data.snapshotBytes).toBe(0)
    // 本轮记录每一跳从头截一遍（上一跳的那几刀不留）；快照那一刀跟着行走。
    expect(data.truncated).toEqual([
      'signatures',
      'board_text',
      'result_outputs',
      'history',
      'assistant_text',
      'snapshot',
    ])
  })

  it('开轮那一跳丢过快照：后几跳照样记着', async () => {
    record.findUnique.mockResolvedValue({
      id: 'row-1',
      hops: 1,
      snapshotBytes: 0,
      truncated: ['board_text', 'snapshot'],
    })
    await writeAssistantTurnRecord(draft({ hop: 2 }))
    expect(record.updateMany.mock.calls[0]![0].data.truncated).toEqual([
      'snapshot',
    ])
  })

  it('第一跳没写成、由后面一跳建行：⛔ 不存手上的快照，记 no_opening_snapshot', async () => {
    await writeAssistantTurnRecord(draft({ hop: 2 }))
    const data = record.create.mock.calls[0]![0].data
    expect(data.snapshot).toBe(Prisma.DbNull)
    expect(data.snapshotBytes).toBe(0)
    expect(data.truncated).toEqual(['no_opening_snapshot'])
    expect(data.hops).toBe(2)
  })

  it('同一轮的另一跳先建了这一行（唯一键撞了）：不报错、不重试', async () => {
    record.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    )
    await expect(writeAssistantTurnRecord(draft())).resolves.toBeUndefined()
    expect(record.deleteMany).not.toHaveBeenCalled()
  })

  it('别的库错照抛（由 recordAssistantTurn 兜成警告）', async () => {
    record.create.mockRejectedValue(new Error('connection lost'))
    await expect(writeAssistantTurnRecord(draft())).rejects.toThrow(
      'connection lost',
    )
  })

  it('截到最后还放不下：这一跳不写，记一行警告', async () => {
    const huge: AssistantV3Transcript = [
      { type: 'board', text: 'B', images: [] },
      ...Array.from({ length: 80 }, () => ({
        type: 'assistant' as const,
        text: '',
        calls: [
          {
            id: 'call_1',
            tool: 'edit' as const,
            input: 'x'.repeat(4_000),
          },
        ],
      })),
    ]
    await writeAssistantTurnRecord(draft({ transcript: huge }))
    expect(record.create).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      'assistant turn record over the size cap, hop skipped',
      { userId: 'user-1', turnId: TURN, hop: 1 },
    )
  })
})

describe('recordAssistantTurn', () => {
  it('不等、不抛：写库失败只记一行警告；交给 after 等它写完', async () => {
    record.create.mockRejectedValue(new Error('connection lost'))
    expect(() => recordAssistantTurn(draft())).not.toThrow()
    expect(after).toHaveBeenCalledTimes(1)
    await after.mock.calls[0]![0]()
    expect(warn).toHaveBeenCalledWith('assistant turn record not written', {
      userId: 'user-1',
      turnId: TURN,
      hop: 1,
      error: 'connection lost',
    })
  })

  it('不在请求作用域里（after 抛错）：照样在写', async () => {
    after.mockImplementationOnce(() => {
      throw new Error('outside a request scope')
    })
    expect(() => recordAssistantTurn(draft())).not.toThrow()
    await vi.waitFor(() => expect(record.create).toHaveBeenCalledTimes(1))
  })
})

describe('保留', () => {
  it('这个人的：30 天前的一刀 + 第 200 条之后的一刀', async () => {
    await pruneAssistantTurnRecordsOfUser('user-1', NOW)
    expect(record.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        createdAt: { lt: new Date('2026-09-15T12:00:00.000Z') },
      },
    })
    // 没超出 200 条：第二刀不下。
    expect(record.deleteMany).toHaveBeenCalledTimes(1)
  })

  it('每日 sweep：删全表 30 天前的，回删了几行', async () => {
    record.deleteMany.mockResolvedValue({ count: 7 })
    await expect(pruneExpiredAssistantTurnRecords(NOW)).resolves.toBe(7)
    expect(record.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-09-15T12:00:00.000Z') } },
    })
  })
})
