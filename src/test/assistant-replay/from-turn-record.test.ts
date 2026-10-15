// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_MENTION_KIND_IDS,
  ASSISTANT_MENTION_SCOPE_IDS,
} from '@/constants/assistant-mention'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { describeMentionNote } from '@/lib/assistant-mention'
import {
  stripTurnRecordDataUrls,
  TURN_RECORD_DATA_URL_PLACEHOLDER,
} from '@/lib/assistant-turn-record'
import { buildCanvasOperatorSnapshot } from '@/lib/studio-operator-canvas-snapshot'
import type { AssistantMention } from '@/types/assistant-mention'
import { AssistantTurnRecordSchema } from '@/types/assistant-turn-record'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

import { loadReplayBoard } from './fixture'
import { replayFromTurnRecord } from './from-turn-record'

const BOARD = loadReplayBoard('malfoy')
const GOYLE = 'image9c0d1e2f-1111-4222-8333-444455556666'
const S04B = 'video4f610510-8120-436b-b3ac-ba4202af49b5'
const TURN_ID = '33b9bd2e-b43d-4cc9-872d-bb5d57f8d420'
/** 上一轮找到的一张图与一支视频（`#3`、`#4`）。 */
const FINDS = [
  {
    kind: 'image' as const,
    n: 3,
    imageUrl: 'https://img.test/3.jpg',
    pageUrl: 'https://www.pixiv.net/artworks/3',
    domain: 'pixiv.net',
    title: '立绘',
  },
  {
    kind: 'video' as const,
    n: 4,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'PV',
    platform: 'youtube' as const,
  },
]

function imageUrls(state: NodeWorkflowStateV4): string[] {
  return state.nodes.flatMap((node) =>
    node.data.kind === NODE_MEDIA_KIND_IDS.image && node.data.url
      ? [node.data.url]
      : [],
  )
}

/** 前端发的那份快照（与 `runner.ts` 同一套拼法）。 */
function snapshotOf(state: NodeWorkflowStateV4, selected: string[]) {
  const referenceUrls = imageUrls(state)
  return {
    prompt: '',
    availableModels: [],
    references: {
      items: referenceUrls.map((url) => ({
        url,
        name: state.nodes.find(
          (node) =>
            node.data.kind === NODE_MEDIA_KIND_IDS.image &&
            node.data.url === url,
        )!.data.name,
        implicit: true,
      })),
      limit: 16,
    },
    canvas: buildCanvasOperatorSnapshot({
      referenceUrls,
      nodes: state.nodes,
      edges: state.edges,
      currentShotNo: null,
      selectedNodeIds: selected,
      mentionedNodeIds: [GOYLE],
    }),
  }
}

const goyle = BOARD.state.nodes.find((node) => node.id === GOYLE)!
const mention: AssistantMention = {
  kind: ASSISTANT_MENTION_KIND_IDS.image,
  id: GOYLE,
  label: goyle.data.name,
  scope: ASSISTANT_MENTION_SCOPE_IDS.canvas,
  nodeId: GOYLE,
  url: 'https://cdn.replay.test/malfoy/goyle.png',
}

