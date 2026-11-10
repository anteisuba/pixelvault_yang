import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ASSISTANT_EVIDENCE_RECALL_LIMITS } from '@/constants/assistant-operator'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import {
  ResearchSourceReceiptSchema,
  type EvidenceItem,
} from '@/types/research'
import {
  appendAssistantEvidenceBook,
  recallAssistantEvidence,
  searchPastResearch,
} from '@/services/research/assistant-evidence-book.service'

/**
 * 证据本（assistant-shell-v2 §7.3）真库（L2a）：编号在会话内接着数、并发两次各拿各的号、
 * 中途写坏整批回滚、别人的会话写不进去——这些只有真事务、真行锁才测得出来。
 */
const ITEM = {
  id: 'moegirl:shiye',
  sourceId: 'moegirl' as const,
  sourceTier: 'community' as const,
  retrievedAt: '2026-09-11T00:00:00.000Z',
  title: '萌娘百科 · 时夜',
  kind: 'text' as const,
  excerpt: '黑色长发。',
}

/** Postgres 的 jsonb 收不下 `\u0000`：拿它让某一行真写失败。 */
const UNWRITABLE = { ...ITEM, id: 'broken', excerpt: 'bad\u0000byte' }

async function setup() {
  const user = await createTestUser()
  const conversation = await db.assistantConversation.create({
    data: { userId: user.id, surface: 'IMAGE_STUDIO', messages: [] },
  })
  const args = (items: EvidenceItem[] = [ITEM]) => ({
    userId: user.id,
    workspaceKey: 'image-natural',
    surface: 'IMAGE_STUDIO' as const,
    conversationId: conversation.id,
    entries: [{ goal: '外貌', queries: ['时夜 外貌'], items, receipts: [] }],
  })
  const runs = () =>
    db.researchRun.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    })
  return { user, conversation, args, runs }
}

type StoredEvidence = { ref: string; excerpt?: string; excerptKind?: string }
const evidenceOf = (row: { evidence: unknown }) =>
  row.evidence as StoredEvidence[]

beforeEach(resetDatabase)

