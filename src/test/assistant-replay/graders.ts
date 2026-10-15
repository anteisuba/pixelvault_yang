/**
 * 回放的判分：每道题都过同一组，题目只写它在乎的那几格。
 *
 * (a) 画布：落了哪几种 op、起始 → 收尾画布的**完整**差异（没列的变了就算多改：「其他不动」）
 * (b) 卡：问题卡 / 生成确认卡出没出、出了几张、列的是谁（缺席 = 不许出）
 * (c) 回复：包含 / 不包含
 * (d) 硬约束：这一轮每一次碰模型都是选定的那一家、那个型号、那把 key（`expectSelectedProviderOnly`）
 * 另有几条每题都查的底线：录好的主步回复一条不剩也不缺、没有意外的网络、没写库、帧都过了客户端 schema。
 */
import { expect } from 'vitest'

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_STOP_REASONS,
} from '@/constants/assistant-operator'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  type ProviderUse,
} from '@/test/selected-provider-only'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

import type { ReplayBoardDiff, ReplayCase, ReplayRoute } from './fixture'
import type { ReplayNetwork } from './fake-network'
import type { ReplayDbWrite } from './fake-db'
import type { ReplayRun } from './runner'

/** 卡上这几格的变化不单独算：连线 / 断线顺带改的槽位绑定（线本身另算）。坐标不在 data 里，不比。 */
const IGNORED_DATA_KEYS = new Set(['slots'])

function namesOf(state: NodeWorkflowStateV4) {
  return new Map(state.nodes.map((node) => [node.id, node.data.name]))
}

function edgeTexts(state: NodeWorkflowStateV4): string[] {
  const names = namesOf(state)
  return state.edges.map(
    (edge) =>
      `${names.get(edge.source) ?? edge.source} -> ${names.get(edge.target) ?? edge.target} / ${edge.slot}`,
  )
}

/** 多重集合差：`a` 里有、`b` 里没有的（同一条线两份算两条）。 */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const rest = [...b]
  return a.filter((item) => {
    const index = rest.indexOf(item)
    if (index < 0) return true
    rest.splice(index, 1)
    return false
  })
}

export function diffBoards(
  initial: NodeWorkflowStateV4,
  final: NodeWorkflowStateV4,
): ReplayBoardDiff {
  const before = new Map(initial.nodes.map((node) => [node.id, node]))
  const after = new Map(final.nodes.map((node) => [node.id, node]))
  // ⚠ 线按两端的**起始**名字写：改名的卡与它的线分开记。
  const startNames = namesOf(initial)
  const finalWithStartNames: NodeWorkflowStateV4 = {
    ...final,
    nodes: final.nodes.map((node) => ({
      ...node,
      data: { ...node.data, name: startNames.get(node.id) ?? node.data.name },
    })) as NodeWorkflowStateV4['nodes'],
  }
  const edgesBefore = edgeTexts(initial)
  const edgesAfter = edgeTexts(finalWithStartNames)
  const nodesChanged: Record<string, Record<string, unknown>> = {}
  for (const [id, node] of before) {
    const next = after.get(id)
    if (!next) continue
    const was = node.data as Record<string, unknown>
    const now = next.data as Record<string, unknown>
    const changed: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if (IGNORED_DATA_KEYS.has(key)) continue
      if (JSON.stringify(was[key]) !== JSON.stringify(now[key]))
        changed[key] = now[key]
    }
    if (Object.keys(changed).length) nodesChanged[node.data.name] = changed
  }
  return {
    edgesAdded: minus(edgesAfter, edgesBefore),
    edgesRemoved: minus(edgesBefore, edgesAfter),
    nodesAdded: final.nodes
      .filter((node) => !before.has(node.id))
      .map((node) => ({
        name: node.data.name,
        data: node.data as Record<string, unknown>,
      })),
    nodesRemoved: initial.nodes
      .filter((node) => !after.has(node.id))
      .map((node) => node.data.name),
    nodesChanged,
  }
}

/** `{ "$contains": "…" }` 只比一段，其余逐值相等。 */
function expectValue(actual: unknown, expected: unknown, label: string) {
  if (
    typeof expected === 'object' &&
    expected !== null &&
    '$contains' in expected
  ) {
    expect(typeof actual, label).toBe('string')
    expect(actual as string, label).toContain(
      (expected as { $contains: string }).$contains,
    )
    return
  }
  if (typeof expected === 'object' && expected !== null)
    expect(actual, label).toMatchObject(expected)
  else expect(actual, label).toEqual(expected)
}

