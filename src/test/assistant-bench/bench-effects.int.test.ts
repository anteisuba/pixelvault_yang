/**
 * L2c 助手改台面工具的后置检查（docs/references/testing.md「测试标准」）。
 *
 * 每一条会改东西的工具（`ASSISTANT_OPERATOR_MUTATING_TOOLS`）都必须在 `BENCH_EFFECTS`
 * 里声明：改台面上哪几格，或者为什么不在台面上（改的是库 / 规矩 / 画布那条另测）。
 * 没声明 = 红。声明了改台面的，逐条真跑：
 *
 *  1. 真库里的用户 + 真 `prepareOperatorTurn` 开一轮（只假掉对模型的调用：这里一次都不调）；
 *  2. `planTool` → 必须是 `mutate` → `apply()`；
 *  3. 这一轮的台面（`run.state`）真的变了（⛔ 空操作 = 11-03 LoRA 挂上却看不见那一类），
 *     变的只有声明的那几格（⛔ 顺手多写）；
 *  4. 助手**下一步**读到的台面（`read_state`）里看得到这次改动。
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_MUTATING_TOOLS,
  ASSISTANT_OPERATOR_TOOL_IDS as T,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import {
  planTool,
  prepareOperatorTurn,
} from '@/features/assistant/services/assistant-operator.service'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Snapshot = AssistantOperatorRequest['snapshot']
type Prepared = Awaited<ReturnType<typeof prepareOperatorTurn>>
type Run = Prepared['run']
type StateKey = keyof Run['state']

interface BenchCase {
  readonly on: 'bench'
  readonly domain: AssistantOperatorRequest['domain']
  readonly workspaceKey: string
  readonly snapshot: Snapshot
  readonly userText?: string
  /** 开轮之后、规划之前：放进这一轮本该先查到的东西（搜到的素材、LoRA 候选）。 */
  readonly setup?: (run: Run) => void
  readonly args: Record<string, unknown>
  /** 这一步允许改的台面格（`run.state` 的键）。 */
  readonly fields: readonly StateKey[]
  /** 改完之后，助手下一步读到的台面里应当出现的字。 */
  readonly seen: string
}

interface OffBenchCase {
  readonly on: 'off-bench'
  /** 为什么不在台面上 / 在哪测。 */
  readonly why: string
}

const IMAGE: Snapshot = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [
    { id: 'seedream-4', label: 'Seedream 4' },
    { id: 'gpt-image-2', label: 'GPT Image 2' },
  ],
  specs: {
    aspectRatio: '1:1',
    resolution: 'auto',
    aspectRatioOptions: ['1:1', '16:9'],
    resolutionOptions: ['auto', '2K'],
  },
  count: { value: 1, options: [1, 2, 4] },
  references: { items: [], limit: 4 },
}

const LORA: Snapshot = {
  prompt: '1girl',
  negativePrompt: '',
  model: { id: 'illustrious-xl', label: 'Illustrious XL' },
  availableModels: [{ id: 'illustrious-xl', label: 'Illustrious XL' }],
  references: { items: [], limit: 2 },
  loras: {
    items: [
      {
        id: 'lora-asset-1',
        name: 'Ink Lines',
        weight: 0.8,
        enabled: true,
        family: 'illustrious',
        compatible: true,
        triggerWord: 'ink lines',
        triggerEnabled: true,
        recommendedPrompt: null,
        sourcePrompts: [],
      },
    ],
    baseFamily: 'illustrious',
    minWeight: 0.1,
    maxWeight: 2,
  },
}

const LORA_CANDIDATE = {
  candidateId: 'civitai:1:2',
  source: 'civitai',
  name: 'Wuwa Style',
  author: null,
  license: { known: false, label: null, commercialUse: null },
  baseModelFamily: 'illustrious',
  type: 'style',
  triggerWords: ['wuwaFG'],
  sampleImageUrls: [],
  pageUrl: 'https://civitai.com/models/1',
  downloads: 0,
  importable: true,
  alreadyMounted: false,
  alreadyImported: true,
  importPayload: {
    name: 'Wuwa Style',
    triggerWord: 'wuwaFG',
    loraUrl: 'https://civitai.com/api/download/models/2',
    type: 'style',
    baseModelFamily: 'illustrious',
    provider: 'civitai',
    modelVersionId: 2,
    sourceSnapshot: { triggerSource: 'official' },
  },
}

const image = (
  args: Record<string, unknown>,
  fields: readonly StateKey[],
  seen: string,
  extra: Partial<BenchCase> = {},
): BenchCase => ({
  on: 'bench',
  domain: 'image',
  workspaceKey: 'image-natural',
  snapshot: IMAGE,
  args,
  fields,
  seen,
  ...extra,
})

const lora = (
  args: Record<string, unknown>,
  fields: readonly StateKey[],
  seen: string,
  extra: Partial<BenchCase> = {},
): BenchCase => ({
  on: 'bench',
  domain: 'lora',
  workspaceKey: 'lora',
  snapshot: LORA,
  args,
  fields,
  seen,
  ...extra,
})

const LIBRARY =
  '改的是素材库 / 设置 / 记忆里的行，工作台一格不动；撤销走服务端 inverse（L2a 测）'

/**
 * ⭐ 清单本身就是检查：新加一条会改东西的工具，不在这里声明就红。
 */
const BENCH_EFFECTS: Record<
  (typeof ASSISTANT_OPERATOR_MUTATING_TOOLS)[number],
  BenchCase | OffBenchCase
