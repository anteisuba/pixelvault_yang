import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_PROMPT_VERSION } from '@/constants/assistant-v3'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const { after, warn } = vi.hoisted(() => ({
  after: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('next/server', () => ({ after }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn, error: vi.fn() },
}))

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  pruneAssistantTurnRecordsOfUser,
  pruneExpiredAssistantTurnRecords,
  recordAssistantTurn,
  writeAssistantTurnRecord,
  type AssistantTurnDraft,
} from './assistant-turn-record.service'

/** 每轮的过程记录（`AssistantTurnRecord`）——真库（L2a）：断言库里那一行。 */
const TURN = '33b9bd2e-b43d-4cc9-872d-bb5d57f8d420'
const NOW = new Date('2026-10-15T12:00:00.000Z')
const PNG = `data:image/png;base64,${'A'.repeat(64)}`

const transcript: AssistantV3Transcript = [
  { type: 'board', text: 'BOARD', images: [], turn: { id: TURN, hop: 1 } },
  { type: 'assistant', text: '好了。', calls: [] },
]

let userId = ''

function draft(
  overrides: Partial<AssistantTurnDraft> = {},
): AssistantTurnDraft {
  return {
    userId,
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

const rows = () =>
  db.assistantTurnRecord.findMany({ where: { userId, turnId: TURN } })
const theRow = () =>
  db.assistantTurnRecord.findUniqueOrThrow({
    where: { userId_turnId: { userId, turnId: TURN } },
  })

/** 先把开轮那一跳写下，再把那一行改成用例要的样子。 */
async function openedRow(
  patch: { hops?: number; snapshotBytes?: number; truncated?: string[] } = {},
) {
  await writeAssistantTurnRecord(draft())
  return db.assistantTurnRecord.update({
    where: { userId_turnId: { userId, turnId: TURN } },
    data: patch,
  })
}

/** 一行 n 天前的旧记录。 */
async function oldRecord(createdAt: Date, turnId: string) {
  const row = await theRowOrOpen()
  const { id: _id, createdAt: _created, turnId: _turn, ...rest } = row
  return db.assistantTurnRecord.create({
    data: {
      ...rest,
      input: rest.input as never,
      snapshot: rest.snapshot as never,
      transcript: rest.transcript as never,
      turnId,
      createdAt,
    },
  })
}

async function theRowOrOpen() {
  const found = await db.assistantTurnRecord.findFirst({ where: { userId } })
  if (found) return found
  await writeAssistantTurnRecord(draft())
  return theRow()
}

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDatabase()
  userId = (await createTestUser()).id
})

