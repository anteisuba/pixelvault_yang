import { beforeEach, expect, it, vi } from 'vitest'
import type { AssistantConversationRoundStored } from '@/types/assistant-conversation'
import {
  appendAssistantConversationRound,
  getAssistantConversation,
  listAssistantConversationRounds,
  listAssistantConversations,
  renameAssistantConversation,
  updateAssistantConversationRound,
  deleteAssistantConversation,
  upsertAssistantConversation,
} from './assistant-conversation.service'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockConversation: vi.fn(),
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  findProject: vi.fn(),
  ensureUser: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
    $queryRaw: mocks.queryRaw,
    assistantConversation: {
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create,
    },
    nodeWorkflowProject: { findFirst: mocks.findProject },
  },
}))
vi.mock('@/services/user.service', () => ({ ensureUser: mocks.ensureUser }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.lockConversation.mockResolvedValue([{ id: 'conv-1' }])
  mocks.transaction.mockImplementation(
    (action: (tx: unknown) => Promise<unknown>) =>
      action({
        $queryRaw: mocks.lockConversation,
        assistantConversation: {
          findUnique: mocks.findUnique,
          update: mocks.update,
        },
      }),
  )
  mocks.ensureUser.mockResolvedValue({ id: 'owner-id' })
  mocks.findProject.mockResolvedValue({ id: 'project-one' })
})
it('deletes only a conversation owned by the authenticated user', async () => {
  mocks.deleteMany.mockResolvedValue({ count: 1 })
  expect(
    await deleteAssistantConversation('clerk-owner', 'conversation-id'),
  ).toBe(true)
  expect(mocks.ensureUser).toHaveBeenCalledWith('clerk-owner')
  expect(mocks.deleteMany).toHaveBeenCalledWith({
    where: { id: 'conversation-id', userId: 'owner-id' },
  })
})
it('returns not found for an inaccessible or missing conversation', async () => {
  mocks.deleteMany.mockResolvedValue({ count: 0 })
  expect(
    await deleteAssistantConversation('clerk-owner', 'other-user-conversation'),
  ).toBe(false)
})

it('renames only the authenticated owner conversation', async () => {
  mocks.findFirst.mockResolvedValue({
    surface: 'IMAGE_STUDIO',
    projectId: null,
    messages: [{ role: 'user', content: 'Hi', workspaceKey: 'image-natural' }],
  })
  mocks.update.mockResolvedValue({})
  expect(
    await renameAssistantConversation('clerk-owner', 'conversation-id', {
      title: 'My title',
    }),
  ).toEqual({ title: 'My title' })
  expect(mocks.findFirst).toHaveBeenCalledWith({
    where: { id: 'conversation-id', userId: 'owner-id' },
    select: { messages: true, surface: true, projectId: true },
  })
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: 'conversation-id', userId: 'owner-id' },
    data: { title: 'My title' },
  })
  mocks.findFirst.mockResolvedValue(null)
  expect(
    await renameAssistantConversation('clerk-owner', 'missing', {
      title: 'My title',
    }),
  ).toBeNull()
})

it('renames an unstamped image conversation but not a canvas one without a project', async () => {
  mocks.update.mockResolvedValue({})
  mocks.findFirst.mockResolvedValue({
    surface: 'IMAGE_STUDIO',
    projectId: null,
    messages: [{ role: 'user', content: 'Hi' }],
  })
  expect(
    await renameAssistantConversation('clerk-owner', 'old-image', {
      title: 'My title',
    }),
  ).toEqual({ title: 'My title' })
  expect(mocks.update).toHaveBeenCalledTimes(1)

  mocks.findFirst.mockResolvedValue({
    surface: 'NODE_CANVAS',
    projectId: null,
    messages: [{ role: 'user', content: 'Hi' }],
  })
  expect(
    await renameAssistantConversation('clerk-owner', 'orphan-canvas', {
      title: 'My title',
    }),
  ).toBeNull()
  expect(mocks.update).toHaveBeenCalledTimes(1)
})

