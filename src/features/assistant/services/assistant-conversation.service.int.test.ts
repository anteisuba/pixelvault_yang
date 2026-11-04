import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { Prisma } from '@/lib/generated/prisma/client'
import { ASSISTANT_ROUND_SUMMARY_LIMITS } from '@/constants/assistant-operator'
import { db } from '@/lib/db'
import type { AssistantConversationRoundStored } from '@/types/assistant-conversation'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  appendAssistantConversationRound,
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversationRounds,
  listAssistantConversations,
  renameAssistantConversation,
  updateAssistantConversationRound,
  upsertAssistantConversation,
} from './assistant-conversation.service'

/** 助手会话——真库（L2a）：会话、画布项目、角色卡都是库里的行；行锁与 SQL 都是真的。 */
let userId = ''
let clerkId = ''
let strangerId = ''

const ROUND = {
  createdAt: '2026-09-11T00:00:00.000Z',
  facts: ['夜景配色定为冷蓝'],
  decisions: ['用 16:9'],
  todos: [],
  evidenceRefs: ['#e1'],
}

let tick = 0
function conversation(
  data: Partial<Prisma.AssistantConversationUncheckedCreateInput> = {},
) {
  tick += 1
  return db.assistantConversation.create({
    data: {
      userId,
      surface: 'IMAGE_STUDIO',
      messages: [
        { role: 'user', content: 'Hi', workspaceKey: 'image-natural' },
      ],
      updatedAt: new Date(Date.UTC(2026, 8, 9, 0, tick)),
      ...data,
    },
  })
}

function withRounds(rounds: AssistantConversationRoundStored[]) {
  return conversation({ rounds: rounds as unknown as Prisma.InputJsonValue })
}

async function storedRounds(id: string) {
  const row = await db.assistantConversation.findUniqueOrThrow({
    where: { id },
  })
  return row.rounds as unknown as AssistantConversationRoundStored[]
}

function project(owner = userId) {
  return db.nodeWorkflowProject.create({
    data: { userId: owner, name: '马尔福', state: {} },
  })
}

/** 一段助手模式的对话（首条消息上带着 operator 那一格）。 */
const OPERATOR_MESSAGES = [
  { role: 'user', content: 'Hi', operator: { kind: 'user' } },
  { role: 'assistant', content: 'Hello' },
]

beforeEach(async () => {
  await resetDatabase()
  tick = 0
  const user = await createTestUser()
  userId = user.id
  clerkId = user.clerkId
  strangerId = (await createTestUser()).id
})

