import { describe, expect, it } from 'vitest'

import { ASSISTANT_TURN_RECORD_LIMITS } from '@/constants/assistant-turn-record'
import {
  AssistantTurnRecordInputSchema,
  AssistantTurnRecordSchema,
} from '@/types/assistant-turn-record'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import type { AssistantWebImageFind } from '@/types/assistant-web-finds'

import {
  fitAssistantTurnRecord,
  stripTurnRecordDataUrls,
  TURN_RECORD_DATA_URL_PLACEHOLDER,
  turnRecordInput,
  turnRecordJsonBytes,
  turnRecordSnapshot,
} from './assistant-turn-record'

const PNG = `data:image/png;base64,${'A'.repeat(4_000)}`
const WEBP = `data:image/webp;base64,${'B'.repeat(4_000)}`

function request(
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    workspaceKey: 'canvas:project-1',
    domain: 'canvas',
    messages: [
      { role: 'user', content: '先看看' },
      { role: 'assistant', content: '好。' },
      { role: 'user', content: 'S04b 去掉高尔' },
    ],
    snapshot: {
      prompt: '',
      availableModels: [],
      references: {
        items: [{ url: PNG }, { url: 'https://cdn.test/harry.png' }],
        limit: 16,
      },
    },
    ...overrides,
  } as AssistantOperatorRequest
}

function transcript(boardChars = 10, resultChars = 10): AssistantV3Transcript {
  return [
    { type: 'board', text: 'B'.repeat(boardChars), images: [] },
    {
      type: 'assistant',
      text: '先断开。',
      calls: [
        {
          id: 'call_1',
          tool: 'edit',
          input: '{"ops":[]}',
          signature: 'S'.repeat(2_000),
          knownIds: ['node-1'],
        },
      ],
    },
    {
      type: 'result',
      id: 'call_1',
      tool: 'edit',
      output: 'R'.repeat(resultChars),
      error: false,
    },
    { type: 'assistant', text: '好了。', calls: [] },
  ]
}

function imageFind(n: number, urlChars = 0): AssistantWebImageFind {
  return {
    kind: 'image',
    n,
    imageUrl: `https://img.test/${n}${'x'.repeat(urlChars)}.jpg`,
    pageUrl: `https://www.pixiv.net/artworks/${n}`,
    domain: 'pixiv.net',
    title: `立绘 ${n}`,
  }
}

/** 开轮板子上冻着上一轮找到的那几条的本轮记录。 */
function transcriptWithFinds(
  finds: readonly AssistantWebImageFind[],
): AssistantV3Transcript {
  const [board, ...rest] = transcript()
  return [
    { ...board!, finds: [...finds] } as AssistantV3Transcript[number],
    ...rest,
  ]
}

describe('stripTurnRecordDataUrls', () => {
  it('data: 地址换成占位（还是合法 URL），别的原样，undefined 的键丢掉', () => {
    const stripped = stripTurnRecordDataUrls({
      a: PNG,
      b: ['https://cdn.test/a.png', 'DATA:image/png;base64,xx'],
      c: { d: 1, e: undefined, f: null },
    })
    expect(stripped).toEqual({
      a: TURN_RECORD_DATA_URL_PLACEHOLDER,
      b: ['https://cdn.test/a.png', TURN_RECORD_DATA_URL_PLACEHOLDER],
      c: { d: 1, f: null },
    })
    expect('e' in stripped.c).toBe(false)
    expect(() => new URL(TURN_RECORD_DATA_URL_PLACEHOLDER)).not.toThrow()
  })

  it('快照：剪贴板图的字节一个不剩', () => {
    const snapshot = turnRecordSnapshot(request().snapshot)
    expect(JSON.stringify(snapshot)).not.toContain('base64')
    expect(snapshot.references?.items[1]?.url).toBe(
      'https://cdn.test/harry.png',
    )
  })
})

