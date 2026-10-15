// @vitest-environment node
/**
 * 判分器自己的反例：硬约束要真的会红，回放才不是「假绿」。
 */
import { describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

import { ReplayCaseSchema } from './fixture'
import type { RecordedModelCall, ReplayNetwork } from './fake-network'
import { diffBoards, gradeReplay } from './graders'
import type { ReplayRun } from './runner'

const BOARD: NodeWorkflowStateV4 = {
  version: 4,
  nodes: [
    {
      id: 'imagea',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        subtype: 'character',
        name: 'A',
        createdAt: '2026-10-01',
        status: 'idle',
      },
    },
    {
      id: 'imageb',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        subtype: 'shot',
        name: 'B',
        createdAt: '2026-10-01',
        status: 'idle',
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'imagea',
      sourceHandle: 'out',
      target: 'imageb',
      slot: 'reference',
    },
  ],
}

const testCase = ReplayCaseSchema.parse({
  id: 'X01',
  title: 'grader self-check',
  source: 'graders.test.ts',
  board: 'none',
  routes: [
    {
      routeModel: 'gemini-3.8-flash',
      keys: ['gemini', 'openai'],
      expect: { adapterType: 'gemini', modelId: 'gemini-3.8-flash' },
    },
  ],
  turn: { say: '只答' },
  replies: [{ text: '答。' }],
  expect: { end: 'done', answer: { contains: ['答'] } },
})

function call(
  adapterType: AI_ADAPTER_TYPES.GEMINI | AI_ADAPTER_TYPES.OPENAI,
  modelId: string,
) {
  return {
    adapterType,
    protocol: adapterType === AI_ADAPTER_TYPES.GEMINI ? 'gemini' : 'chat',
    purpose: 'step',
    modelId,
    apiKey: `plain:enc_${adapterType}`,
    stream: true,
    images: 0,
    videos: 0,
    body: {},
    host: 'example',
    path: '/',
  } satisfies RecordedModelCall
}

function network(calls: RecordedModelCall[], remaining = 0): ReplayNetwork {
  return {
    fetch: vi.fn(),
    modelCalls: calls,
    assetFetches: [],
    unexpected: [],
    remainingReplies: () => remaining,
  }
}

function run(final: NodeWorkflowStateV4 = BOARD): ReplayRun {
  return {
    initial: BOARD,
    final,
    requests: [{} as ReplayRun['requests'][number]],
    events: [
      [{ type: 'open' }, { type: 'message', text: '答。' }, { type: 'done' }],
    ],
    landedOps: [],
    steps: [],
    httpError: null,
  }
}

function grade(input: { run: ReplayRun; network: ReplayNetwork }) {
  gradeReplay({
    testCase,
    route: testCase.routes[0]!,
    run: input.run,
    network: input.network,
    writes: [],
    keyLookups: vi.fn(),
  })
}

describe('replay graders', () => {
  it('passes a clean turn', () => {
    expect(() =>
      grade({
        run: run(),
        network: network([call(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash')]),
      }),
    ).not.toThrow()
  })

  it('fails when one call in the turn went to another provider', () => {
    expect(() =>
      grade({
        run: run(),
        network: network([call(AI_ADAPTER_TYPES.OPENAI, 'gemini-3.8-flash')]),
      }),
    ).toThrow(/selected provider/)
  })

  it('fails when the selected provider ran another model', () => {
    expect(() =>
      grade({
        run: run(),
        network: network([call(AI_ADAPTER_TYPES.GEMINI, 'gemini-2-pro')]),
      }),
    ).toThrow(/selected model/)
  })

  it('fails when a scripted reply was never used', () => {
    expect(() =>
      grade({
        run: run(),
        network: network(
          [call(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash')],
          1,
        ),
      }),
    ).toThrow(/scripted replies left unused/)
  })

  it('fails on a board change the case did not list (「其他不动」)', () => {
    const changed: NodeWorkflowStateV4 = { ...BOARD, edges: [] }
    expect(() =>
      grade({
        run: run(changed),
        network: network([call(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash')]),
      }),
    ).toThrow(/disconnected/)
  })

  it('fails when a step sends the model text stepPrompts rules out (R02 的查证短版)', () => {
    const slim = ReplayCaseSchema.parse({
      ...testCase,
      expect: {
        ...testCase.expect,
        stepPrompts: [{ notContains: ['FULL-EXCERPT'] }],
      },
    })
    const sent = {
      ...call(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash'),
      body: { contents: [{ parts: [{ text: 'FULL-EXCERPT again' }] }] },
    }
    const gradeSlim = (calls: RecordedModelCall[]) =>
      gradeReplay({
        testCase: slim,
        route: slim.routes[0]!,
        run: run(),
        network: network(calls),
        writes: [],
        keyLookups: vi.fn(),
      })
    expect(() => gradeSlim([sent])).toThrow(/request body of step 1/)
    expect(() =>
      gradeSlim([call(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash')]),
    ).not.toThrow()
  })

  it('diffs boards by card names, ignoring slot bookkeeping', () => {
    const renamed: NodeWorkflowStateV4 = {
      ...BOARD,
      nodes: BOARD.nodes.map((node) =>
        node.id === 'imageb'
          ? { ...node, data: { ...node.data, name: 'B2', slots: {} } }
          : node,
      ),
    }
    expect(diffBoards(BOARD, renamed)).toEqual({
      edgesAdded: [],
      edgesRemoved: [],
      nodesAdded: [],
      nodesRemoved: [],
      nodesChanged: { B: { name: 'B2' } },
    })
  })
})