it('lists only the current workspace without mixing operator histories', async () => {
  mocks.queryRaw.mockResolvedValue([
    {
      id: 'one',
      stamp: 'image-natural',
      surface: 'IMAGE_STUDIO',
      projectId: null,
      title: 'Name',
      updatedAt: new Date('2026-09-09T00:00:00Z'),
      messageCount: 8,
      operatorThread: true,
    },
  ])
  const result = await listAssistantConversations('clerk-owner', {
    workspaceKey: 'image-natural',
    surface: 'IMAGE_STUDIO',
    operatorOnly: true,
    limit: 20,
  })
  expect(mocks.queryRaw).toHaveBeenCalledOnce()
  const query = mocks.queryRaw.mock.calls[0][0]
  expect(query.values).toEqual([
    'owner-id',
    'IMAGE_STUDIO',
    null,
    'image-tags',
    true,
    20,
  ])
  expect(query.sql).toContain('jsonb_array_length')
  expect(query.sql).toContain('AND COALESCE')
  expect(query.sql).not.toMatch(/SELECT[^]*,\s*"messages"\s*[,\n]/)
  expect(result[0]).toMatchObject({
    workspaceKey: 'image-natural',
    messageCount: 8,
    operatorThread: true,
    updatedAt: '2026-09-09T00:00:00.000Z',
  })
  expect(result[0]).not.toHaveProperty('messages')
  expect(result[0]).not.toHaveProperty('stamp')
})
it('keeps canvas lists scoped to their project', async () => {
  mocks.queryRaw.mockResolvedValue([])
  await listAssistantConversations('clerk-owner', {
    workspaceKey: 'canvas:project-one',
    surface: 'NODE_CANVAS',
    projectId: 'project-one',
  })
  const query = mocks.queryRaw.mock.calls[0][0]
  expect(query.values).toEqual(['owner-id', 'NODE_CANVAS', 'project-one', 20])
  expect(mocks.findProject).toHaveBeenCalledWith({
    where: { id: 'project-one', userId: 'owner-id', isDeleted: false },
    select: { id: true },
  })
})

// ─── 每轮结账（assistant-shell-v2 §7.2 / §7.5）────────────────────

const ROUND = {
  createdAt: '2026-09-11T00:00:00.000Z',
  facts: ['夜景配色定为冷蓝'],
  decisions: ['用 16:9'],
  todos: [],
  evidenceRefs: ['#e1'],
}

function serializedConversation(
  initial: AssistantConversationRoundStored[] = [],
) {
  let rounds = structuredClone(initial)
  let queue = Promise.resolve()
  mocks.transaction.mockImplementation(
    async (action: (tx: unknown) => Promise<unknown>) => {
      let release = () => {}
      const tx = {
        $queryRaw: async () => {
          const previous = queue
          queue = new Promise<void>((resolve) => {
            release = resolve
          })
          await previous
          return [{ id: 'conv-1' }]
        },
        assistantConversation: {
          findUnique: async () => ({
            id: 'conv-1',
            rounds: structuredClone(rounds),
          }),
          update: async (input: {
            data: { rounds: AssistantConversationRoundStored[] }
          }) => {
            await Promise.resolve()
            rounds = structuredClone(input.data.rounds)
            return { id: 'conv-1' }
          },
        },
      }
      try {
        return await action(tx)
      } finally {
        release()
      }
    },
  )
  return () => rounds
}

it('同时结账保留两轮并分配不同轮次号', async () => {
  const read = serializedConversation()
  const stored = await Promise.all([
    appendAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      { ...ROUND, facts: ['first'] },
      'image-natural',
    ),
    appendAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      { ...ROUND, facts: ['second'] },
      'image-natural',
    ),
  ])
  expect(stored.map((round) => round?.roundIndex)).toEqual([0, 1])
  expect(read().map((round) => round.facts)).toEqual([['first'], ['second']])
})

it('编辑既有轮次与新一轮结账同时发生时两项都保存', async () => {
  const read = serializedConversation([{ ...ROUND, roundIndex: 9 }])
  await Promise.all([
    updateAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      9,
      { facts: ['edited'] },
      'image-natural',
    ),
    appendAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      { ...ROUND, facts: ['next'] },
      'image-natural',
    ),
  ])
  expect(read()).toMatchObject([
    { roundIndex: 9, facts: ['edited'], editedByUser: true },
    { roundIndex: 10, facts: ['next'] },
  ])
})