describe('证据本（真库）', () => {
  it('原生源实际查询原样进入回执，旧回执不填充查询', async () => {
    const { args, runs } = await setup()
    const receipt = {
      sourceId: 'web_search' as const,
      status: 'ok' as const,
      count: 1,
      tookMs: 0,
    }
    expect(ResearchSourceReceiptSchema.parse(receipt)).not.toHaveProperty(
      'queries',
    )
    const actual = ResearchSourceReceiptSchema.parse({
      ...receipt,
      queries: ['时夜 外貌 实际调用查询'],
    })
    const input = args()

    await appendAssistantEvidenceBook({
      ...input,
      entries: [{ ...input.entries[0]!, receipts: [actual] }],
    })

    const [row] = await runs()
    expect(row?.perSource).toEqual([actual])
  })

  it.each(['answer_fragment', 'source_excerpt', 'none'] as const)(
    '保存与召回保留摘要来源语义 %s',
    async (excerptKind) => {
      const { user, conversation, args } = await setup()
      await appendAssistantEvidenceBook(args([{ ...ITEM, excerptKind }]))

      const recalled = await recallAssistantEvidence({
        userId: user.id,
        conversationId: conversation.id,
        refs: ['#e1'],
      })
      expect(recalled.items[0]).toMatchObject({
        ref: '#e1',
        body: ITEM.excerpt,
        excerptKind,
      })
    },
  )

  it('同一会话并发两次：编号不撞，引用各自指回自己的内容', async () => {
    const { user, conversation, args } = await setup()

    const results = await Promise.all([
      appendAssistantEvidenceBook(args([{ ...ITEM, excerpt: 'first' }])),
      appendAssistantEvidenceBook(args([{ ...ITEM, excerpt: 'second' }])),
    ])

    expect(results.flatMap((result) => result.refs).sort()).toEqual([
      '#e1',
      '#e2',
    ])
    const recalled = await recallAssistantEvidence({
      userId: user.id,
      conversationId: conversation.id,
      refs: ['#e1', '#e2'],
    })
    const bodyOf = (ref: string) =>
      recalled.items.find((item) => item.ref === ref)?.body
    const firstRef = results[0].refs[0]!
    const secondRef = results[1].refs[0]!
    expect(bodyOf(firstRef)).toBe('first')
    expect(bodyOf(secondRef)).toBe('second')
  })

  it('多条 ResearchRun 中途写坏整批回滚，返回的空编号不会指向部分记录', async () => {
    const { args, runs } = await setup()
    const input = args()

    expect(
      await appendAssistantEvidenceBook({
        ...input,
        entries: [
          input.entries[0]!,
          { ...input.entries[0]!, items: [UNWRITABLE] },
        ],
      }),
    ).toEqual({ refs: [], researchRunIds: [] })
    expect(await runs()).toEqual([])

    // 回滚后编号从头数：下一次还是 #e1。
    expect((await appendAssistantEvidenceBook(input)).refs).toEqual(['#e1'])
  })

  it('别人的会话写不进去：回空编号，库里不多一行', async () => {
    const { args } = await setup()
    const stranger = await createTestUser()

    expect(
      await appendAssistantEvidenceBook({
        ...args(),
        userId: stranger.id,
      }),
    ).toEqual({ refs: [], researchRunIds: [] })
    expect(await db.researchRun.count()).toBe(0)
  })

  it('返回本次保存的全部真实编号，摘要容量不截断证据卡的来源身份', async () => {
    const { args } = await setup()
    const items = Array.from({ length: 13 }, (_, index) => ({
      ...ITEM,
      id: `item-${index}`,
    }))
    expect((await appendAssistantEvidenceBook(args(items))).refs).toHaveLength(
      13,
    )
  })

  it('编号落在 evidence 每一项上，正文原样跟着走', async () => {
    const { args, runs } = await setup()
    const result = await appendAssistantEvidenceBook(args())

    expect(result.refs).toEqual(['#e1'])
    const [row] = await runs()
    expect(result.researchRunIds).toEqual([row?.id])
    expect(evidenceOf(row!)[0]).toMatchObject({
      ref: '#e1',
      excerpt: '黑色长发。',
    })
  })

  it('⭐ 序号在**会话内**接着数，⛔ 不从每次检索重新开始；别的会话从 1 数', async () => {
    const { user, args } = await setup()
    await appendAssistantEvidenceBook(args([ITEM, { ...ITEM, id: 'b' }]))

    const result = await appendAssistantEvidenceBook(
      args([ITEM, { ...ITEM, id: 'danbooru:x' }]),
    )
    expect(result.refs).toEqual(['#e3', '#e4'])

    const otherConversation = await db.assistantConversation.create({
      data: { userId: user.id, surface: 'IMAGE_STUDIO', messages: [] },
    })
    const fresh = await appendAssistantEvidenceBook({
      ...args(),
      conversationId: otherConversation.id,
    })
    expect(fresh.refs).toEqual(['#e1'])
  })

  it('一条证据都没有时不写行，也不占编号', async () => {
    const { args } = await setup()
    expect(await appendAssistantEvidenceBook(args([]))).toEqual({
      refs: [],
      researchRunIds: [],
    })
    expect(await db.researchRun.count()).toBe(0)
  })

  it('⚠ 写不进去时回空编号、⛔ 不抛 —— 结账不许阻塞 done', async () => {
    const { args } = await setup()
    expect(await appendAssistantEvidenceBook(args([UNWRITABLE]))).toEqual({
      refs: [],
      researchRunIds: [],
    })
  })
})