function expectBoard(actual: ReplayBoardDiff, expected: ReplayBoardDiff) {
  expect(
    [...actual.edgesAdded].sort(),
    'edges the turn connected (anything not listed = an extra change)',
  ).toEqual([...expected.edgesAdded].sort())
  expect(
    [...actual.edgesRemoved].sort(),
    'edges the turn disconnected (anything not listed = an extra change)',
  ).toEqual([...expected.edgesRemoved].sort())
  expect([...actual.nodesRemoved].sort(), 'cards deleted').toEqual(
    [...expected.nodesRemoved].sort(),
  )
  expect(
    actual.nodesAdded.map((node) => node.name),
    'cards added',
  ).toEqual(expected.nodesAdded.map((node) => node.name))
  expected.nodesAdded.forEach((node, index) =>
    expectValue(
      actual.nodesAdded[index]?.data,
      node.data,
      `new card ${node.name}`,
    ),
  )
  expect(
    Object.fromEntries(
      Object.entries(actual.nodesChanged).map(([name, fields]) => [
        name,
        Object.keys(fields).sort(),
      ]),
    ),
    'which fields of which cards changed (anything not listed = an extra change)',
  ).toEqual(
    Object.fromEntries(
      Object.entries(expected.nodesChanged).map(([name, fields]) => [
        name,
        Object.keys(fields).sort(),
      ]),
    ),
  )
  for (const [name, fields] of Object.entries(expected.nodesChanged))
    for (const [key, value] of Object.entries(fields))
      expectValue(actual.nodesChanged[name]?.[key], value, `${name}.${key}`)
}

function ofType<T extends AssistantOperatorEvent['type']>(
  events: readonly AssistantOperatorEvent[],
  type: T,
): Extract<AssistantOperatorEvent, { type: T }>[] {
  return events.filter(
    (event): event is Extract<AssistantOperatorEvent, { type: T }> =>
      event.type === type,
  )
}

/** 这一轮怎么收的（最后一次请求的最后一帧）。 */
function endOf(events: readonly AssistantOperatorEvent[]): string {
  const last = events.at(-1)
  if (!last) return '(no events)'
  if (last.type === ASSISTANT_OPERATOR_EVENTS.stopped) return last.reason
  return last.type
}

/** 模型调用 → `expectSelectedProviderOnly` 认的那一条（哪一跳、哪一家、哪把 key）。 */
function modelUses(network: ReplayNetwork): ProviderUse[] {
  return network.modelCalls.map((call) => ({
    via: `${call.purpose} ${call.host}${call.path}`,
    adapterType: call.adapterType,
    ...(call.apiKey ? { apiKey: call.apiKey } : {}),
  }))
}

/**
 * `REPLAY_DEBUG=1 npm run test:replay`：把这一轮摊开印出来（写新题、查红题时看）——
 * 每次碰模型、每一帧、落了什么、画布差异。
 */
export function printReplay(
  name: string,
  run: ReplayRun,
  network: ReplayNetwork,
): void {
  const lines = [
    `── ${name}`,
    ...network.modelCalls.map(
      (call, index) =>
        `  model#${index + 1} ${call.purpose} ${call.adapterType}/${call.modelId} ${call.protocol}${call.stream ? ' stream' : ''} images=${call.images} videos=${call.videos}`,
    ),
    ...network.assetFetches.map((url) => `  asset ${url}`),
    ...run.events.flatMap((hop, index) => [
      `  request#${index + 1}`,
      ...hop.map((event) => `    ${JSON.stringify(event).slice(0, 400)}`),
    ]),
    `  landed ${JSON.stringify(run.landedOps)}`,
    `  board ${JSON.stringify(diffBoards(run.initial, run.final), (key, value: unknown) => (key === 'data' ? '…' : value))}`,
    ...(network.unexpected.length
      ? [`  UNEXPECTED ${network.unexpected.join(' | ')}`]
      : []),
  ]
  process.stderr.write(`${lines.join('\n')}\n`)
}

/** 钱闸：一轮助手不许碰的那几张表（建 generation / job、记账、排执行）。 */
const MONEY_TABLES = new Set([
  'generation',
  'generationJob',
  'apiUsageLedger',
  'executionOutbox',
])