it('同时编辑不同栏位时读取锁内的新版本，保留两处编辑', async () => {
  const read = serializedConversation([{ ...ROUND, roundIndex: 9 }])
  await Promise.all([
    updateAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      9,
      { facts: ['edited'] },
      'image-natural',
    ),
    updateAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      9,
      { todos: ['next action'] },
      'image-natural',
    ),
  ])
  expect(read()[0]).toMatchObject({ facts: ['edited'], todos: ['next action'] })
})

it('会话行锁按所有者与工作区过滤，锁不到就不读取或修改轮次', async () => {
  mocks.lockConversation.mockResolvedValueOnce([])
  expect(
    await appendAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      ROUND,
      'image-natural',
    ),
  ).toBeNull()
  const query = mocks.lockConversation.mock.calls[0][0]
  expect(query.sql).toContain('FOR UPDATE')
  expect(query.values).toEqual([
    'conv-1',
    'owner-id',
    'IMAGE_STUDIO',
    null,
    'image-tags',
  ])
  expect(mocks.findUnique).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

it('结账记录追加进这段会话，轮次号由服务端按已有条数定', async () => {
  mocks.findUnique.mockResolvedValue({ id: 'conv-1', rounds: [] })
  mocks.update.mockResolvedValue({})

  const stored = await appendAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    ROUND,
    'image-natural',
  )

  expect(stored).toEqual({ ...ROUND, roundIndex: 0 })
  expect(mocks.findUnique).toHaveBeenCalledWith({
    where: { id: 'conv-1' },
    select: { id: true, rounds: true },
  })
  expect(mocks.update.mock.calls[0]?.[0]).toEqual({
    where: { id: 'conv-1' },
    data: { rounds: [{ ...ROUND, roundIndex: 0 }] },
  })
})

it('轮次号接着已有的那几条数，⛔ 不从零开始', async () => {
  mocks.findUnique.mockResolvedValue({
    id: 'conv-1',
    rounds: [{ ...ROUND, roundIndex: 0 }],
  })
  mocks.update.mockResolvedValue({})

  const stored = await appendAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    ROUND,
    'image-natural',
  )

  expect(stored?.roundIndex).toBe(1)
})

it('裁剪旧结论后轮次号仍递增，后续编辑能指向唯一轮次', async () => {
  mocks.findUnique.mockResolvedValue({
    id: 'conv-1',
    rounds: Array.from({ length: 100 }, (_, index) => ({
      ...ROUND,
      roundIndex: index + 12,
    })),
  })
  mocks.update.mockResolvedValue({})

  const stored = await appendAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    ROUND,
    'image-natural',
  )

  expect(stored?.roundIndex).toBe(112)
  const written = mocks.update.mock.calls[0]?.[0].data.rounds
  expect(written).toHaveLength(100)
  expect(
    new Set(written.map((entry: { roundIndex: number }) => entry.roundIndex))
      .size,
  ).toBe(100)
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
  mocks.findUnique.mockResolvedValue({
    id: 'conv-1',
    rounds: [{ ...ROUND, roundIndex: 0, sourceRefs }],
  })
  mocks.queryRaw.mockResolvedValue([{ id: 'conv-1' }])
  mocks.update.mockResolvedValue({})

  const rounds = await listAssistantConversationRounds('owner-id', 'conv-1', {
    workspaceKey: 'image-natural',
    limit: 8,
  })
  expect(rounds[0]).toMatchObject({ sourceRefs })
  const updated = await updateAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    0,
    { decisions: ['仅认可这版脸部，身体待改'] },
    'image-natural',
  )
  expect(updated).toMatchObject({ sourceRefs, editedByUser: true })
  expect(mocks.update.mock.calls[0]?.[0].data.rounds[0]).toMatchObject({
    sourceRefs,
  })
})

it('会话不归这个用户时不写，也不抛 —— 结账不许阻塞 done', async () => {
  mocks.lockConversation.mockResolvedValueOnce([])

  expect(
    await appendAssistantConversationRound(
      'clerk-owner',
      'conv-other',
      ROUND,
      'image-natural',
    ),
  ).toBeNull()
  expect(mocks.update).not.toHaveBeenCalled()
})

