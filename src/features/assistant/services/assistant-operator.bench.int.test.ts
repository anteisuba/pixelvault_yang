/**
 * 旧内核在台面上动手的那几条（`planTool`）：参考图、LoRA、画布写词出图、NAI 专属项。
 * 真库（L2a）；只假模型那一跳（`llm-text`，见 `fake-llm-text.ts`）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@/services/llm-text.service', async (importOriginal) =>
  (await import('@/test/int/fake-llm-text')).fakeLlmTextModule(
    await importOriginal(),
  ),
)

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import { prepareOperatorTurn } from '@/features/assistant/services/assistant-operator-turn.service'
import { planTool } from '@/features/assistant/services/assistant-operator-tools.service'
import {
  canvasProject,
  LORA_SNAPSHOT,
  operatorRequest,
  operatorUser,
  SNAPSHOT,
  type OperatorUser,
} from '@/test/assistant-bench/operator-plan'
import { resetDatabase } from '@/test/int/db'
import { fakeLlm } from '@/test/int/fake-llm-text'

let user: OperatorUser

beforeEach(async () => {
  await resetDatabase()
  fakeLlm.reset()
  // 参考图尺寸探针等一律不出网。
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network disabled in tests')
    }),
  )
  user = await operatorUser()
})

function prepare(request: AssistantOperatorRequest) {
  return prepareOperatorTurn(
    user.clerkId,
    request,
    new AbortController().signal,
  )
}

const refs = [
  { url: 'https://cdn.test/female.png' },
  { url: 'https://cdn.test/male.png' },
  { url: 'https://cdn.test/pose.png' },
  { url: 'https://cdn.test/style.png' },
]
const facts = {
  identity: 'Recognizable face and costume',
  pose: 'Visible limb positions',
  characterEvidence: {
    face: {
      support: 'clear' as const,
      observations: ['Pink eyes and a small cheek mole'],
      limitations: [],
    },
    upperBody: {
      support: 'partial' as const,
      observations: ['A loose jacket covers the shoulders and torso'],
      limitations: ['The jacket conceals the waist and torso shape'],
    },
    fullBodyProportions: {
      support: 'unknown' as const,
      observations: [],
      limitations: ['The image is cropped at the waist'],
    },
    legs: {
      support: 'unknown' as const,
      observations: [],
      limitations: ['Neither leg is visible'],
    },
    sideView: {
      support: 'unknown' as const,
      observations: [],
      limitations: ['Only a frontal view is shown'],
    },
    backView: {
      support: 'unknown' as const,
      observations: [],
      limitations: ['The back is not shown'],
    },
  },
  style: {
    renderingMedium: '3d_stylized' as const,
    rendering:
      'Stylized 3D NPR with volumetric hair and material-specific reflections',
    proportions: 'Stylized',
    contours: 'Clean',
    shading: 'Soft',
    materials: 'Matte',
    palette: 'Muted',
    lighting: 'Diffuse',
  },
  scene: 'Source background',
  uncertainties: [],
}

describe('set_model：旧模型的背景 / complexity 不粘到新模型上', () => {
  const GPT26 = 'gpt-image-2.6-flare'
  const snapshot = (
    model: { id: string; label: string },
    extra: Partial<NonNullable<AssistantOperatorRequest['snapshot']['specs']>>,
  ): AssistantOperatorRequest['snapshot'] => ({
    ...SNAPSHOT,
    model,
    availableModels: [
      { id: GPT26, label: 'GPT Image 2.6 Flare' },
      { id: 'seedream-4', label: 'Seedream 4' },
    ],
    specs: { ...SNAPSHOT.specs!, ...extra },
  })

  it('⭐ 2.6 透明背景 + complexity low → 换到 Seedream 4：两格都清掉', async () => {
    const prepared = await prepare(
      operatorRequest({
        domain: 'image',
        messages: [{ role: 'user', content: '换成 Seedream' }],
        snapshot: snapshot(
          { id: GPT26, label: 'GPT Image 2.6 Flare' },
          { background: 'transparent', complexity: 'low' },
        ),
      }),
    )
    expect(prepared.run.state.background).toBe('transparent')
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      { modelId: 'seedream-4' },
      prepared.user.id,
    )
    expect(plan.kind).toBe('mutate')
    if (plan.kind !== 'mutate') return
    plan.apply()
    expect(prepared.run.state.background).toBeUndefined()
    expect(prepared.run.state.complexity).toBeUndefined()
  })

  it('换到 2.6：提示里的背景选项照能力表念，不是写死的一串', async () => {
    const prepared = await prepare(
      operatorRequest({
        domain: 'image',
        messages: [{ role: 'user', content: '换成 GPT' }],
        snapshot: snapshot({ id: 'seedream-4', label: 'Seedream 4' }, {}),
      }),
    )
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      { modelId: GPT26 },
      prepared.user.id,
    )
    expect(plan.kind).toBe('mutate')
    if (plan.kind !== 'mutate') return
    expect(plan.observation).toContain(
      'Background options: auto, transparent, opaque.',
    )
    expect(plan.observation).toContain('Complexity options:')
  })
})

describe('参考图在台上时写词（v3 skipReferenceReview）', () => {
  it.each(['image', 'lora'] as const)(
    '%s 台写词：⛔ 不补读参考图、不起简报',
    async (domain) => {
      const prepared = await prepare(
        operatorRequest({
          domain,
          messages: [{ role: 'user', content: '按参考写一段提示词' }],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      )
      prepared.run.skipReferenceReview = true
      fakeLlm.calls = []
      const write = await planTool(
        prepared.run,
        ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        {
          value: 'two characters embracing, white background',
          overwrite: true,
        },
        prepared.user.id,
      )
      expect(write.kind).toBe('mutate')
      expect(fakeLlm.calls).toEqual([])
    },
  )

  it('画布：写词与出图前⛔ 不另看参考图 —— 不分析、不简报、不补图例', async () => {
    const projectId = await canvasProject(user.id)
    const targetNode: AssistantOperatorCanvasNode = {
      id: 'portrait-target',
      name: '正面基准',
      kind: 'image',
      model: 'seedream-4',
      text: 'Keep the observed face.',
      referenceUrls: [refs[2]!.url, refs[0]!.url],
      referencePromptContext:
        'Image 1 = "姿势参考"; Image 2 = "正脸参考". Use a white background.',
      reviewContextComplete: true,
    }
    const prepared = await prepare(
      operatorRequest(
        {
          domain: 'canvas',
          responseLanguage: 'chinese',
          messages: [
            { role: 'user', content: '为正面基准写入单张半身肖像提示词' },
          ],
          referenceProfiles: refs.map(({ url }) => ({ url, ...facts })),
          snapshot: {
            prompt: '',
            availableModels: [],
            references: { items: [refs[3]!, refs[1]!], limit: 4 },
            canvas: {
              currentShotNo: null,
              selectedNodeIds: [targetNode.id],
              shots: [
                {
                  expanded: true,
                  shotNo: null,
                  title: 'Unassigned',
                  nodes: [targetNode],
                },
              ],
            },
          },
        },
        projectId,
      ),
    )
    prepared.run.skipReferenceReview = true
    fakeLlm.calls = []
    const write = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.canvasApply,
      {
        op: 'set_prompt',
        target: targetNode.id,
        prompt: 'Single half-body portrait.',
        mode: 'replace',
      },
      prepared.user.id,
    )
    expect(write).toMatchObject({
      kind: 'mutate',
      payload: expect.objectContaining({
        prompt: 'Single half-body portrait.',
      }),
    })
    const generate = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate,
      { target: targetNode.id },
      prepared.user.id,
    )
    expect(generate.kind).toBe('confirmGenerate')
    expect(fakeLlm.calls).toEqual([])
  })
})

describe('LoRA 台挂 LoRA（新内核）', () => {
  async function loraRun(prompt = '') {
    const prepared = await prepare(
      operatorRequest({
        domain: 'lora',
        messages: [{ role: 'user', content: '挂个 LoRA' }],
        snapshot: { ...LORA_SNAPSHOT, prompt },
      }),
    )
    prepared.run.nextKernel = true
    return prepared
  }

  it('只认这一轮查到的候选', async () => {
    const prepared = await loraRun()
    const mount = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
      { candidateId: 'not-found' },
      prepared.user.id,
    )
    expect(mount.kind).toBe('rejected')
    expect(JSON.stringify(mount)).toContain('not one of the LoRAs found')
  })

  /**
   * 11-03 线上：挂的那一步说「已挂上」，可这一轮后面读到的台面是空的、触发词也不在正文里 ——
   * 助手反复摘挂。钉住：挂上那一步落进这一轮的台面（标着在路上），触发词同步进正文；
   * 还在路上的那把不许调权重（它还没有真 id）。
   */
  it('这一轮的台面立刻看得到（标在路上），触发词同步进正文', async () => {
    const prepared = await loraRun('1girl')
    prepared.run.loraIndex.set('civitai:1:2', {
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
    } as never)

    const mount = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
      { candidateId: 'civitai:1:2', weight: 0.6 },
      prepared.user.id,
    )
    if (mount.kind !== 'mutate')
      throw new Error(`expected mutate, got ${mount.kind}`)
    mount.apply()

    const pending = prepared.run.state.loras.find(
      (item) => item.name === 'Wuwa Style',
    )
    expect(pending).toMatchObject({ weight: 0.6, enabled: true })
    expect(pending!.id.startsWith('mounting:')).toBe(true)
    expect(prepared.run.state.prompt).toBe('1girl, wuwaFG')

    const tune = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
      { loraId: pending!.id, weight: 0.65 },
      prepared.user.id,
    )
    expect(tune.kind).toBe('rejected')
    expect(JSON.stringify(tune)).toContain('still loading')
  })
})