/** 库里导出的那一行（`row_to_json`：时间是字符串，多带的列照收照丢）。 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'turn_record_1',
    userId: 'db_user_1',
    turnId: TURN_ID,
    hops: 2,
    outcome: 'done',
    errorCode: null,
    workspaceKey: 'canvas:proj_malfoy_replay',
    domain: 'canvas',
    projectId: 'proj_malfoy_replay',
    conversationId: null,
    adapterType: 'anthropic',
    modelId: 'claude-opus-5-5',
    routeModel: 'claude-opus-5-5',
    apiKeyId: 'key_anthropic',
    systemPromptHash: 'f'.repeat(64),
    promptVersion: '2026-10-15',
    input: {
      messages: [
        { role: 'user', content: '先看看板子' },
        { role: 'assistant', content: '好，板子上有八个镜头。' },
        {
          role: 'user',
          content: `S04b 去掉「${goyle.data.name}」的参考${describeMentionNote([mention])}`,
        },
      ],
      responseLanguage: 'chinese',
      mentions: [
        {
          kind: mention.kind,
          id: mention.id,
          label: mention.label,
          scope: mention.scope,
          nodeId: GOYLE,
        },
      ],
      priorSteps: [
        {
          tool: 'canvas_batch',
          status: 'done',
          summary: '断开',
          thisTurn: true,
        },
      ],
    },
    snapshot: snapshotOf(BOARD.state, [S04B]),
    transcript: [
      {
        type: 'board',
        text: 'BOARD',
        images: [],
        turn: { id: TURN_ID, hop: 2 },
      },
      {
        type: 'assistant',
        text: '',
        calls: [
          {
            id: 'call_1',
            tool: 'edit',
            input: JSON.stringify({
              ops: [{ op: 'disconnect', from: 'img-9c0d1e', to: 'vid-4f6105' }],
            }),
            signature: 'sig',
          },
        ],
      },
      {
        type: 'result',
        id: 'call_1',
        tool: 'edit',
        output: 'Landed.',
        error: false,
      },
      { type: 'assistant', text: '断好了。', calls: [] },
    ],
    snapshotBytes: 1234,
    sizeBytes: 5678,
    truncated: [],
    createdAt: '2026-10-15T08:00:00.000Z',
    updatedAt: '2026-10-15T08:00:05.000Z',
    ...overrides,
  }
}

describe('replayFromTurnRecord', () => {
  it('起始画布：从开轮的快照拼回 v4 画布，再拼一次快照与原来的一样', () => {
    const { board, gaps } = replayFromTurnRecord(row(), {
      id: 'T90',
      board: 'malfoy-t90',
    })
    expect(board.projectId).toBe('proj_malfoy_replay')
    expect(board.assetHost).toBe('cdn.replay.test')
    expect(board.state.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(BOARD.state.nodes.map((node) => node.id)),
    )
    expect(board.state.nodes).toHaveLength(BOARD.state.nodes.length)
    expect(
      board.state.edges
        .map((edge) => `${edge.source}>${edge.target}/${edge.slot}`)
        .sort(),
    ).toEqual(
      BOARD.state.edges
        .map((edge) => `${edge.source}>${edge.target}/${edge.slot}`)
        .sort(),
    )
    // ⭐ 不动点：拼回来的画布再拼一次快照，模型看到的那一份一字不差。
    const original = row().snapshot
    expect(snapshotOf(board.state, [S04B])).toEqual(original)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toContain('REPLAY_DEBUG')
  })

  it('题目：这一句（@ 写回 `@{名字}`）、之前的对话、选中的卡、选的那一家、整轮的模型回复', () => {
    const { testCase } = replayFromTurnRecord(row(), {
      id: 'T90',
      board: 'malfoy-t90',
    })
    expect(testCase.board).toBe('malfoy-t90')
    expect(testCase.source).toBe(
      `AssistantTurnRecord ${TURN_ID} · 2026-10-15T08:00:00.000Z · prompt 2026-10-15 · anthropic/claude-opus-5-5`,
    )
    expect(testCase.turn).toEqual({
      say: `S04b 去掉@{${goyle.data.name}}的参考`,
      history: [
        { role: 'user', content: '先看看板子' },
        { role: 'assistant', content: '好，板子上有八个镜头。' },
      ],
      responseLanguage: 'chinese',
      selected: ['S04b 冲出门'],
      clipSeconds: {},
    })
    expect(testCase.routes).toEqual([
      {
        routeModel: 'claude-opus-5-5',
        keys: ['anthropic'],
        expect: { adapterType: 'anthropic', modelId: 'claude-opus-5-5' },
      },
    ])
    expect(testCase.replies).toEqual([
      {
        text: '',
        calls: [
          {
            tool: 'edit',
            input: {
              ops: [{ op: 'disconnect', from: 'img-9c0d1e', to: 'vid-4f6105' }],
            },
          },
        ],
      },
      { text: '断好了。', calls: [] },
    ])
    expect(testCase.expect).toMatchObject({ end: 'done', requests: 2 })
  })

  it('记录写的就是 schema 那一份：服务端写下的形状照样读得回来', () => {
    expect(AssistantTurnRecordSchema.safeParse(row()).success).toBe(true)
  })

  it('收尾那一步空着回（quiet / empty）：末尾补一条 / 两条空回复', () => {
    expect(
      replayFromTurnRecord(row({ outcome: 'quiet' }), {
        id: 'T90',
        board: 'b',
      }).testCase.replies.slice(-1),
    ).toEqual([{ text: '', calls: [] }])
    expect(
      replayFromTurnRecord(row({ outcome: 'empty' }), { id: 'T90', board: 'b' })
        .testCase.replies,
    ).toHaveLength(4)
  })

  it('出错 / 等确认：照记录写怎么收的；没收尾的（relay）记一条缺口', () => {
    expect(
      replayFromTurnRecord(
        row({ outcome: 'error', errorCode: 'PROVIDER_TIMEOUT' }),
        { id: 'T90', board: 'b' },
      ).testCase.expect,
    ).toMatchObject({ end: 'error', errorCode: 'PROVIDER_TIMEOUT' })
    expect(
      replayFromTurnRecord(row({ outcome: 'awaiting_confirm' }), {
        id: 'T90',
        board: 'b',
      }).testCase.expect.end,
    ).toBe('awaiting_confirm')
    const relay = replayFromTurnRecord(row({ outcome: 'relay' }), {
      id: 'T90',
      board: 'b',
    })
    expect(relay.gaps.join('\n')).toContain('never finished (relay)')
  })

  it('input 里记着上一轮找到的东西（#n）：原样带进题目的 turn.priorFinds（地址不换），不记缺口', () => {
    const [opening, ...rest] = row().transcript
    const { testCase, gaps } = replayFromTurnRecord(
      row({
        input: { ...row().input, priorFinds: FINDS },
        transcript: [{ ...opening, finds: FINDS }, ...rest],
      }),
      { id: 'T90', board: 'b' },
    )
    expect(testCase.turn.priorFinds).toEqual(FINDS)
    expect(gaps.join('\n')).not.toContain('web find')
    expect(
      replayFromTurnRecord(row(), { id: 'T90', board: 'b' }).testCase.turn,
    ).not.toHaveProperty('priorFinds')
  })

  it('板子上冻着、input 里没有（截掉了 / 没存）：记一条缺口，⛔ 不从板子上悄悄补', () => {
    const [opening, ...rest] = row().transcript
    const frozen = [{ ...opening, finds: FINDS }, ...rest]
    const cut = replayFromTurnRecord(
      row({ transcript: frozen, truncated: ['prior_finds'] }),
      { id: 'T90', board: 'b' },
    )
    expect(cut.testCase.turn).not.toHaveProperty('priorFinds')
    expect(cut.gaps.join('\n')).toContain(
      'the board carried 2 web find(s) from the previous turn (#3–#4) but the record input has none (cut to fit)',
    )
    expect(
      replayFromTurnRecord(row({ transcript: frozen }), {
        id: 'T90',
        board: 'b',
      }).gaps.join('\n'),
    ).toContain('(not stored)')
  })

  it('摘掉的 data: 地址：换成假主机上的占位地址，记一条缺口', () => {
    const stripped = stripTurnRecordDataUrls({
      ...row().snapshot,
      references: {
        items: row().snapshot.references.items.map((item, index) =>
          index === 0 ? { ...item, url: 'data:image/png;base64,AAAA' } : item,
        ),
        limit: 16,
      },
    })
    expect(stripped.references.items[0]!.url).toBe(
      TURN_RECORD_DATA_URL_PLACEHOLDER,
    )
    const { board, gaps } = replayFromTurnRecord(row({ snapshot: stripped }), {
      id: 'T90',
      board: 'b',
    })
    const first = row().snapshot.references.items[0]!
    const card = board.state.nodes.find(
      (node) => node.data.name === first.name,
    )!
    expect(card.data.kind === NODE_MEDIA_KIND_IDS.image && card.data.url).toBe(
      `https://cdn.replay.test/turn-record/${card.id}.png`,
    )
    expect(gaps.join('\n')).toContain(
      `card ${first.name}: the record has no address`,
    )
  })

  it('地址换到假主机上（路径不变：按扩展名现做字节）', () => {
    const { board } = replayFromTurnRecord(row(), {
      id: 'T90',
      board: 'b',
      assetHost: 'assets.elsewhere.test',
    })
    expect(imageUrls(board.state)).toEqual(
      imageUrls(BOARD.state).map((url) =>
        url.replace('cdn.replay.test', 'assets.elsewhere.test'),
      ),
    )
  })

  it('做不成回放题的：不是画布、没有开轮快照、不是助手那五家 → 抛错', () => {
    expect(() =>
      replayFromTurnRecord(
        row({ snapshot: null, truncated: ['no_opening_snapshot'] }),
        {
          id: 'T90',
          board: 'b',
        },
      ),
    ).toThrow('no opening snapshot (no_opening_snapshot)')
    expect(() =>
      replayFromTurnRecord(
        row({ snapshot: { prompt: '', availableModels: [] } }),
        { id: 'T90', board: 'b' },
      ),
    ).toThrow('no canvas')
    expect(() =>
      replayFromTurnRecord(row({ adapterType: 'fal' }), {
        id: 'T90',
        board: 'b',
      }),
    ).toThrow('not one of the assistant providers')
  })
})
