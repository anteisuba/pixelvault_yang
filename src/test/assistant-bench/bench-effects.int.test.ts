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

const ASSET = {
  assetId: 'gen-asset-1',
  displayName: '图_001·红狐',
  url: 'https://cdn.example.test/fox.png',
  kind: 'image',
}

const AUDIO_ASSET = {
  assetId: 'gen-audio-1',
  displayName: '音_001·旁白',
  url: 'https://cdn.example.test/voice.mp3',
  kind: 'audio',
}

const VIDEO: Snapshot = {
  prompt: 'a cat leaps',
  negativePrompt: '',
  model: { id: 'seedance-2.0-fast', label: 'Seedance 2.0 Fast' },
  availableModels: [{ id: 'seedance-2.0-fast', label: 'Seedance 2.0 Fast' }],
  videoSpecs: {
    durationSeconds: 5,
    aspectRatio: '16:9',
    resolution: '720p',
    durationOptions: [5, 10],
    aspectRatioOptions: ['16:9', '9:16'],
    resolutionOptions: ['480p', '720p'],
  },
  references: { items: [], limit: 4 },
  audioReferences: { items: [], limit: 3, requiresVisual: false },
  sound: { value: null, effective: false },
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

const video = (
  args: Record<string, unknown>,
  fields: readonly StateKey[],
  seen: string,
  extra: Partial<BenchCase> = {},
): BenchCase => ({
  on: 'bench',
  domain: 'video',
  workspaceKey: 'video',
  snapshot: VIDEO,
  args,
  fields,
  seen,
  ...extra,
})

const TAGS: Snapshot = {
  prompt: '1girl, solo',
  negativePrompt: '',
  model: { id: 'nai-diffusion-4-5-full', label: 'NAI V4.5' },
  availableModels: [{ id: 'nai-diffusion-4-5-full', label: 'NAI V4.5' }],
  references: { items: [], limit: 4 },
  novelAiCharacters: { mode: 'free', max: 6, layout: null },
  novelAiSceneTexts: { items: [], maxChars: 40, latinOnly: true },
}

const tags = (
  args: Record<string, unknown>,
  fields: readonly StateKey[],
  seen: string,
): BenchCase => ({
  on: 'bench',
  domain: 'image',
  workspaceKey: 'image-tags',
  snapshot: TAGS,
  args,
  fields,
  seen,
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
  [T.mountReference]: image(
    { assetId: ASSET.assetId },
    ['referenceUrls', 'referenceCount'],
    'fox.png',
    { setup: (run) => run.searchIndex.set(ASSET.assetId, ASSET as never) },
  ),
  [T.unmountReference]: image(
    { slotIndex: 1 },
    ['referenceUrls', 'referenceCount'],
    '',
    {
      snapshot: {
        ...IMAGE,
        references: {
          items: [{ assetId: ASSET.assetId, url: ASSET.url, label: '红狐' }],
          limit: 4,
        },
      },
    },
  ),
  [T.setVideoSpecs]: video(
    { durationSeconds: 10, aspectRatio: '9:16', resolution: '480p' },
    ['videoDurationSeconds', 'videoAspectRatio', 'videoResolution'],
    '9:16',
  ),
  [T.setTagCharacters]: tags(
    { positioning: 'auto', characters: [{ prompt: 'girl, red hair' }] },
    ['novelAiCharacters'],
    'red hair',
  ),
  [T.setSceneTexts]: tags(
    { items: [{ kind: 'sign', text: 'OPEN' }] },
    ['novelAiSceneTexts'],
    'OPEN',
  ),
  [T.setCapability]: image(
    { key: 'style', value: 'natural' },
    ['capabilities'],
    'natural',
    {
      snapshot: {
        ...IMAGE,
        capabilities: [
          {
            key: 'style',
            kind: 'select',
            value: 'vivid',
            options: ['vivid', 'natural'],
            available: true,
          },
        ],
      },
    },
  ),
  [T.mountAudioReference]: video(
    { assetId: AUDIO_ASSET.assetId },
    ['audioReferenceCount'],
    '1/3',
    {
      setup: (run) =>
        run.searchIndex.set(AUDIO_ASSET.assetId, AUDIO_ASSET as never),
    },
  ),
  [T.setSound]: video(
    { enabled: true },
    ['soundValue', 'soundEffective'],
    'currently ON',
  ),
  [T.primeGenerate]: {
    on: 'off-bench',
    why: '只把生成键置成待按，不是台面上的一格；服务端不记，下一步靠这一步的观察知道已置位',
  },
  [T.importUserUrl]: image(
    { url: 'https://images.example.org/fox.png' },
    ['referenceUrls', 'referenceCount'],
    '',
    { userText: '用这张当参考 https://images.example.org/fox.png' },
  ),
  [T.mountLora]: lora(
    { candidateId: LORA_CANDIDATE.candidateId, weight: 0.6 },
    ['loras', 'prompt'],
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
  [T.setLoraParameters]: lora({ steps: 30 }, ['loraParameters'], '"steps":30', {
    snapshot: {
      ...LORA,
      model: { id: 'illustrious-runner', label: 'Illustrious (Runner)' },
      availableModels: [
        { id: 'illustrious-runner', label: 'Illustrious (Runner)' },
      ],
      loraParameters: {
        steps: null,
        guidanceScale: null,
        runnerSeed: null,
        runnerWidth: null,
        runnerHeight: null,
      },
    },
  }),
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

/**
 * 11-03 线上那一轮的工具调用原样回放（线程「修助手摘下 LoRA 后挂不回去」）：
 * 摘下两把 → 再挂回去。以前挂的那步说「已挂上」，这一轮后面读到的台面却是空的，
 * 助手以为没挂上，反复摘挂（每挂一次多导入一条收藏）。
 */
describe('回放：11-03 摘下 LoRA 挂不回去', () => {
  const WUWA = { ...LORA_CANDIDATE }
  const MALFOID = {
    ...LORA_CANDIDATE,
    candidateId: 'civitai:3:4',
    name: 'Malfoid',
    triggerWords: ['malfoid'],
    importPayload: {
      ...LORA_CANDIDATE.importPayload,
      name: 'Malfoid',
      triggerWord: 'malfoid',
      loraUrl: 'https://civitai.com/api/download/models/4',
      modelVersionId: 4,
    },
  }
  const ON_BENCH: Snapshot = {
    ...LORA,
    prompt: '1girl, wuwaFG, malfoid',
    loras: {
      ...LORA.loras!,
      items: [
        {
          ...LORA.loras!.items[0]!,
          id: 'lora-wuwa',
          name: 'Wuwa Style',
          triggerWord: 'wuwaFG',
        },
        {
          ...LORA.loras!.items[0]!,
          id: 'lora-malfoid',
          name: 'Malfoid',
          triggerWord: 'malfoid',
        },
      ],
    },
  }

  it('摘两把再挂回：每一步之后台面都对得上，挂回去的看得到、不会挂第二次', async () => {
    const prepared = await openTurn({
      ...(BENCH_EFFECTS[T.mountLora] as BenchCase),
      snapshot: ON_BENCH,
      userText: '先把两把 LoRA 摘了，再挂回去',
    })
    const { run } = prepared
    run.loraIndex.set(WUWA.candidateId, WUWA as never)
    run.loraIndex.set(MALFOID.candidateId, MALFOID as never)

    const step = async (
      tool: AssistantOperatorTool,
      args: Record<string, unknown>,
    ) => {
      const plan = await planTool(run, tool, args, user.id)
      expect(plan.kind, `${tool} ${JSON.stringify(plan).slice(0, 300)}`).toBe(
        'mutate',
      )
      if (plan.kind === 'mutate') plan.apply()
      return benchSeenBy(run)
    }

    await step(T.unmountLora, { loraId: 'lora-wuwa' })
    const empty = await step(T.unmountLora, { loraId: 'lora-malfoid' })
    expect(empty).toContain('EMPTY')

    await step(T.mountLora, { candidateId: WUWA.candidateId })
    const both = await step(T.mountLora, { candidateId: MALFOID.candidateId })
    expect(both).toContain('Wuwa Style')
    expect(both).toContain('Malfoid')
    expect(run.state.loras).toHaveLength(2)

    // 触发词各一次（摘挂不叠写）
    const words = run.state.prompt.split(',').map((word) => word.trim())
    expect(words.filter((word) => word === 'wuwaFG')).toHaveLength(1)
    expect(words.filter((word) => word === 'malfoid')).toHaveLength(1)

    // 同一把再挂一次：台面已经有了，不该再导入一条
    const again = await planTool(
      run,
      T.mountLora,
      { candidateId: WUWA.candidateId },
      user.id,
    )
    expect(again.kind).not.toBe('mutate')
  })
})