describe('删 / 改名（真库）', () => {
  it('deletes only a conversation owned by the authenticated user', async () => {
    const mine = await conversation()
    const theirs = await conversation({ userId: strangerId })

    expect(await deleteAssistantConversation(clerkId, mine.id)).toBe(true)
    expect(await deleteAssistantConversation(clerkId, theirs.id)).toBe(false)
    expect(
      (await db.assistantConversation.findMany()).map((row) => row.id),
    ).toEqual([theirs.id])
  })

  it('renames only the authenticated owner conversation', async () => {
    const mine = await conversation()
    const theirs = await conversation({ userId: strangerId, title: '别人的' })

    expect(
      await renameAssistantConversation(clerkId, mine.id, {
        title: 'My title',
      }),
    ).toEqual({ title: 'My title' })
    expect(
      await renameAssistantConversation(clerkId, theirs.id, {
        title: 'My title',
      }),
    ).toBeNull()

    const titles = Object.fromEntries(
      (await db.assistantConversation.findMany()).map((row) => [
        row.id,
        row.title,
      ]),
    )
    expect(titles).toEqual({ [mine.id]: 'My title', [theirs.id]: '别人的' })
  })

  it('renames an unstamped image conversation but not a canvas one without a project', async () => {
    const oldImage = await conversation({
      messages: [{ role: 'user', content: 'Hi' }],
    })
    const orphanCanvas = await conversation({
      surface: 'NODE_CANVAS',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(
      await renameAssistantConversation(clerkId, oldImage.id, {
        title: 'My title',
      }),
    ).toEqual({ title: 'My title' })
    expect(
      await renameAssistantConversation(clerkId, orphanCanvas.id, {
        title: 'My title',
      }),
    ).toBeNull()
    expect(
      (
        await db.assistantConversation.findUniqueOrThrow({
          where: { id: orphanCanvas.id },
        })
      ).title,
    ).toBeNull()
  })
})

describe('会话列表（真库）', () => {
  it('lists every conversation of theirs, across workspaces (9d)', async () => {
    const image = await conversation({
      title: 'Name',
      messages: [
        { ...OPERATOR_MESSAGES[0], workspaceKey: 'image-natural' },
        ...Array.from({ length: 7 }, () => OPERATOR_MESSAGES[1]),
      ],
    })
    const video = await conversation({
      surface: 'VIDEO_STUDIO',
      messages: OPERATOR_MESSAGES,
    })
    await conversation({ userId: strangerId, messages: OPERATOR_MESSAGES })

    const result = await listAssistantConversations(clerkId, {
      operatorOnly: true,
      limit: 20,
    })

    expect(result.map((row) => row.id)).toEqual([video.id, image.id])
    expect(result[1]).toMatchObject({
      title: 'Name',
      workspaceKey: 'image-natural',
      messageCount: 8,
      operatorThread: true,
      updatedAt: image.updatedAt.toISOString(),
    })
    expect(result[1]).not.toHaveProperty('messages')
    expect(result[1]).not.toHaveProperty('stamp')
    expect(
      await listAssistantConversations(clerkId, {
        operatorOnly: true,
        limit: 1,
      }),
    ).toHaveLength(1)
  })

  it('unstamped image conversations belong to the natural workbench, never to the tag one', async () => {
    await conversation({
      title: 'Before the two workbenches split',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    const natural = await listAssistantConversations(clerkId, {})
    expect(natural[0]?.workspaceKey).toBe('image-natural')
  })

  it('derives the workspace of video, lora and canvas rows from the row itself', async () => {
    const canvas = await project()
    await conversation({ surface: 'VIDEO_STUDIO', messages: [] })
    await conversation({ surface: 'LORA', messages: [] })
    await conversation({
      surface: 'NODE_CANVAS',
      projectId: canvas.id,
      messages: [],
    })

    const result = await listAssistantConversations(clerkId, {})

    expect(result.map((row) => row.workspaceKey)).toEqual([
      `canvas:${canvas.id}`,
      'lora',
      'video',
    ])
  })

  it('filters legacy text lists with false and leaves explicit combined lists unfiltered', async () => {
    const operator = await conversation({ messages: OPERATOR_MESSAGES })
    const legacy = await conversation()

    const ids = async (operatorOnly: boolean | undefined) =>
      (await listAssistantConversations(clerkId, { operatorOnly })).map(
        (row) => row.id,
      )
    expect(await ids(true)).toEqual([operator.id])
    expect(await ids(false)).toEqual([legacy.id])
    expect(await ids(undefined)).toEqual([legacy.id, operator.id])
  })

  it('会话列表带上和谁聊（与你在她故事里是谁）；卡读不到就当工作会话', async () => {
    const rin = await db.characterCard.create({
      data: {
        userId,
        name: 'Rin',
        extensions: { 'pv.chatUserRole': ' 常来的熟客 ' },
      },
    })
    const gone = await db.characterCard.create({
      data: { userId, name: 'Gone', isDeleted: true },
    })
    const theirs = await db.characterCard.create({
      data: { userId: strangerId, name: 'Theirs' },
    })
    const chat = (cardId: string, title: string) =>
      conversation({
        surface: 'CARDS',
        title,
        messages: [
          { ...OPERATOR_MESSAGES[0], chatCharacterId: cardId },
          OPERATOR_MESSAGES[1],
        ],
      })
    await chat(theirs.id, '别人的卡')
    await chat(gone.id, '旧聊天')
    await chat(rin.id, '你好')

    const result = await listAssistantConversations(clerkId, {
      operatorOnly: true,
    })

    expect(result.map((row) => [row.title, row.chatCharacter])).toEqual([
      ['你好', { id: rin.id, name: 'Rin', userRole: '常来的熟客' }],
      ['旧聊天', null],
      ['别人的卡', null],
    ])
    expect(result[0]).not.toHaveProperty('chatCharacterName')
  })
})

describe('读一段（真库）', () => {
  it('读回来时坏掉的那一条结论丢掉，⛔ 不作废整段会话', async () => {
    const row = await conversation({
      rounds: [
        { ...ROUND, roundIndex: 0 },
        { roundIndex: 1, facts: 'not-an-array' },
      ],
    })

    const record = await getAssistantConversation(clerkId, { id: row.id })

    expect(record?.rounds).toEqual([{ ...ROUND, roundIndex: 0 }])
    expect(record?.messages).toHaveLength(1)
    expect(record?.workspaceKey).toBe('image-natural')
  })

  it.each([true, false])(
    'filters latest and explicit conversation reads by operator mode %s',
    async (operatorOnly) => {
      const operator = await conversation({ messages: OPERATOR_MESSAGES })
      const legacy = await conversation()
      await conversation({ userId: strangerId, messages: OPERATOR_MESSAGES })
      const wanted = operatorOnly ? operator : legacy
      const unwanted = operatorOnly ? legacy : operator

      expect(
        (await getAssistantConversation(clerkId, { operatorOnly }))?.id,
      ).toBe(wanted.id)
      expect(
        (
          await getAssistantConversation(clerkId, {
            operatorOnly,
            id: wanted.id,
          })
        )?.id,
      ).toBe(wanted.id)
      expect(
        await getAssistantConversation(clerkId, {
          operatorOnly,
          id: unwanted.id,
        }),
      ).toBeNull()
    },
  )

  it('别人的那段读不到', async () => {
    const theirs = await conversation({ userId: strangerId })
    expect(
      await getAssistantConversation(clerkId, { id: theirs.id }),
    ).toBeNull()
  })
})

// ─── 每轮结账（assistant-shell-v2 §7.2 / §7.5）────────────────────

describe('每轮结账（真库）', () => {
  it('结账记录追加进这段会话，轮次号由服务端按已有条数定', async () => {
    const row = await conversation()

    const stored = await appendAssistantConversationRound(
      clerkId,
      row.id,
      ROUND,
      'image-natural',
    )

    expect(stored).toEqual({ ...ROUND, roundIndex: 0 })
    expect(await storedRounds(row.id)).toEqual([{ ...ROUND, roundIndex: 0 }])
  })

  it('轮次号接着已有的那几条数，⛔ 不从零开始', async () => {
    const row = await withRounds([{ ...ROUND, roundIndex: 0 }])

    const stored = await appendAssistantConversationRound(
      clerkId,
      row.id,
      ROUND,
      'image-natural',
    )

    expect(stored?.roundIndex).toBe(1)
    expect((await storedRounds(row.id)).map((r) => r.roundIndex)).toEqual([
      0, 1,
    ])
  })

  it('同时结账保留两轮并分配不同轮次号', async () => {
    const row = await conversation()

    const stored = await Promise.all([
      appendAssistantConversationRound(
        clerkId,
        row.id,
        { ...ROUND, facts: ['first'] },
        'image-natural',
      ),
      appendAssistantConversationRound(
        clerkId,
        row.id,
        { ...ROUND, facts: ['second'] },
        'image-natural',
      ),
    ])

    expect(stored.map((round) => round?.roundIndex).sort()).toEqual([0, 1])
    const rounds = await storedRounds(row.id)
    expect(rounds.map((round) => round.roundIndex)).toEqual([0, 1])
    expect(rounds.flatMap((round) => round.facts).sort()).toEqual([
      'first',
      'second',
    ])
  })

  it('编辑既有轮次与新一轮结账同时发生时两项都保存', async () => {
    const row = await withRounds([{ ...ROUND, roundIndex: 9 }])

    await Promise.all([
      updateAssistantConversationRound(
        clerkId,
        row.id,
        9,
        { facts: ['edited'] },
        'image-natural',
      ),
      appendAssistantConversationRound(
        clerkId,
        row.id,
        { ...ROUND, facts: ['next'] },
        'image-natural',
      ),
    ])

    expect(await storedRounds(row.id)).toMatchObject([
      { roundIndex: 9, facts: ['edited'], editedByUser: true },
      { roundIndex: 10, facts: ['next'] },
    ])
  })

  it('同时编辑不同栏位时读取锁内的新版本，保留两处编辑', async () => {
    const row = await withRounds([{ ...ROUND, roundIndex: 9 }])

    await Promise.all([
      updateAssistantConversationRound(
        clerkId,
        row.id,
        9,
        { facts: ['edited'] },
        'image-natural',
      ),
      updateAssistantConversationRound(
        clerkId,
        row.id,
        9,
        { todos: ['next action'] },
        'image-natural',
      ),
    ])

    expect((await storedRounds(row.id))[0]).toMatchObject({
      facts: ['edited'],
      todos: ['next action'],
    })
  })

  it('会话不归这个用户时不写，也不抛 —— 结账不许阻塞 done', async () => {
    const theirs = await conversation({ userId: strangerId })

    expect(
      await appendAssistantConversationRound(
        clerkId,
        theirs.id,
        ROUND,
        'image-natural',
      ),
    ).toBeNull()
    expect(await storedRounds(theirs.id)).toEqual([])
  })

  it('裁剪旧结论后轮次号仍递增，后续编辑能指向唯一轮次', async () => {
    const max = ASSISTANT_ROUND_SUMMARY_LIMITS.maxRoundsPerConversation
    const row = await withRounds(
      Array.from({ length: max }, (_, index) => ({
        ...ROUND,
        roundIndex: index + 12,
      })),
    )

    const stored = await appendAssistantConversationRound(
      clerkId,
      row.id,
      ROUND,
      'image-natural',
    )

    expect(stored?.roundIndex).toBe(max + 12)
    const written = await storedRounds(row.id)
    expect(written).toHaveLength(max)
    expect(new Set(written.map((entry) => entry.roundIndex)).size).toBe(max)
    expect(written[0]?.roundIndex).toBe(13)
  })

  it('读取并编辑结论时保留该轮实际图片版本', async () => {
    const sourceRefs = [
      {
        assetId: 'image-v1',
        nodeId: 'node-1',
        name: '角色三视图',
        url: 'https://cdn.example.test/character-v1.png',
      },
    ]
    const row = await withRounds([{ ...ROUND, roundIndex: 0, sourceRefs }])

    const rounds = await listAssistantConversationRounds(userId, row.id, {
      workspaceKey: 'image-natural',
      limit: 8,
    })
    expect(rounds[0]).toMatchObject({ sourceRefs })
    const updated = await updateAssistantConversationRound(
      clerkId,
      row.id,
      0,
      { decisions: ['仅认可这版脸部，身体待改'] },
      'image-natural',
    )
    expect(updated).toMatchObject({ sourceRefs, editedByUser: true })
    expect((await storedRounds(row.id))[0]).toMatchObject({ sourceRefs })
  })

  it('用户改过的那一条按 roundIndex 认，三栏覆盖、编号与时刻原样留着（§7.7）', async () => {
    const row = await withRounds([
      { ...ROUND, roundIndex: 3 },
      { ...ROUND, roundIndex: 4, facts: ['旧事实'] },
    ])

    const updated = await updateAssistantConversationRound(
      clerkId,
      row.id,
      4,
      { facts: ['我改过的事实'], decisions: ['用 3:2'], todos: [] },
      'image-natural',
    )

    const edited = {
      ...ROUND,
      roundIndex: 4,
      facts: ['我改过的事实'],
      decisions: ['用 3:2'],
      todos: [],
      editedByUser: true,
    }
    expect(updated).toEqual(edited)
    // ⚠ 另一条一个字都没动。
    expect(await storedRounds(row.id)).toEqual([
      { ...ROUND, roundIndex: 3 },
      edited,
    ])
  })

  it('⭐ 只钉住那一次：写 pinnedEvidence、三栏原样、⛔ 不标 editedByUser（实测第三组 B）', async () => {
    const row = await withRounds([
      { ...ROUND, roundIndex: 4, facts: ['模型压出来的事实'] },
    ])
    const pinned = [
      {
        refs: ['#e12'],
        conclusion: '鸣潮式 3D 靠卡通着色。',
        sourceCount: 8,
        corroborated: 3,
      },
    ]

    const updated = await updateAssistantConversationRound(
      clerkId,
      row.id,
      4,
      { pinnedEvidence: pinned },
      'image-natural',
    )

    const expected = {
      ...ROUND,
      roundIndex: 4,
      facts: ['模型压出来的事实'],
      pinnedEvidence: pinned,
    }
    expect(updated).toEqual(expected)
    expect(updated?.editedByUser).toBeUndefined()
    expect(await storedRounds(row.id)).toEqual([expected])
  })

  it('没有这一号 / 不归他时不写库，返回 null', async () => {
    const mine = await withRounds([{ ...ROUND, roundIndex: 0 }])
    const theirs = await conversation({
      userId: strangerId,
      rounds: [{ ...ROUND, roundIndex: 0 }],
    })
    const empty = { facts: [], decisions: [], todos: [] }

    expect(
      await updateAssistantConversationRound(
        clerkId,
        mine.id,
        9,
        empty,
        'image-natural',
      ),
    ).toBeNull()
    expect(
      await updateAssistantConversationRound(
        clerkId,
        theirs.id,
        0,
        empty,
        'image-natural',
      ),
    ).toBeNull()
    expect(await storedRounds(mine.id)).toEqual([{ ...ROUND, roundIndex: 0 }])
    expect(await storedRounds(theirs.id)).toEqual([{ ...ROUND, roundIndex: 0 }])
  })
})

/**
 * **下一轮注入要读的那几条**（§7.6，commit #12）。
 *
 * ⚠ 它收的是 DB `userId`（⛔ 不是 clerkId）—— 调用方手上已经有那一行。
 */
describe('注入读（真库）', () => {
  it('按 userId 核所有权，只回最近几条', async () => {
    const row = await withRounds([
      { ...ROUND, roundIndex: 0 },
      { ...ROUND, roundIndex: 1 },
      { ...ROUND, roundIndex: 2 },
    ])

    const rounds = await listAssistantConversationRounds(userId, row.id, {
      workspaceKey: 'image-natural',
      limit: 2,
    })

    expect(rounds.map((round) => round.roundIndex)).toEqual([1, 2])
  })

  it('会话不归这个用户 → 空，⛔ 不抛（注入不到不是跑不了）', async () => {
    const theirs = await conversation({
      userId: strangerId,
      rounds: [{ ...ROUND, roundIndex: 0 }],
    })
    expect(
      await listAssistantConversationRounds(userId, theirs.id, {
        workspaceKey: 'image-natural',
        limit: 8,
      }),
    ).toEqual([])
  })

  it('⭐ 同一段对话换了台照样读得到（9d：对话不按台分）', async () => {
    const row = await withRounds([{ ...ROUND, roundIndex: 0 }])
    expect(
      await listAssistantConversationRounds(userId, row.id, {
        workspaceKey: 'image-tags',
        limit: 8,
      }),
    ).toHaveLength(1)
  })

  it('rejects inaccessible canvas projects before reading conversations', async () => {
    const theirs = await project(strangerId)
    const row = await conversation({
      surface: 'NODE_CANVAS',
      projectId: theirs.id,
    })
    await expect(
      listAssistantConversationRounds(userId, row.id, {
        workspaceKey: `canvas:${theirs.id}`,
        limit: 8,
      }),
    ).rejects.toMatchObject({ errorCode: 'ASSISTANT_WORKSPACE_NOT_FOUND' })
  })
})

describe('保存（真库）', () => {
  it('rejects contradictory surface and project classifications before saving', async () => {
    const one = await project()
    const two = await project()
    for (const input of [
      { workspaceKey: 'image-tags', surface: 'LORA' as const },
      {
        workspaceKey: `canvas:${one.id}`,
        surface: 'NODE_CANVAS' as const,
        projectId: two.id,
      },
    ]) {
      await expect(
        upsertAssistantConversation(clerkId, {
          ...input,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toMatchObject({ errorCode: 'ASSISTANT_WORKSPACE_MISMATCH' })
    }
    expect(await db.assistantConversation.count()).toBe(0)
  })

  it('will not save into a conversation that is not theirs', async () => {
    const theirs = await conversation({
      userId: strangerId,
      surface: 'LORA',
      messages: [{ role: 'user', content: '别人的' }],
    })
    await expect(
      upsertAssistantConversation(clerkId, {
        id: theirs.id,
        workspaceKey: 'lora',
        surface: 'LORA',
        messages: [{ role: 'user', content: 'Continue' }],
      }),
    ).rejects.toMatchObject({
      errorCode: 'ASSISTANT_CONVERSATION_NOT_FOUND',
      httpStatus: 404,
    })
    const row = await db.assistantConversation.findUniqueOrThrow({
      where: { id: theirs.id },
    })
    expect(row.messages).toEqual([{ role: 'user', content: '别人的' }])
  })

  it('⭐ 换到别的台接着存：这一行仍记在起始的那个台（9d）', async () => {
    const row = await conversation({
      messages: [{ role: 'user', content: 'a', workspaceKey: 'image-tags' }],
    })

    const record = await upsertAssistantConversation(clerkId, {
      id: row.id,
      workspaceKey: 'video',
      surface: 'VIDEO_STUDIO',
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
    })

    const saved = await db.assistantConversation.findUniqueOrThrow({
      where: { id: row.id },
    })
    expect(saved.surface).toBe('IMAGE_STUDIO')
    expect(saved.messages).toMatchObject([
      { content: 'a', workspaceKey: 'image-tags' },
      { content: 'b' },
    ])
    expect(record.workspaceKey).toBe('image-tags')
  })

  it('stamps the image workbench on the first message only, and nothing elsewhere', async () => {
    const image = await upsertAssistantConversation(clerkId, {
      workspaceKey: 'image-tags',
      surface: 'IMAGE_STUDIO',
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b', workspaceKey: 'image-natural' },
      ],
    })
    const stamped = await db.assistantConversation.findUniqueOrThrow({
      where: { id: image.id },
    })
    expect(stamped).toMatchObject({ surface: 'IMAGE_STUDIO', projectId: null })
    const messages = stamped.messages as Record<string, unknown>[]
    expect(messages).toMatchObject([
      { content: 'a', workspaceKey: 'image-tags' },
      { content: 'b' },
    ])
    expect(messages[1]).not.toHaveProperty('workspaceKey')

    const lora = await upsertAssistantConversation(clerkId, {
      workspaceKey: 'lora',
      surface: 'LORA',
      messages: [{ role: 'user', content: 'a' }],
    })
    const loraRow = await db.assistantConversation.findUniqueOrThrow({
      where: { id: lora.id },
    })
    expect(
      (loraRow.messages as Record<string, unknown>[])[0],
    ).not.toHaveProperty('workspaceKey')
  })

  it('聊天会话（附录L）：和谁聊盖在首条消息上，⛔ 不信消息里自带的那一格', async () => {
    const chatCharacterId = '11111111-1111-4111-8111-111111111111'

    const record = await upsertAssistantConversation(clerkId, {
      workspaceKey: 'cards',
      surface: 'CARDS',
      chatCharacterId,
      messages: [
        { role: 'assistant', content: '欢迎光临喵' },
        {
          role: 'user',
          content: '你好',
          chatCharacterId: '22222222-2222-4222-8222-222222222222',
        },
      ],
    })

    const saved = (
      await db.assistantConversation.findUniqueOrThrow({
        where: { id: record.id },
      })
    ).messages as Record<string, unknown>[]
    expect(saved[0]?.chatCharacterId).toBe(chatCharacterId)
    expect(saved[1]).not.toHaveProperty('chatCharacterId')
    expect(record.chatCharacterId).toBe(chatCharacterId)
  })
})