describe('writeAssistantTurnRecord（真库）', () => {
  it('第一跳：建行 —— 快照（摘掉 data: 地址）、本轮记录、厂商 / 型号 / key 的 id、系统提示只存 sha256', async () => {
    await writeAssistantTurnRecord(draft())

    const all = await rows()
    expect(all).toHaveLength(1)
    const row = all[0]!
    expect(row).toMatchObject({
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
    const snapshot = row.snapshot as {
      references: { items: { url: string }[] }
    }
    expect(snapshot.references.items[0]!.url).toBe('data:,omitted')
    expect(row.snapshotBytes).toBeGreaterThan(0)
    expect(row.sizeBytes).toBeGreaterThan(row.snapshotBytes)
    expect(JSON.stringify(row)).not.toContain('SYSTEM')
    expect(JSON.stringify(row)).not.toContain('base64')
  })

  it('建完顺手删这个人的：30 天前的、超出最近 200 条的；别人的不碰', async () => {
    const monthAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    await oldRecord(monthAgo, 'stale-turn')
    for (let index = 0; index < 200; index += 1)
      await oldRecord(new Date(Date.now() - (index + 1) * 60_000), `t-${index}`)
    await db.assistantTurnRecord.deleteMany({
      where: { userId, turnId: TURN },
    })
    const stranger = await createTestUser()
    await db.assistantTurnRecord.create({
      data: {
        ...(await strangerRow(stranger.id)),
      },
    })

    await writeAssistantTurnRecord(draft())

    const mine = await db.assistantTurnRecord.findMany({
      where: { userId },
      select: { turnId: true },
    })
    expect(mine).toHaveLength(200)
    const turnIds = mine.map((row) => row.turnId)
    expect(turnIds).toContain(TURN)
    expect(turnIds).not.toContain('stale-turn')
    // 最旧的那一条（第 200 条之后）被删掉。
    expect(turnIds).not.toContain('t-199')
    expect(
      await db.assistantTurnRecord.count({ where: { userId: stranger.id } }),
    ).toBe(1)
  })

  it('接力的后几跳：找到同一行，只更新本轮记录、跳数与收尾；⛔ 不拿手上的快照盖开轮那份', async () => {
    const opened = await openedRow()
    const nextTranscript: AssistantV3Transcript = [
      ...transcript,
      { type: 'assistant', text: '第二跳', calls: [] },
    ]

    await writeAssistantTurnRecord(
      draft({
        hop: 2,
        outcome: 'awaiting_confirm',
        transcript: nextTranscript,
        request: {
          ...draft().request,
          snapshot: { prompt: '第二跳手上的快照' },
        } as AssistantOperatorRequest,
      }),
    )

    const all = await rows()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      id: opened.id,
      hops: 2,
      outcome: 'awaiting_confirm',
      errorCode: null,
      transcript: nextTranscript,
      truncated: [],
      snapshot: opened.snapshot,
    })
    expect(all[0]!.sizeBytes).toBeGreaterThan(opened.snapshotBytes)
  })

  it('上一轮找到的东西（#n）：开轮板子上冻着的那一份记进 input；接力那几跳的请求不带它，照样记着', async () => {
    const find = {
      kind: 'image' as const,
      n: 3,
      imageUrl: 'https://img.test/3.jpg',
      pageUrl: 'https://www.pixiv.net/artworks/3',
      domain: 'pixiv.net',
      title: '立绘',
    }
    const withFinds: AssistantV3Transcript = [
      { ...transcript[0]!, finds: [find] } as AssistantV3Transcript[number],
      ...transcript.slice(1),
    ]
    await writeAssistantTurnRecord(
      draft({
        transcript: withFinds,
        request: {
          ...draft().request,
          priorFinds: [find],
        } as AssistantOperatorRequest,
      }),
    )
    expect(
      ((await theRow()).input as { priorFinds?: unknown }).priorFinds,
    ).toEqual([find])

    // 接力那一跳：请求里没有 priorFinds（前端只在开轮带），板子原样带回。
    await writeAssistantTurnRecord(draft({ hop: 2, transcript: withFinds }))
    expect(
      ((await theRow()).input as { priorFinds?: unknown }).priorFinds,
    ).toEqual([find])
  })

  it('更晚的一跳已经写过：⛔ 拿旧的盖新的', async () => {
    await openedRow({ hops: 3 })
    const before = await theRow()

    await writeAssistantTurnRecord(draft({ hop: 2, outcome: 'error' }))

    expect(await theRow()).toEqual(before)
  })

  it('同一跳再来一次（硬停在交本轮记录之前，前端拿着上一跳的号接力）：照写，后到的盖先到的', async () => {
    await openedRow({ hops: 2 })
    await db.assistantTurnRecord.update({
      where: { userId_turnId: { userId, turnId: TURN } },
      data: { outcome: 'awaiting_confirm' },
    })

    await writeAssistantTurnRecord(draft({ hop: 2, outcome: 'done' }))

    expect(await theRow()).toMatchObject({ hops: 2, outcome: 'done' })
  })

  it('后几跳截到要丢快照：快照清成 NULL，缺口跟着行走', async () => {
    await openedRow({ snapshotBytes: 300 * 1024, truncated: ['board_text'] })

    await writeAssistantTurnRecord(draft({ hop: 2 }))

    const row = await theRow()
    expect(row.snapshot).toBeNull()
    expect(row.snapshotBytes).toBe(0)
    // 本轮记录每一跳从头截一遍（上一跳的那几刀不留）；快照那一刀跟着行走。
    expect(row.truncated).toEqual([
      'signatures',
      'board_text',
      'result_outputs',
      'history',
      'assistant_text',
      'snapshot',
    ])
  })

  it('开轮那一跳丢过快照：后几跳照样记着', async () => {
    await openedRow({ snapshotBytes: 0, truncated: ['board_text', 'snapshot'] })

    await writeAssistantTurnRecord(draft({ hop: 2 }))

    expect((await theRow()).truncated).toEqual(['snapshot'])
  })

  it('第一跳没写成、由后面一跳建行：⛔ 不存手上的快照，记 no_opening_snapshot', async () => {
    await writeAssistantTurnRecord(draft({ hop: 2 }))

    const row = await theRow()
    expect(row.snapshot).toBeNull()
    expect(row.snapshotBytes).toBe(0)
    expect(row.truncated).toEqual(['no_opening_snapshot'])
    expect(row.hops).toBe(2)
  })

  it('同一轮的两跳同时建这一行（唯一键撞了）：不报错，只有一行', async () => {
    await expect(
      Promise.all([
        writeAssistantTurnRecord(draft()),
        writeAssistantTurnRecord(draft()),
      ]),
    ).resolves.toEqual([undefined, undefined])
    expect(await rows()).toHaveLength(1)
  })

  it('别的库错照抛（由 recordAssistantTurn 兜成警告）', async () => {
    // 这个人不存在：外键约束拒收。
    await expect(
      writeAssistantTurnRecord(draft({ userId: 'no-such-user' })),
    ).rejects.toThrow()
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
    expect(await rows()).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      'assistant turn record over the size cap, hop skipped',
      { userId, turnId: TURN, hop: 1 },
    )
  })
})

