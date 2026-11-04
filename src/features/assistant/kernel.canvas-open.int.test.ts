/**
 * 新内核：画布（第 9a 步，一批交给浏览器落、停在 canvas_sync）与开台（第 9e 步，停在 bench_open）。
 * 真库（L2a）：真开轮、真执行器；只假模型那一头（`fake-model.ts`）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@ai-sdk/anthropic', async (importOriginal) =>
  (await import('@/test/assistant-bench/fake-model')).fakeAnthropic(
    await importOriginal(),
  ),
)
vi.mock('@ai-sdk/openai', async (importOriginal) =>
  (await import('@/test/assistant-bench/fake-model')).fakeOpenAI(
    await importOriginal(),
  ),
)

import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import { db } from '@/lib/db'
import {
  fakeModels,
  promptOf,
  resetFakeModels,
  scriptedModel,
  textTurn,
  toolTurn,
} from '@/test/assistant-bench/fake-model'
import {
  collect,
  imageRequest,
  kernelUser,
  relayOf,
  payloadOf,
  stepsOf,
  type KernelUser,
} from '@/test/assistant-bench/kernel-harness'
import { resetDatabase } from '@/test/int/db'

import { runAssistantNext } from './kernel'

let user: KernelUser

beforeEach(async () => {
  await resetDatabase()
  resetFakeModels()
  user = await kernelUser()
})

const run = (request: AssistantOperatorRequest) =>
  collect(runAssistantNext(user.clerkId, request))

const rolesOf = (call: number) =>
  fakeModels.main.doStreamCalls[call]!.prompt.map((message) => message.role)

describe('画布（第 9a 步）', () => {
  const SHOT = 'video16f1cb3f-4164-4eb7-8d49-a429fa5fff0f'
  const NEW = 'image7bc23597-15e6-4026-9e34-0e2613ee3479'
  const card = (id: string, name: string, kind: 'image' | 'video') => ({
    id,
    name,
    kind,
    subtype: kind === 'video' ? 'shot' : 'character',
    text: '',
  })
  let projectId = ''

  beforeEach(async () => {
    projectId = (
      await db.nodeWorkflowProject.create({
        data: {
          userId: user.id,
          name: '短片',
          state: { nodes: [], edges: [] },
        },
      })
    ).id
  })

  const canvasRequest = (
    nodes: ReturnType<typeof card>[],
    overrides: Partial<AssistantOperatorRequest> = {},
  ) =>
    ({
      workspaceKey: `canvas:${projectId}`,
      domain: 'canvas',
      messages: [{ role: 'user', content: '加一张角色卡连到镜头上' }],
      snapshot: {
        prompt: '',
        availableModels: [],
        canvas: {
          currentShotNo: null,
          selectedNodeIds: [],
          shots: [{ expanded: true, shotNo: 1, title: 'S1', nodes }],
        },
      },
      ...overrides,
    }) as AssistantOperatorRequest

  it('加卡 + 连线合成一批交给浏览器落，停在 canvas_sync；落完那一跳补上新卡的句柄再接着跑', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'e1',
        name: 'edit',
        input: {
          changes: [
            {
              op: 'add_card',
              ref: 'new1',
              type: 'image/character',
              name: '女主',
              text: 'a girl, full body',
            },
            {
              op: 'connect',
              from: 'new1',
              to: 'vid-16f1cb',
              port: 'reference',
            },
          ],
        },
      }),
    ])
    const hop1 = await run(canvasRequest([card(SHOT, '镜头1', 'video')]))
    const batch = stepsOf(hop1).filter(
      (step) => step.tool === 'canvas_batch' && step.status !== 'running',
    )
    expect(batch).toHaveLength(1)
    expect(
      (payloadOf(batch[0]!) as { ops: unknown[] }).ops.length,
    ).toBeGreaterThanOrEqual(2)
    expect(hop1.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'canvas_sync',
    })
    const transcript = relayOf(hop1)
    expect(transcript).toHaveLength(1)

    fakeModels.main = scriptedModel([textTurn('加好了。')])
    const hop2 = await run(
      canvasRequest(
        [card(SHOT, '镜头1', 'video'), card(NEW, '女主', 'image')],
        {
          priorSteps: [
            {
              tool: 'canvas_batch',
              status: 'done',
              summary: '加卡',
              thisTurn: true,
            },
          ],
          v3: { transcript },
        } as Partial<AssistantOperatorRequest>,
      ),
    )
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
    expect(rolesOf(0)).toEqual(['system', 'user', 'assistant', 'tool'])
    const sent = promptOf(fakeModels.main.doStreamCalls[0]!)
    expect(sent).toContain('Landed.')
    expect(sent).toContain('new1 → img-7bc235')
  })

  it('同一步里 edit 之后的 look / generate 不跑（板子还在落）', async () => {
    fakeModels.main = scriptedModel([
      toolTurn(
        {
          id: 'e1',
          name: 'edit',
          input: {
            changes: [{ op: 'set_card', card: 'vid-16f1cb', name: '开场' }],
          },
        },
        { id: 'g1', name: 'generate', input: { cards: ['vid-16f1cb'] } },
      ),
    ])
    const hop1 = await run(canvasRequest([card(SHOT, '镜头1', 'video')]))
    expect(hop1.find((event) => event.type === 'confirm')).toBeUndefined()
    expect(hop1.at(-1)).toMatchObject({ reason: 'canvas_sync' })
  })

  it('画布上没给卡的 generate 回一句要列卡', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({ id: 'g1', name: 'generate', input: {} }),
      textTurn('好。'),
    ])
    await run(canvasRequest([card(SHOT, '镜头1', 'video')]))
    expect(promptOf(fakeModels.main.doStreamCalls[1]!)).toContain(
      'generate on the canvas needs cards',
    )
  })
})

describe('开台（第 9e 步）', () => {
  const openTags = { id: 'o1', name: 'open', input: { bench: 'tags' } }

  it('开到标签台：停在 bench_open 交接力条；到了那一跳，open 的结果是新台的板子，接着跑', async () => {
    fakeModels.main = scriptedModel([toolTurn(openTags)])
    const hop1 = await run(imageRequest('改成 NAI 标签再出一张'))
    expect(hop1.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'bench_open',
      open: { workspace: 'image-tags' },
    })
    const transcript = relayOf(hop1)
    expect(transcript).toHaveLength(1)

    fakeModels.main = scriptedModel([textTurn('到了，接着改。')])
    const hop2 = await run(
      imageRequest('改成 NAI 标签再出一张', {
        workspaceKey: 'image-tags',
        v3: { transcript },
      } as Partial<AssistantOperatorRequest>),
    )
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
    expect(rolesOf(0)).toEqual(['system', 'user', 'assistant', 'tool'])
    const sent = promptOf(fakeModels.main.doStreamCalls[0]!)
    expect(sent).toContain('Opened the tag bench')
    expect(sent).toContain('a girl in a garden')
  })

  it('浏览器没换过去（还在原台）：如实说没开成，⛔ 不当成到了', async () => {
    fakeModels.main = scriptedModel([toolTurn(openTags)])
    const transcript = relayOf(await run(imageRequest('改成 NAI 标签再出一张')))
    fakeModels.main = scriptedModel([textTurn('没开成。')])
    await run(
      imageRequest('改成 NAI 标签再出一张', {
        v3: { transcript },
      } as Partial<AssistantOperatorRequest>),
    )
    expect(promptOf(fakeModels.main.doStreamCalls[0]!)).toContain(
      'the tag bench did not open',
    )
  })

  it('同一步里 open 之后的调用不跑；已经在那个台上就直说，不白跳', async () => {
    fakeModels.main = scriptedModel([
      toolTurn(openTags, {
        id: 'call_1',
        name: 'edit',
        input: {
          changes: [
            {
              op: 'prompt',
              mode: 'edit',
              edits: [{ find: 'girl', replace: 'boy' }],
            },
          ],
        },
      }),
      // 第二跳不会来：第一跳停在 bench_open。
    ])
    const hop1 = await run(imageRequest('换台再改'))
    expect(stepsOf(hop1).some((step) => step.tool === 'set_prompt')).toBe(false)
    expect(hop1.at(-1)).toMatchObject({ reason: 'bench_open' })

    fakeModels.main = scriptedModel([
      toolTurn({ id: 'o2', name: 'open', input: { bench: 'image' } }),
      textTurn('就在这儿。'),
    ])
    const events = await run(imageRequest('打开图片台'))
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(promptOf(fakeModels.main.doStreamCalls[1]!)).toContain(
      'You are on the image bench already',
    )
  })
})