describe('turnRecordInput', () => {
  it('对话只到创作者最后那一句；最多留 maxMessages 条', () => {
    const messages = Array.from({ length: 120 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `m${index}`,
    }))
    const input = turnRecordInput(request({ messages }), transcript())
    expect(input.messages).toHaveLength(
      ASSISTANT_TURN_RECORD_LIMITS.maxMessages,
    )
    expect(input.messages.at(-1)).toEqual({ role: 'user', content: 'm118' })
  })

  it('板子上记着窗口（P2 第三片）：只存模型看见的那几轮 + 这一句，原样带着 answered', () => {
    const messages: AssistantOperatorRequest['messages'] = [
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a0' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: '' },
      {
        role: 'user',
        content: 'answer',
        answered: { questionId: 'question-1', optionIds: ['option-1-1'] },
      },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'now' },
    ]
    const [board, ...rest] = transcript()
    const windowed = (turns: number) =>
      turnRecordInput(request({ messages }), [
        { ...board!, history: { turns } } as AssistantV3Transcript[number],
        ...rest,
      ]).messages.map((message) => message.content)
    expect(windowed(2)).toEqual(['u1', '', 'answer', 'a2', 'now'])
    expect(windowed(1)).toEqual(['answer', 'a2', 'now'])
    expect(windowed(0)).toEqual(['now'])
    expect(windowed(3)).toHaveLength(messages.length)
    expect(
      turnRecordInput(request({ messages }), [
        { ...board!, history: { turns: 1 } } as AssistantV3Transcript[number],
        ...rest,
      ]).messages[0],
    ).toEqual({
      role: 'user',
      content: 'answer',
      answered: { questionId: 'question-1', optionIds: ['option-1-1'] },
    })
  })

  it('只挑回放要用的那几样；片子只记地址与帧数，⛔ 帧不存', () => {
    const input = turnRecordInput(
      request({
        incognito: false,
        responseLanguage: 'chinese',
        stepBudget: 12,
        planApproved: true,
        videoClips: [
          {
            sourceUrl: 'https://cdn.test/s04b.mp4',
            label: 'S04b 冲出门',
            nodeId: 'video-1',
            durationSeconds: 5,
            frames: [
              { index: 0, timestampSeconds: 0, dataUrl: WEBP },
              { index: 1, timestampSeconds: 2.5, dataUrl: WEBP },
            ],
          },
        ],
        mediaAttachments: [
          { kind: 'video', url: 'https://cdn.test/a.mp4', label: 'a' },
        ],
      } as Partial<AssistantOperatorRequest>),
      transcript(),
    )
    expect(input).toEqual({
      messages: request().messages,
      responseLanguage: 'chinese',
      stepBudget: 12,
      planApproved: true,
      mediaAttachments: [
        { kind: 'video', url: 'https://cdn.test/a.mp4', label: 'a' },
      ],
      videoClips: [
        {
          sourceUrl: 'https://cdn.test/s04b.mp4',
          label: 'S04b 冲出门',
          nodeId: 'video-1',
          durationSeconds: 5,
          frameCount: 2,
        },
      ],
    })
    expect(JSON.stringify(input)).not.toContain('base64')
    expect(AssistantTurnRecordInputSchema.safeParse(input).success).toBe(true)
  })

  it('上一轮找到的东西（#n）：记开轮板子上冻着的那一份 —— 接力那几跳的请求不带它也照记；按号去重、最多 maxCarried 条', () => {
    const finds = Array.from({ length: 18 }, (_, index) => imageFind(index + 1))
    // 接力那一跳：请求里没有 priorFinds，板子上冻着（这里故意多给、带一条重号，看同一刀）。
    const input = turnRecordInput(
      request(),
      transcriptWithFinds([...finds, { ...finds[17]!, title: '后到的' }]),
    )
    expect(input.priorFinds?.map((find) => find.n)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 3),
    )
    expect(input.priorFinds?.at(-1)).toMatchObject({ n: 18, title: '后到的' })
    expect(AssistantTurnRecordInputSchema.safeParse(input).success).toBe(true)
  })

  it('上一轮找到的东西只认板子：请求里带了、板子上没冻（服务端没用上）→ 不记', () => {
    const input = turnRecordInput(
      request({ priorFinds: [imageFind(1)] }),
      transcript(),
    )
    expect(input).not.toHaveProperty('priorFinds')
  })
})