it('读回来时坏掉的那一条丢掉，⛔ 不作废整段会话', async () => {
  mocks.queryRaw.mockResolvedValue([
    {
      id: 'conv-1',
      surface: 'IMAGE_STUDIO',
      projectId: null,
      title: null,
      messages: [
        { role: 'user', content: '你好', workspaceKey: 'image-natural' },
      ],
      rounds: [
        { ...ROUND, roundIndex: 0 },
        { roundIndex: 1, facts: 'not-an-array' },
      ],
      createdAt: new Date('2026-09-11T00:00:00Z'),
      updatedAt: new Date('2026-09-11T00:00:00Z'),
    },
  ])

  const record = await getAssistantConversation('clerk-owner', {
    id: 'conv-1',
    workspaceKey: 'image-natural',
  })

  expect(record?.rounds).toEqual([{ ...ROUND, roundIndex: 0 }])
  expect(record?.messages).toHaveLength(1)
  expect(record?.workspaceKey).toBe('image-natural')
})

/**
 * **下一轮注入要读的那几条**（§7.6，commit #12）。
 *
 * ⚠ 它收的是 DB `userId`（⛔ 不是 clerkId）—— 调用方手上已经有那一行，
 * 为签名整齐再 upsert 一次用户，是给每一轮多加一次写库。
 */
it('注入读：按 userId 核所有权，只回最近几条', async () => {
  mocks.queryRaw.mockResolvedValue([{ id: 'conv-1' }])
  mocks.findUnique.mockResolvedValue({
    rounds: [
      { ...ROUND, roundIndex: 0 },
      { ...ROUND, roundIndex: 1 },
      { ...ROUND, roundIndex: 2 },
    ],
  })

  const rounds = await listAssistantConversationRounds('owner-id', 'conv-1', {
    workspaceKey: 'image-natural',
    limit: 2,
  })

  expect(mocks.queryRaw.mock.calls[0][0].values).toEqual([
    'conv-1',
    'owner-id',
    'IMAGE_STUDIO',
    null,
    'image-tags',
  ])
  expect(mocks.findUnique).toHaveBeenCalledWith({
    where: { id: 'conv-1' },
    select: { rounds: true },
  })
  expect(rounds.map((round) => round.roundIndex)).toEqual([1, 2])
  // ⛔ 没有额外一次 ensureUser：调用方已经有那一行了。
  expect(mocks.ensureUser).not.toHaveBeenCalled()
})

it('注入读：会话不归这个用户 → 空，⛔ 不抛（注入不到不是跑不了）', async () => {
  mocks.queryRaw.mockResolvedValue([])
  expect(
    await listAssistantConversationRounds('owner-id', 'conv-other', {
      workspaceKey: 'image-natural',
      limit: 8,
    }),
  ).toEqual([])
  expect(mocks.findUnique).not.toHaveBeenCalled()
})

it('用户改过的那一条按 roundIndex 认，三栏覆盖、编号与时刻原样留着（§7.7）', async () => {
  mocks.findUnique.mockResolvedValue({
    id: 'conv-1',
    rounds: [
      { ...ROUND, roundIndex: 3 },
      { ...ROUND, roundIndex: 4, facts: ['旧事实'] },
    ],
  })
  mocks.update.mockResolvedValue({})

  const updated = await updateAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    4,
    { facts: ['我改过的事实'], decisions: ['用 3:2'], todos: [] },
    'image-natural',
  )

  expect(updated).toEqual({
    ...ROUND,
    roundIndex: 4,
    facts: ['我改过的事实'],
    decisions: ['用 3:2'],
    todos: [],
    editedByUser: true,
  })
  // ⚠ 另一条一个字都没动。
  expect(mocks.update.mock.calls[0]?.[0]).toEqual({
    where: { id: 'conv-1' },
    data: {
      rounds: [
        { ...ROUND, roundIndex: 3 },
        {
          ...ROUND,
          roundIndex: 4,
          facts: ['我改过的事实'],
          decisions: ['用 3:2'],
          todos: [],
          editedByUser: true,
        },
      ],
    },
  })
})

it('⭐ 只钉住那一次：写 pinnedEvidence、三栏原样、⛔ 不标 editedByUser（实测第三组 B）', async () => {
  mocks.findUnique.mockResolvedValue({
    id: 'conv-1',
    rounds: [{ ...ROUND, roundIndex: 4, facts: ['模型压出来的事实'] }],
  })
  mocks.update.mockResolvedValue({})

  const pinned = [
    {
      refs: ['#e12'],
      conclusion: '鸣潮式 3D 靠卡通着色。',
      sourceCount: 8,
      corroborated: 3,
    },
  ]
  const updated = await updateAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    4,
    { pinnedEvidence: pinned },
    'image-natural',
  )

  expect(updated).toEqual({
    ...ROUND,
    roundIndex: 4,
    facts: ['模型压出来的事实'],
    pinnedEvidence: pinned,
  })
  expect(updated?.editedByUser).toBeUndefined()
})