export function gradeReplay(input: {
  readonly testCase: ReplayCase
  readonly route: ReplayRoute
  readonly run: ReplayRun
  readonly network: ReplayNetwork
  readonly writes: readonly ReplayDbWrite[]
  readonly keyLookups: Parameters<typeof keyLookupUsesOf>[0]
}): void {
  const { testCase, route, run, network, writes } = input
  const wanted = testCase.expect
  const all = run.events.flat()

  // ── 底线 ──
  expect(run.httpError, 'the route answered with a stream').toBeNull()
  expect(network.unexpected, 'network calls nobody scripted').toEqual([])
  expect(
    writes.filter((write) => MONEY_TABLES.has(write.model)),
    'money gate: an assistant turn creates no generation, job or ledger row',
  ).toEqual([])
  expect(writes, 'database writes during the turn').toEqual([])
  expect(
    ofType(all, ASSISTANT_OPERATOR_EVENTS.error).filter(
      (event) => event.errorCode === 'STREAM_INTERRUPTED',
    ),
    'every frame passed the client schema',
  ).toEqual([])
  expect(run.requests.length, 'requests the client sent (canvas relays)').toBe(
    wanted.requests,
  )

  // ── 收尾 ──
  const lastHop = run.events.at(-1) ?? []
  expect(endOf(lastHop), 'how the turn ended').toBe(wanted.end)
  for (const hop of run.events.slice(0, -1))
    expect(endOf(hop), 'every earlier request ended in a canvas relay').toBe(
      ASSISTANT_OPERATOR_STOP_REASONS.canvasSync,
    )
  if (wanted.end === 'error') {
    const error = ofType(lastHop, ASSISTANT_OPERATOR_EVENTS.error).at(-1)
    expect(error?.errorCode, 'error code').toBe(wanted.errorCode)
    if (wanted.missingKey)
      expect(error?.missingKey, 'which key the panel asks for').toEqual(
        wanted.missingKey,
      )
  }

  // ── (a) 画布 ──
  expect(
    run.landedOps.map((op) => op.op),
    'ops that landed on the board, in order',
  ).toEqual(wanted.opKinds)
  expectBoard(diffBoards(run.initial, run.final), wanted.board)

  // ── (b) 卡 ──
  const asks = ofType(all, ASSISTANT_OPERATOR_EVENTS.ask)
  if (wanted.ask === null) expect(asks, 'no question card').toEqual([])
  else {
    expect(asks, 'one question card').toHaveLength(1)
    const questions = asks[0]!.questions
    expect(questions, 'questions on the card').toHaveLength(
      wanted.ask.questions,
    )
    const cardText = JSON.stringify(questions)
    for (const piece of wanted.ask.contains)
      expect(cardText, 'question card text').toContain(piece)
  }
  const confirms = ofType(all, ASSISTANT_OPERATOR_EVENTS.confirm)
  if (wanted.confirm === null) expect(confirms, 'no confirm card').toEqual([])
  else {
    expect(confirms, 'one confirm card').toHaveLength(1)
    const confirm = confirms[0]!.confirm
    expect(confirm.kind, 'confirm card kind').toBe(wanted.confirm.kind)
    const request = 'request' in confirm ? confirm.request : null
    const cards =
      request && 'canvasNodes' in request && request.canvasNodes
        ? request.canvasNodes.map((node) => node.name)
        : request && 'canvasNode' in request && request.canvasNode
          ? [request.canvasNode.name]
          : []
    expect(cards, 'cards on the confirm card').toEqual(wanted.confirm.cards)
  }

  // ── (c) 回复 ──
  const answer = ofType(all, ASSISTANT_OPERATOR_EVENTS.message)
    .map((event) => event.text)
    .join('\n')
  for (const piece of wanted.answer.contains)
    expect(answer, 'final answer').toContain(piece)
  for (const piece of wanted.answer.notContains)
    expect(answer, 'final answer').not.toContain(piece)

  // ── (d) 只用所选那一家 ──
  const steps = network.modelCalls.filter((call) => call.purpose === 'step')
  expect(steps.length, 'model steps the turn took').toBe(
    testCase.replies.length,
  )
  expect(network.remainingReplies(), 'scripted replies left unused').toBe(0)
  expect(
    network.modelCalls.filter((call) => call.purpose === 'search').length,
    'web searches',
  ).toBe(wanted.searches)
  if (route.expect === null) {
    expect(network.modelCalls, 'no model was called').toEqual([])
  } else {
    const selected = route.expect
    const apiKey = `plain:enc_${selected.adapterType}`
    expectSelectedProviderOnly(
      [...modelUses(network), ...keyLookupUsesOf(input.keyLookups)],
      { adapterType: selected.adapterType, apiKey },
    )
    expect(
      network.modelCalls.map((call) => `${call.adapterType}/${call.modelId}`),
      'every model call used the selected model',
    ).toEqual(
      network.modelCalls.map(
        () => `${selected.adapterType}/${selected.modelId}`,
      ),
    )
    expect(
      network.modelCalls.every((call) => call.apiKey === apiKey),
      'every model call carried the selected key',
    ).toBe(true)
  }
  if (wanted.stepImages)
    expect(
      steps.map((call) => call.images),
      'pictures in front of the model, per step',
    ).toEqual(wanted.stepImages)
  if (wanted.stepVideos)
    expect(
      steps.map((call) => call.videos),
      'clips (video body) in front of the model, per step',
    ).toEqual(wanted.stepVideos)
}
