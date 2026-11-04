/**
 * 新内核各台的改法（第 4 步）：add_lora 按名字挂、lora_param 宽高并成一步、套用配方。
 * 真库（L2a）：真开轮、真执行器、库里的图与 LoRA；只假模型那一头（`fake-model.ts`）和
 * LoRA 大库的索引（`fetch`）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import type { Prisma } from '@/lib/generated/prisma/client'
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
  IMAGE_SNAPSHOT,
  imageRequest,
  kernelUser,
  LORA_SNAPSHOT,
  payloadOf,
  stepsOf,
  type KernelUser,
} from '@/test/assistant-bench/kernel-harness'
import { resetDatabase } from '@/test/int/db'

import { runAssistantNext } from './kernel'

let user: KernelUser

/** LoRA 大库索引里现在有的那几把（按名字）。 */
let civitaiNames: string[] = []

const network = vi.fn(async (url: string): Promise<Response> => {
  if (url.startsWith('https://civitai-index.test/search'))
    return Response.json({
      rows: civitaiNames.map((name, index) => civitaiRow(name, index + 1)),
      total: civitaiNames.length,
    })
  throw new Error(`unexpected fetch ${url}`)
})

beforeEach(async () => {
  await resetDatabase()
  resetFakeModels()
  user = await kernelUser()
  civitaiNames = []
  network.mockClear()
  vi.stubEnv('CIVITAI_INDEX_URL', 'https://civitai-index.test')
  vi.stubEnv('CIVITAI_INDEX_TOKEN', 'index-token')
  vi.stubGlobal('fetch', (input: string | URL) => network(String(input)))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function civitaiRow(name: string, id: number) {
  return {
    modelId: id,
    versionId: id * 10,
    versionName: 'v1',
    name,
    creator: null,
    creatorImage: null,
    nsfw: false,
    baseModel: 'Illustrious',
    tags: ['character'],
    trainedWords: [],
    hashAutoV3: null,
    downloadCount: 10,
    thumbsUpCount: 1,
    images: [],
    permissions: {
      allowCommercialUse: [],
      allowDerivatives: true,
      allowNoCredit: true,
    },
    createdAt: 0,
  }
}

const loraRequest = (
  message: string,
  snapshot: Record<string, unknown> = {},
): AssistantOperatorRequest =>
  imageRequest(message, {
    domain: 'lora',
    workspaceKey: 'lora',
    snapshot: { ...LORA_SNAPSHOT, ...snapshot },
  } as Partial<AssistantOperatorRequest>)

const run = (request: AssistantOperatorRequest) =>
  collect(runAssistantNext(user.clerkId, request))

/** 第二次调用发出去的整段：上一步的工具结果在里面。 */
const resultsSent = () => promptOf(fakeModels.main.doStreamCalls[1]!)

const doneSteps = (events: Awaited<ReturnType<typeof run>>) =>
  stepsOf(events).filter((step) => step.status !== 'running')

function picture(
  data: Partial<Omit<Prisma.GenerationUncheckedCreateInput, 'userId'>>,
) {
  return db.generation.create({
    data: {
      userId: user.id,
      seq: 1,
      outputType: 'IMAGE',
      status: 'COMPLETED',
      url: 'https://cdn.test/1.png',
      storageKey: '1.png',
      prompt: '1girl',
      model: 'seedream-4',
      provider: 'fal',
      width: 768,
      height: 1024,
      ...data,
    },
  })
}

describe('第 4 步：各台的改法', () => {
  it('LoRA 台 add_lora：按名字搜一遍（不出过程行），挑名字对得上的那把挂上', async () => {
    civitaiNames = ['malfoid style', 'Malfoid']
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          changes: [{ op: 'add_lora', lora: 'LoRA·malfoid', weight: 0.8 }],
        },
      }),
      textTurn('挂好了。'),
    ])
    const events = await run(loraRequest('挂上 malfoid'))
    // 搜的那一下不出过程行，只有挂上那一行。
    const steps = doneSteps(events)
    expect(steps.map((step) => step.tool)).toEqual(['mount_lora'])
    const payload = JSON.stringify(payloadOf(steps[0]!))
    expect(payload).toContain('"Malfoid"')
    expect(payload).not.toContain('malfoid style')
    expect(payload).toContain('0.8')
  })

  it('LoRA 台 add_lora：名字对不上、有好几把相近的 → 不挂，把名字列回去（⛔ 挑第一把）', async () => {
    civitaiNames = ['anima-鸣潮-style', '鸣潮(Wuthering Waves) Style']
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: { changes: [{ op: 'add_lora', lora: '鸣潮' }] },
      }),
      textTurn('好。'),
    ])
    const events = await run(loraRequest('挂回鸣潮'))
    expect(
      doneSteps(events).some(
        (step) => step.tool === 'mount_lora' && step.status === 'done',
      ),
    ).toBe(false)
    expect(resultsSent()).toContain('No LoRA is named exactly')
    expect(resultsSent()).toContain('鸣潮(Wuthering Waves) Style')
  })

  it('LoRA 台 lora_param：同一次 edit 里的 width 与 height 并成一步落（⛔ 各撞一次「宽高要一起设」）', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          changes: [
            { op: 'lora_param', key: 'steps', value: 30 },
            { op: 'lora_param', key: 'width', value: 832 },
            { op: 'lora_param', key: 'height', value: 1216 },
          ],
        },
      }),
      textTurn('好。'),
    ])
    const runner = { id: 'illustrious-runner', label: 'Illustrious Runner' }
    const events = await run(
      loraRequest('竖图', {
        model: runner,
        availableModels: [runner],
        loraParameters: {},
      }),
    )
    const params = doneSteps(events).filter(
      (step) => step.tool === 'set_lora_parameters',
    )
    expect(params).toHaveLength(2)
    expect(JSON.stringify(payloadOf(params[1]!))).toContain('832')
    expect(JSON.stringify(payloadOf(params[1]!))).toContain('1216')
    expect(resultsSent()).not.toContain('together')
  })

  it('套用配方：拆成这台有的那几格逐条落，这台没有的说清楚', async () => {
    await picture({ seq: 3, url: 'https://cdn.test/3.png' })
    await db.loraAsset.create({
      data: {
        userId: user.id,
        name: 'malfoid',
        styleCode: 'pv-malfoid',
        triggerWord: '',
        loraUrl: 'https://lora.test/malfoid.safetensors',
      } as Prisma.LoraAssetUncheckedCreateInput,
    })
    await picture({
      seq: 12,
      url: 'https://cdn.test/12.png',
      prompt: '1girl, red hair',
      negativePrompt: 'lowres',
      snapshot: {
        aspectRatio: '3:4',
        advancedParams: {
          guidanceScale: 5,
          notOnBench: 1,
          loras: [{ url: 'https://lora.test/malfoid.safetensors', scale: 0.8 }],
        },
        referenceImages: [
          'https://cdn.test/3.png',
          'https://upload.test/mine.png',
        ],
      },
    })
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: { changes: [{ op: 'apply_recipe', picture: '图_12' }] },
      }),
      textTurn('套好了。'),
    ])
    const events = await run(
      imageRequest('套用图_12的配方', {
        snapshot: {
          ...IMAGE_SNAPSHOT,
          capabilities: [
            {
              key: 'guidanceScale',
              kind: 'slider',
              value: null,
              available: true,
            },
          ],
        },
      } as Partial<AssistantOperatorRequest>),
    )
    const steps = doneSteps(events)
    const tools = steps.map((step) => step.tool)
    // 型号与台上相同不换；提示词、负面词整段写；台上有的参数才套；参考图按编号挂。
    expect(tools).toEqual(
      expect.arrayContaining(['set_prompt', 'set_negative', 'mount_reference']),
    )
    expect(tools).not.toContain('set_model')
    const all = JSON.stringify(steps)
    expect(all).toContain('1girl, red hair')
    expect(all).toContain('guidanceScale')
    expect(all).not.toContain('notOnBench')
    const results = resultsSent()
    expect(results).toContain('图_12')
    expect(results).toContain('they only go on the LoRA bench')
    expect(results).toContain('uploaded picture')
  })

  it('套用配方：查不到那张图就只回这一条', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: { changes: [{ op: 'apply_recipe', picture: '图_99999' }] },
      }),
      textTurn('没找到。'),
    ])
    const events = await run(imageRequest('套用图_99999'))
    expect(doneSteps(events)).toEqual([])
    expect(resultsSent()).toContain("no such picture of the creator's")
  })
})