> = {
  [T.setPrompt]: image(
    { value: 'a red fox in snow' },
    ['prompt'],
    'a red fox in snow',
  ),
  [T.setNegative]: image({ value: 'blurry' }, ['negativePrompt'], 'blurry'),
  [T.setModel]: image(
    { modelId: 'gpt-image-2' },
    ['modelId', 'modelLabel', 'modelChannelId', 'extraModels', 'capabilities'],
    'GPT Image 2',
  ),
  [T.setSpecs]: image(
    { aspectRatio: '16:9', resolution: '2K' },
    ['aspectRatio', 'resolution', 'quality', 'preview', 'background'],
    '16:9',
  ),
  [T.setCount]: image({ count: 4 }, ['count'], '4'),
  [T.mountReference]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.unmountReference]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.setVideoSpecs]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.setTagCharacters]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.setSceneTexts]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.setCapability]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.mountAudioReference]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.setSound]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.primeGenerate]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.importUserUrl]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.mountLora]: lora(
    { candidateId: LORA_CANDIDATE.candidateId, weight: 0.6 },
    ['loras', 'prompt', 'availableModels'],
    'Wuwa Style',
    {
      setup: (run) =>
        run.loraIndex.set(LORA_CANDIDATE.candidateId, LORA_CANDIDATE as never),
    },
  ),
  [T.unmountLora]: lora(
    { loraId: 'lora-asset-1' },
    ['loras', 'prompt', 'availableModels'],
    '',
  ),
  [T.setLoraWeight]: lora(
    { loraId: 'lora-asset-1', weight: 1.2 },
    ['loras'],
    '1.2',
  ),
  [T.setLoraParameters]: { on: 'off-bench', why: 'TODO 第 3 步第二片' },
  [T.showLoraPicks]: {
    on: 'off-bench',
    why: '圈在 LoRA 库页的网格上，不是工作台的一格（applyOperatorStep 返回 null）',
  },
  [T.addProjectRule]: { on: 'off-bench', why: LIBRARY },
  [T.setReviewState]: {
    on: 'off-bench',
    why: '标在操作员 store 的产物上，不在表单',
  },
  [T.tagAsset]: { on: 'off-bench', why: LIBRARY },
  [T.favoriteAsset]: { on: 'off-bench', why: LIBRARY },
  [T.createFolder]: { on: 'off-bench', why: LIBRARY },
  [T.addToFolder]: { on: 'off-bench', why: LIBRARY },
  [T.libraryWrite]: { on: 'off-bench', why: LIBRARY },
  [T.canvasApply]: {
    on: 'off-bench',
    why: 'TODO 画布：浏览器落一批、下一跳带新快照回来',
  },
  [T.canvasBatch]: {
    on: 'off-bench',
    why: 'TODO 画布：浏览器落一批、下一跳带新快照回来',
  },
}

let user: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  user = await createTestUser()
  await seedAssistantKey(user.id)
})

async function openTurn(c: BenchCase): Promise<Prepared> {
  const prepared = await prepareOperatorTurn(
    user.clerkId,
    {
      messages: [{ role: 'user', content: c.userText ?? '帮我改一下' }],
      domain: c.domain,
      workspaceKey: c.workspaceKey,
      snapshot: c.snapshot,
    },
    new AbortController().signal,
  )
  // 现行内核（features/assistant/）借这套执行器时都设这一格。
  prepared.run.nextKernel = true
  return prepared
}

/** 助手下一步读到的台面：`read_state` 的观察原文。 */
async function benchSeenBy(run: Run): Promise<string> {
  const plan = await planTool(run, T.readState, {}, user.id)
  if (plan.kind !== 'read')
    throw new Error(`read_state 不是 read：${plan.kind}`)
  return (await plan.run()).observation
}

function changedKeys(before: Run['state'], after: Run['state']): StateKey[] {
  return (Object.keys({ ...before, ...after }) as StateKey[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  )
}

describe('改台面的工具：清单', () => {
  it('每一条会改东西的工具都声明了改哪块台面（没声明就红）', () => {
    const declared = Object.keys(BENCH_EFFECTS)
    const missing = ASSISTANT_OPERATOR_MUTATING_TOOLS.filter(
      (tool) => !declared.includes(tool),
    )
    expect(missing).toEqual([])
  })
})

const benchCases = (
  Object.entries(BENCH_EFFECTS) as [
    AssistantOperatorTool,
    BenchCase | OffBenchCase,
  ][]
).filter(
  (entry): entry is [AssistantOperatorTool, BenchCase] =>
    entry[1].on === 'bench',
)

describe.each(benchCases)('%s：改完之后助手看到的台面', (tool, c) => {
  it('落进这一轮的台面、只改声明的格、下一步读得到', async () => {
    const prepared = await openTurn(c)
    const { run } = prepared
    c.setup?.(run)
    const seenBefore = await benchSeenBy(run)
    const before = structuredClone(run.state)

    const plan = await planTool(run, tool, c.args, user.id)
    expect(plan.kind, JSON.stringify(plan).slice(0, 400)).toBe('mutate')
    if (plan.kind !== 'mutate') return
    plan.apply()

    const changed = changedKeys(before, run.state)
    expect(changed, '空操作：这一轮的台面没变').not.toEqual([])
    expect(
      changed.filter((key) => !c.fields.includes(key)),
      '改了没声明的格',
    ).toEqual([])

    const seenAfter = await benchSeenBy(run)
    expect(seenAfter, '助手下一步读到的台面没变').not.toBe(seenBefore)
    if (c.seen) expect(seenAfter).toContain(c.seen)
  })
})