describe('按编号翻证据本（真库）', () => {
  it('⭐ 两道闸：别的会话、别人的同号都翻不出来', async () => {
    const { user, conversation, args } = await setup()
    await appendAssistantEvidenceBook(args())
    const other = await setup()
    await appendAssistantEvidenceBook(
      other.args([{ ...ITEM, excerpt: '别人的' }]),
    )

    const mine = await recallAssistantEvidence({
      userId: user.id,
      conversationId: conversation.id,
      refs: ['#e1'],
    })
    expect(mine.items.map((item) => item.body)).toEqual(['黑色长发。'])

    const crossUser = await recallAssistantEvidence({
      userId: user.id,
      conversationId: other.conversation.id,
      refs: ['#e1'],
    })
    expect(crossUser).toEqual({ items: [], missing: ['#e1'] })
  })

  it('命中：按**模型问的顺序**回，正文与出处跟着走', async () => {
    const { user, conversation, args } = await setup()
    await appendAssistantEvidenceBook(
      args([
        { ...ITEM, excerpt: '黑色长发。' },
        { ...ITEM, id: 'b', excerpt: '金色瞳孔。' },
      ]),
    )

    const result = await recallAssistantEvidence({
      userId: user.id,
      conversationId: conversation.id,
      refs: ['#e2', '#e1'],
    })
    expect(result.items.map((item) => item.ref)).toEqual(['#e2', '#e1'])
    expect(result.items[0]).toMatchObject({
      body: '金色瞳孔。',
      source: 'moegirl',
      title: '萌娘百科 · 时夜',
    })
    expect(result.items[0]).not.toHaveProperty('excerptKind')
    expect(result.missing).toEqual([])
  })

  it('⚠ 翻不到的号进 missing，⛔ 不抛（部分命中照样有用）', async () => {
    const { user, conversation, args } = await setup()
    await appendAssistantEvidenceBook(args())

    const result = await recallAssistantEvidence({
      userId: user.id,
      conversationId: conversation.id,
      refs: ['#e1', '#e9'],
    })
    expect(result.items).toHaveLength(1)
    expect(result.missing).toEqual(['#e9'])
  })

  it('标签型证据压平成一段可读正文（三种 kind 一个出口）', async () => {
    const { user, conversation, args } = await setup()
    await appendAssistantEvidenceBook(
      args([
        {
          id: 'moegirl:tags',
          sourceId: 'moegirl',
          sourceTier: 'community',
          retrievedAt: ITEM.retrievedAt,
          title: ITEM.title,
          kind: 'tags',
          tags: ['black hair', 'yellow eyes'],
          provenance: '萌百分类',
        } as EvidenceItem,
      ]),
    )

    const result = await recallAssistantEvidence({
      userId: user.id,
      conversationId: conversation.id,
      refs: ['#e1'],
    })
    expect(result.items[0]?.body).toBe('black hair, yellow eyes（萌百分类）')
  })

  it('⛔ 一次最多翻几条：超出的那些压根不查', async () => {
    const { user, conversation } = await setup()
    const result = await recallAssistantEvidence({
      userId: user.id,
      conversationId: conversation.id,
      refs: ['#e1', '#e2', '#e3', '#e4', '#e5', '#e6'],
    })
    expect(result.missing).toHaveLength(
      ASSISTANT_EVIDENCE_RECALL_LIMITS.maxRefsPerCall,
    )
  })
})

describe('searchPastResearch（翻记忆时顺带翻以前搜过的，跨会话）', () => {
  it('只回目标或查询词对得上的、只回本人成功的；不带打了注入标记的、也不带创作者自己给的图', async () => {
    const user = await createTestUser()
    const stranger = await createTestUser()
    const base = {
      surface: 'IMAGE_STUDIO' as const,
      grounded: true,
      perSource: [],
    }
    await db.researchRun.create({
      data: {
        ...base,
        userId: user.id,
        goal: '时夜 外貌',
        query: '时夜 外貌',
        status: 'succeeded',
        createdAt: new Date('2026-10-01T03:00:00.000Z'),
        evidence: [
          ITEM,
          { ...ITEM, id: 'bad', title: '可疑', untrusted: true },
          { ...ITEM, id: 'mine', title: '你给的图', sourceId: 'vision_input' },
        ],
      },
    })
    await db.researchRun.create({
      data: {
        ...base,
        userId: user.id,
        goal: 'Rossi 标签',
        query: 'rossi arknights',
        status: 'succeeded',
        evidence: [ITEM],
      },
    })
    await db.researchRun.create({
      data: {
        ...base,
        userId: user.id,
        goal: '时夜 失败那次',
        query: '时夜',
        status: 'failed',
        evidence: [ITEM],
      },
    })
    await db.researchRun.create({
      data: {
        ...base,
        userId: stranger.id,
        goal: '时夜 别人的',
        query: '时夜',
        status: 'succeeded',
        evidence: [ITEM],
      },
    })

    const found = await searchPastResearch(user.id, '时夜')

    expect(found).toEqual([
      {
        goal: '时夜 外貌',
        day: '2026-10-01',
        items: [{ title: '萌娘百科 · 时夜', excerpt: '黑色长发。' }],
      },
    ])
  })
})