describe('recordAssistantTurn（真库）', () => {
  it('不等、不抛：写库失败只记一行警告；交给 after 等它写完', async () => {
    expect(() =>
      recordAssistantTurn(draft({ userId: 'no-such-user' })),
    ).not.toThrow()
    expect(after).toHaveBeenCalledTimes(1)
    await after.mock.calls[0]![0]()
    expect(warn).toHaveBeenCalledWith(
      'assistant turn record not written',
      expect.objectContaining({
        userId: 'no-such-user',
        turnId: TURN,
        hop: 1,
      }),
    )
  })

  it('交给 after 的那件事跑完，这一行就在库里', async () => {
    recordAssistantTurn(draft())
    await after.mock.calls[0]![0]()
    expect(await rows()).toHaveLength(1)
  })

  it('不在请求作用域里（after 抛错）：照样在写', async () => {
    after.mockImplementationOnce(() => {
      throw new Error('outside a request scope')
    })
    expect(() => recordAssistantTurn(draft())).not.toThrow()
    await vi.waitFor(async () => expect(await rows()).toHaveLength(1))
  })
})

describe('保留（真库）', () => {
  it('这个人的：30 天前的删掉，最近的留着', async () => {
    await oldRecord(new Date('2026-09-14T12:00:00.000Z'), 'stale')
    await oldRecord(new Date('2026-09-16T12:00:00.000Z'), 'recent')
    await db.assistantTurnRecord.deleteMany({
      where: { userId, turnId: TURN },
    })

    await pruneAssistantTurnRecordsOfUser(userId, NOW)

    const left = await db.assistantTurnRecord.findMany({ where: { userId } })
    expect(left.map((row) => row.turnId)).toEqual(['recent'])
  })

  it('每日 sweep：删全表 30 天前的，回删了几行', async () => {
    await oldRecord(new Date('2026-09-01T00:00:00.000Z'), 'old-1')
    await oldRecord(new Date('2026-09-02T00:00:00.000Z'), 'old-2')
    await oldRecord(new Date('2026-10-14T00:00:00.000Z'), 'fresh')
    await db.assistantTurnRecord.deleteMany({
      where: { userId, turnId: TURN },
    })

    await expect(pruneExpiredAssistantTurnRecords(NOW)).resolves.toBe(2)
    const left = await db.assistantTurnRecord.findMany()
    expect(left.map((row) => row.turnId)).toEqual(['fresh'])
  })
})

async function strangerRow(strangerId: string) {
  const row = await db.assistantTurnRecord.findFirstOrThrow({
    where: { userId },
  })
  const { id: _id, createdAt: _created, ...rest } = row
  return {
    ...rest,
    userId: strangerId,
    turnId: 'stranger-turn',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    input: rest.input as never,
    snapshot: rest.snapshot as never,
    transcript: rest.transcript as never,
  }
}