describe('fitAssistantTurnRecord', () => {
  const input = turnRecordInput(request(), transcript())

  it('放得下：一刀不截，字节是三段之和', () => {
    const fitted = fitAssistantTurnRecord({
      input,
      transcript: transcript(),
      snapshotBytes: 100,
    })!
    expect(fitted.cuts).toEqual([])
    expect(fitted.keepSnapshot).toBe(true)
    expect(fitted.sizeBytes).toBe(
      turnRecordJsonBytes(input) + turnRecordJsonBytes(transcript()) + 100,
    )
  })

  it('先截签名：够了就停在这一刀', () => {
    const full = transcript()
    const max =
      turnRecordJsonBytes(input) + turnRecordJsonBytes(full) + 100 - 1_000
    const fitted = fitAssistantTurnRecord(
      { input, transcript: full, snapshotBytes: 100 },
      max,
    )!
    expect(fitted.cuts).toEqual(['signatures'])
    expect(fitted.keepSnapshot).toBe(true)
    expect(fitted.sizeBytes).toBeLessThanOrEqual(max)
    expect(fitted.transcript[1]).toEqual({
      type: 'assistant',
      text: '先断开。',
      calls: [{ id: 'call_1', tool: 'edit', input: '{"ops":[]}' }],
    })
  })

  it('本轮记录截完还放不下，才丢快照；快照之前的几刀按顺序记下', () => {
    const big = transcript(20_000, 20_000)
    const fitted = fitAssistantTurnRecord(
      { input, transcript: big, snapshotBytes: 60_000 },
      40_000,
    )!
    expect(fitted.cuts).toEqual([
      'signatures',
      'board_text',
      'result_outputs',
      'history',
      'assistant_text',
      'snapshot',
    ])
    expect(fitted.keepSnapshot).toBe(false)
    expect(fitted.input.messages).toEqual([
      { role: 'user', content: 'S04b 去掉高尔' },
    ])
    const board = fitted.transcript[0]!
    expect(board.type === 'board' && board.text.length).toBe(
      ASSISTANT_TURN_RECORD_LIMITS.cutBoardChars + 1,
    )
  })

  it('没有快照可丢（后几跳 / 第一跳没存）：跳过那一刀，直接只留模型的回复', () => {
    const fitted = fitAssistantTurnRecord(
      {
        input,
        transcript: transcript(20_000, 20_000).concat(
          Array.from({ length: 30 }, (_, index) => ({
            type: 'result' as const,
            id: `call_${index}`,
            tool: 'edit' as const,
            output: 'R'.repeat(1_900),
            error: false,
          })),
        ),
        snapshotBytes: 0,
      },
      20_000,
    )!
    expect(fitted.cuts).not.toContain('snapshot')
    expect(fitted.cuts.at(-1)).toBe('transcript')
    expect(fitted.transcript.map((entry) => entry.type)).toEqual([
      'board',
      'assistant',
      'assistant',
    ])
  })

  it('上一轮找到的东西：对话历史与模型正文都截了还放不下才截它（快照之前）', () => {
    // 地址故意拉长：十六条压过整行，截完前面几刀还放不下。
    const withFinds = turnRecordInput(
      request(),
      transcriptWithFinds(
        Array.from({ length: 16 }, (_, index) => imageFind(index + 1, 3_000)),
      ),
    )
    expect(withFinds.priorFinds).toHaveLength(16)
    const fitted = fitAssistantTurnRecord(
      { input: withFinds, transcript: transcript(), snapshotBytes: 1_000 },
      20_000,
    )!
    // 对话历史那一刀不碰它（不然这一刀没东西可截、不会记下）。
    expect(fitted.cuts).toEqual([
      'signatures',
      'board_text',
      'result_outputs',
      'history',
      'assistant_text',
      'prior_finds',
    ])
    expect(fitted.keepSnapshot).toBe(true)
    expect(fitted.input).not.toHaveProperty('priorFinds')
    expect(fitted.input.messages).toEqual([
      { role: 'user', content: 'S04b 去掉高尔' },
    ])
  })

  it('截到最后还放不下 → null（这一跳不写）', () => {
    expect(
      fitAssistantTurnRecord(
        { input, transcript: transcript(), snapshotBytes: 0 },
        10,
      ),
    ).toBeNull()
  })

  it('截过的那一份照样过记录的 schema（读回来做得成回放题）', () => {
    const fitted = fitAssistantTurnRecord(
      { input, transcript: transcript(20_000, 20_000), snapshotBytes: 0 },
      20_000,
    )!
    expect(
      AssistantTurnRecordSchema.safeParse({
        turnId: '33b9bd2e-b43d-4cc9-872d-bb5d57f8d420',
        hops: 1,
        outcome: 'done',
        errorCode: null,
        workspaceKey: 'canvas:project-1',
        domain: 'canvas',
        projectId: 'project-1',
        conversationId: null,
        adapterType: 'openai',
        modelId: 'gpt-6-luna',
        routeModel: 'auto',
        apiKeyId: null,
        systemPromptHash: 'f'.repeat(64),
        promptVersion: '2026-10-15',
        input: fitted.input,
        snapshot: null,
        transcript: fitted.transcript,
        sizeBytes: fitted.sizeBytes,
        truncated: fitted.cuts,
      }).success,
    ).toBe(true)
  })
})