describe('同一轮先挂参考图再设要图的专属项（10-27 标签台真机）', () => {
  async function naiRun(
    model = { id: 'nai-diffusion-4-5-full', label: 'NovelAI V4.5 Full' },
  ) {
    const prepared = await prepare(
      operatorRequest({
        snapshot: {
          ...SNAPSHOT,
          model,
          capabilities: [
            {
              key: 'novelAiReferenceMode',
              kind: 'select',
              value: null,
              defaultValue: 'standard',
              options: ['standard', 'precise'],
              available: false,
            },
          ],
          references: { items: [], limit: 1 },
        },
      }),
    )
    prepared.run.searchIndex.set('asset-1', {
      assetId: 'asset-1',
      displayName: '图_1215',
      url: 'https://cdn.example.com/a.png',
      kind: 'image',
    })
    const plan = async (tool: string, args: Record<string, unknown>) => {
      const result = await planTool(
        prepared.run,
        tool as never,
        args as never,
        prepared.user.id,
      )
      if (result.kind === 'mutate') result.apply?.()
      return result
    }
    return { prepared, plan }
  }

  it('挂上之后要图的那一项当场可设；位满时说清占位的是谁、怎么换', async () => {
    const { plan } = await naiRun()
    expect(
      await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
        key: 'novelAiReferenceMode',
        value: 'precise',
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'referenceRequired' })
    const mount = await plan(ASSISTANT_OPERATOR_TOOL_IDS.mountReference, {
      assetId: 'asset-1',
    })
    expect(mount.kind).toBe('mutate')
    const after = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'novelAiReferenceMode',
      value: 'precise',
    })
    expect(after.kind).toBe('mutate')
    const again = await plan(ASSISTANT_OPERATOR_TOOL_IDS.mountReference, {
      assetId: 'asset-1',
    })
    expect(again).toMatchObject({ kind: 'rejected', reason: 'referencesFull' })
    expect(JSON.stringify(again)).toContain('remove_reference ref-N')
  })

  it('V4.5：挂图 → 开精确参考 → 两个滑块都设得上；img2img 强度此时说明不生效', async () => {
    const { prepared, plan } = await naiRun()
    await plan(ASSISTANT_OPERATOR_TOOL_IDS.mountReference, {
      assetId: 'asset-1',
    })
    const early = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'preciseReferenceStrength',
      value: 0.5,
    })
    expect(JSON.stringify(early)).toContain(
      'only takes effect once novelAiReferenceMode is precise',
    )
    expect(
      (
        await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
          key: 'novelAiReferenceMode',
          value: 'precise',
        })
      ).kind,
    ).toBe('mutate')
    for (const [key, value] of [
      ['preciseReferenceStrength', 0.8],
      ['preciseReferenceFidelity', 0.6],
    ] as const) {
      const result = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
        key,
        value,
      })
      expect(result.kind).toBe('mutate')
      expect(JSON.stringify(result)).not.toContain('only takes effect')
    }
    const img2img = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'referenceStrength',
      value: 0.8,
    })
    expect(JSON.stringify(img2img)).toContain(
      'Ignored while novelAiReferenceMode is precise',
    )
    expect(
      prepared.run.state.capabilities.find(
        (item) => item.key === 'preciseReferenceFidelity',
      )?.value,
    ).toBe(0.6)
  })

  it('V5：没有精确参考 —— 拒因是「台上没有这一项」，并指向换模型', async () => {
    const { plan } = await naiRun({
      id: 'nai-diffusion-5-full',
      label: 'NovelAI V5 Full',
    })
    await plan(ASSISTANT_OPERATOR_TOOL_IDS.mountReference, {
      assetId: 'asset-1',
    })
    const result = await plan(ASSISTANT_OPERATOR_TOOL_IDS.setCapability, {
      key: 'novelAiReferenceMode',
      value: 'precise',
    })
    expect(result).toMatchObject({ kind: 'rejected', reason: 'notOnBench' })
    expect(JSON.stringify(result)).toContain('set_model')
  })
})