it('没有这一号 / 不归他时不写库，返回 null', async () => {
  mocks.findUnique.mockResolvedValue({
    id: 'conv-1',
    rounds: [{ ...ROUND, roundIndex: 0 }],
  })
  expect(
    await updateAssistantConversationRound(
      'clerk-owner',
      'conv-1',
      9,
      { facts: [], decisions: [], todos: [] },
      'image-natural',
    ),
  ).toBeNull()

  mocks.lockConversation.mockResolvedValueOnce([])
  expect(
    await updateAssistantConversationRound(
      'clerk-owner',
      'conv-other',
      0,
      { facts: [], decisions: [], todos: [] },
      'image-natural',
    ),
  ).toBeNull()
  expect(mocks.update).not.toHaveBeenCalled()
})

it('does not resume a natural-language conversation from the tag workspace', async () => {
  mocks.queryRaw.mockImplementation(async (query: { values: unknown[] }) =>
    query.values.includes('image-natural') ? [{ id: 'conv-1' }] : [],
  )
  expect(
    await getAssistantConversation('clerk-owner', {
      id: 'conv-1',
      workspaceKey: 'image-tags',
      surface: 'IMAGE_STUDIO',
    }),
  ).toBeNull()
  expect(
    await listAssistantConversationRounds('owner-id', 'conv-1', {
      workspaceKey: 'image-tags',
      limit: 8,
    }),
  ).toEqual([])
  expect(mocks.findUnique).not.toHaveBeenCalled()
})

it('rejects contradictory surface and project classifications before saving', async () => {
  for (const input of [
    { workspaceKey: 'image-tags', surface: 'LORA' as const },
    {
      workspaceKey: 'canvas:project-one',
      surface: 'NODE_CANVAS' as const,
      projectId: 'project-two',
    },
  ]) {
    await expect(
      upsertAssistantConversation('clerk-owner', {
        ...input,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).rejects.toMatchObject({ errorCode: 'ASSISTANT_WORKSPACE_MISMATCH' })
  }
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

it('rejects inaccessible canvas projects before reading conversations', async () => {
  mocks.findProject.mockResolvedValue(null)
  await expect(
    getAssistantConversation('clerk-owner', {
      workspaceKey: 'canvas:someone-elses-project',
      surface: 'NODE_CANVAS',
    }),
  ).rejects.toMatchObject({ errorCode: 'ASSISTANT_WORKSPACE_NOT_FOUND' })
  expect(mocks.queryRaw).not.toHaveBeenCalled()
})

it('will not reassign an existing conversation', async () => {
  mocks.queryRaw.mockResolvedValue([])
  await expect(
    upsertAssistantConversation('clerk-owner', {
      id: '00000000-0000-4000-8000-000000000001',
      workspaceKey: 'lora',
      surface: 'LORA',
      messages: [{ role: 'user', content: 'Continue' }],
    }),
  ).rejects.toMatchObject({
    errorCode: 'ASSISTANT_CONVERSATION_NOT_FOUND',
    httpStatus: 404,
  })
  expect(mocks.queryRaw.mock.calls[0][0].values).toEqual([
    '00000000-0000-4000-8000-000000000001',
    'owner-id',
    'LORA',
    null,
  ])
  expect(mocks.update).not.toHaveBeenCalled()
})

it('stamps the image workbench on the first message only, and nothing elsewhere', async () => {
  const row = (surface: string) => ({
    id: 'new',
    surface,
    projectId: null,
    title: null,
    messages: [],
    rounds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  mocks.create.mockResolvedValueOnce(row('IMAGE_STUDIO'))
  await upsertAssistantConversation('clerk-owner', {
    workspaceKey: 'image-tags',
    surface: 'IMAGE_STUDIO',
    messages: [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b', workspaceKey: 'image-natural' },
    ],
  })
  const stamped = mocks.create.mock.calls[0][0].data
  expect(stamped).toMatchObject({ surface: 'IMAGE_STUDIO', projectId: null })
  expect(stamped).not.toHaveProperty('workspaceKey')
  expect(stamped.messages).toMatchObject([
    { content: 'a', workspaceKey: 'image-tags' },
    { content: 'b' },
  ])
  expect(stamped.messages[1]).not.toHaveProperty('workspaceKey')

  mocks.create.mockResolvedValueOnce(row('LORA'))
  await upsertAssistantConversation('clerk-owner', {
    workspaceKey: 'lora',
    surface: 'LORA',
    messages: [{ role: 'user', content: 'a' }],
  })
  expect(mocks.create.mock.calls[1][0].data.messages[0]).not.toHaveProperty(
    'workspaceKey',
  )
})

it('unstamped image conversations belong to the natural workbench, never to the tag one', async () => {
  mocks.queryRaw.mockResolvedValue([
    {
      id: 'old-1',
      stamp: null,
      surface: 'IMAGE_STUDIO',
      projectId: null,
      title: 'Before the two workbenches split',
      updatedAt: new Date('2026-09-09T00:00:00Z'),
      messageCount: 2,
      operatorThread: true,
    },
  ])
  const natural = await listAssistantConversations('clerk-owner', {
    workspaceKey: 'image-natural',
    surface: 'IMAGE_STUDIO',
  })
  expect(mocks.queryRaw.mock.lastCall![0].sql).toContain('IS DISTINCT FROM')
  expect(natural[0]?.workspaceKey).toBe('image-natural')

  mocks.queryRaw.mockResolvedValue([])
  await listAssistantConversations('clerk-owner', {
    workspaceKey: 'image-tags',
    surface: 'IMAGE_STUDIO',
  })
  const tags = mocks.queryRaw.mock.lastCall![0]
  expect(tags.sql).not.toContain('IS DISTINCT FROM')
  expect(tags.values).toContain('image-tags')
})

it('derives the workspace of video, lora and canvas rows from the row itself', async () => {
  mocks.queryRaw.mockResolvedValue(
    [
      ['VIDEO_STUDIO', null],
      ['LORA', null],
      ['NODE_CANVAS', 'project-one'],
    ].map(([surface, projectId], index) => ({
      id: `row-${index}`,
      stamp: null,
      surface,
      projectId,
      title: null,
      updatedAt: new Date('2026-09-09T00:00:00Z'),
      messageCount: 1,
      operatorThread: true,
    })),
  )
  const result = await listAssistantConversations('clerk-owner', {
    workspaceKey: 'video',
    surface: 'VIDEO_STUDIO',
  })
  expect(result.map((row) => row.workspaceKey)).toEqual([
    'video',
    'lora',
    'canvas:project-one',
  ])
})

it.each([true, false])(
  'filters latest and explicit conversation reads by operator mode %s',
  async (operatorOnly) => {
    mocks.queryRaw.mockResolvedValue([])
    for (const id of [undefined, '00000000-0000-4000-8000-000000000001']) {
      expect(
        await getAssistantConversation('clerk-owner', {
          workspaceKey: 'image-tags',
          surface: 'IMAGE_STUDIO',
          operatorOnly,
          id,
        }),
      ).toBeNull()
      const query = mocks.queryRaw.mock.lastCall![0]
      expect(query.sql).toContain('COALESCE("messages"->0->\'operator\'')
      expect(query.values).toEqual([
        'owner-id',
        'IMAGE_STUDIO',
        null,
        'image-tags',
        ...(id ? [id] : []),
        operatorOnly,
      ])
    }
    expect(mocks.findFirst).not.toHaveBeenCalled()
  },
)

it('filters legacy text lists with false and leaves explicit combined lists unfiltered', async () => {
  mocks.queryRaw.mockResolvedValue([])
  for (const operatorOnly of [false, undefined]) {
    await listAssistantConversations('clerk-owner', {
      workspaceKey: 'image-natural',
      surface: 'IMAGE_STUDIO',
      operatorOnly,
    })
    const query = mocks.queryRaw.mock.lastCall![0]
    expect(query.values).toEqual([
      'owner-id',
      'IMAGE_STUDIO',
      null,
      'image-tags',
      ...(operatorOnly === false ? [false] : []),
      20,
    ])
  }
})
