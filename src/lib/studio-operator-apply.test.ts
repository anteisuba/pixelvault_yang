import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import type { StudioAction, StudioFormState } from '@/contexts/studio-context'
import {
  applyOperatorStep,
  describeOperatorInverse,
  getOperatorStepField,
  revertOperatorStep,
  type StudioOperatorApplyContext,
} from '@/lib/studio-operator-apply'
import type { AssistantOperatorAppliedStep } from '@/types/assistant-operator'

/**
 * 只搭这条链真的会读的那几个键 —— 整个 `StudioFormState` 有 60+ 字段，全填一遍
 * 只会让这份夹具跟着表单一起漂（`VideoComposer` 那条教训：手写镜像漏一个字段就
 * 整文件集体崩）。收窄在这里做一次，测试只关心它读的那几格。
 */
function makeContext(overrides: Partial<StudioFormState> = {}): {
  ctx: StudioOperatorApplyContext
  dispatched: StudioAction[]
  state: StudioFormState
  references: string[]
  primed: { value: boolean }
  userUrls: { sourceUrl: string; domain?: string }[]
  unmounted: string[]
  audioReferences: { url: string; fileName: string; ownerName?: string }[]
  sound: { value: boolean | null }
} {
  const state = {
    prompt: '',
    aspectRatio: '1:1',
    advancedParams: { seed: 1234, resolution: 'auto' },
    imageBatchCount: 1,
    selectedOptionId: null,
    videoDuration: 5,
    videoResolution: null,
    videoAudioRefs: [],
    videoGenerateAudio: null,
    ...overrides,
  } as unknown as StudioFormState

  const dispatched: StudioAction[] = []
  const references: string[] = []
  const primed = { value: false }
  const userUrls: { sourceUrl: string; domain?: string }[] = []
  const unmounted: string[] = []
  const audioReferences: {
    url: string
    fileName: string
    ownerName?: string
  }[] = []
  // ⚠ 初值是 `null` 而不是 `false` —— 那是「用户没设过」那一档，本文件专门验它。
  const sound: { value: boolean | null } = { value: null }

  const ctx: StudioOperatorApplyContext = {
    getState: () => state,
    dispatch: (action) => {
      dispatched.push(action)
      // 让 `advancedParams` 的合并在测试里也是真的：应用与撤销都要读改后的值。
      if (action.type === 'SET_ADVANCED_PARAMS') {
        Object.assign(state, { advancedParams: action.payload })
      }
      if (action.type === 'SET_PROMPT') {
        Object.assign(state, { prompt: action.payload })
      }
    },
    resolveOptionId: (modelId) =>
      modelId === 'known-model' ? 'workspace:known-model' : null,
    addReference: (url) => references.push(url),
    removeReference: (url) => {
      const index = references.indexOf(url)
      if (index >= 0) references.splice(index, 1)
    },
    /**
     * 拍板 22 的那一跳在这里只记账：真实实现会去调导入路由再 `addReference`，
     * 而这一层要验的是**分派对不对**（谁被调、带的是不是源地址），不是网络。
     */
    mountUserUrl: (sourceUrl, domain) => {
      userUrls.push({ sourceUrl, ...(domain ? { domain } : {}) })
    },
    unmountUserUrl: (sourceUrl) => {
      unmounted.push(sourceUrl)
    },
    addAudioReference: (entry) => {
      if (audioReferences.some((existing) => existing.url === entry.url)) return
      audioReferences.push(entry)
    },
    removeAudioReference: (url) => {
      const index = audioReferences.findIndex((entry) => entry.url === url)
      if (index >= 0) audioReferences.splice(index, 1)
    },
    setSound: (enabled) => {
      sound.value = enabled
    },
    setPrimed: (value) => {
      primed.value = value
    },
  }

  return {
    ctx,
    dispatched,
    state,
    references,
    primed,
    userUrls,
    unmounted,
    audioReferences,
    sound,
  }
}

const BASE = { id: 'step-1', title: '一步', status: 'done' } as const

describe('applyOperatorStep', () => {
  it('set_specs 一次下两个 dispatch —— 比例与清晰度必须同时到（台账 AE/BG/BS）', () => {
    const { ctx, dispatched, state } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      payload: { aspectRatio: '3:4', resolution: '2K' },
      inverse: { aspectRatio: '1:1', resolution: 'auto' },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBe(STUDIO_OPERATOR_FIELD_IDS.specs)
    expect(dispatched.map((action) => action.type)).toEqual([
      'SET_ASPECT_RATIO',
      'SET_ADVANCED_PARAMS',
    ])
    // ⭐ 只换 resolution 一个键，其余 advancedParams 原样带过去 ——
    //    `SET_ADVANCED_PARAMS` 是整体替换，漏带就是把用户调好的 seed 清空。
    expect(state.advancedParams).toEqual({ seed: 1234, resolution: '2K' })
  })

  it('set_specs 的值不在收窄表里就整条不落，绝不 as 过去', () => {
    const { ctx, dispatched } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      payload: { aspectRatio: '5:7', resolution: '8K' },
      inverse: { aspectRatio: '1:1', resolution: 'auto' },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBeNull()
    expect(dispatched).toHaveLength(0)
  })

  it('set_prompt 的 append 接在当前值后面，replace 整段换掉', () => {
    const appendCtx = makeContext({ prompt: '手办质感的立绘' })
    const appendStep = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
      payload: { value: 'PVC 材质', mode: 'append' },
      inverse: { value: '手办质感的立绘' },
    } satisfies AssistantOperatorAppliedStep
    applyOperatorStep(appendStep, appendCtx.ctx)
    expect(appendCtx.state.prompt).toBe('手办质感的立绘, PVC 材质')

    const replaceCtx = makeContext({ prompt: '旧的' })
    const replaceStep = {
      ...appendStep,
      payload: { value: '新的', mode: 'replace' },
    } satisfies AssistantOperatorAppliedStep
    applyOperatorStep(replaceStep, replaceCtx.ctx)
    expect(replaceCtx.state.prompt).toBe('新的')
  })

  it('空框上的 append 退化成整段写入 —— 不会留下一个前导分隔符', () => {
    const { ctx, state } = makeContext({ prompt: '' })
    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        payload: { value: '第一句', mode: 'append' },
        inverse: { value: '' },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(state.prompt).toBe('第一句')
  })

  it('set_model 查不到 optionId 就什么都不做（模型编了个 id）', () => {
    const { ctx, dispatched } = makeContext()
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
          payload: { modelId: 'ghost-model' },
          inverse: { modelId: null },
        } satisfies AssistantOperatorAppliedStep,
        ctx,
      ),
    ).toBeNull()
    expect(dispatched).toHaveLength(0)
  })

  it('set_count 只收档位表里的数', () => {
    const { ctx, dispatched } = makeContext()
    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
        payload: { count: 3 },
        inverse: { count: 1 },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toHaveLength(0)

    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
        payload: { count: 4 },
        inverse: { count: 1 },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toEqual([{ type: 'SET_IMAGE_BATCH_COUNT', payload: 4 }])
  })

  it('prime_generate 只点亮生成键 —— 一个 dispatch 都不发（钱闸）', () => {
    const { ctx, dispatched, primed } = makeContext()
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          payload: { primed: true },
          inverse: { primed: false },
        } satisfies AssistantOperatorAppliedStep,
        ctx,
      ),
    ).toBeNull()
    expect(primed.value).toBe(true)
    expect(dispatched).toHaveLength(0)
  })

  it('读类工具不产生任何改动', () => {
    const { ctx, dispatched } = makeContext()
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          payload: {},
          result: { digest: '…' },
        } satisfies AssistantOperatorAppliedStep,
        ctx,
      ),
    ).toBeNull()
    expect(dispatched).toHaveLength(0)
  })
})

describe('revertOperatorStep', () => {
  it('提示词回到改前的完整原文（append / replace 撤法相同）', () => {
    const { ctx, state } = makeContext({ prompt: '手办质感的立绘, PVC 材质' })
    revertOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        payload: { value: 'PVC 材质', mode: 'append' },
        inverse: { value: '手办质感的立绘' },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(state.prompt).toBe('手办质感的立绘')
  })

  it('负面词撤成空串时回到 undefined，不留一个空字符串', () => {
    const { ctx, state } = makeContext({
      advancedParams: { seed: 7, negativePrompt: '布料褶皱' },
    } as Partial<StudioFormState>)
    revertOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
        payload: { value: '布料褶皱', mode: 'replace' },
        inverse: { value: '' },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(state.advancedParams.negativePrompt).toBeUndefined()
    expect(state.advancedParams.seed).toBe(7)
  })

  it('模型撤回「一个都没选」时把 optionId 置 null', () => {
    const { ctx, dispatched } = makeContext()
    revertOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
        payload: { modelId: 'known-model' },
        inverse: { modelId: null },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toEqual([{ type: 'SET_OPTION_ID', payload: null }])
  })

  it('参考图按 payload 里的 URL 摘除 —— inverse 只有 assetId，摘不动', () => {
    const { ctx, references } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
      payload: {
        assetId: 'asset-1',
        url: 'https://cdn.example.com/a.png',
        kind: 'image',
      },
      inverse: { assetId: 'asset-1' },
    } satisfies AssistantOperatorAppliedStep

    applyOperatorStep(step, ctx)
    expect(references).toEqual(['https://cdn.example.com/a.png'])
    revertOperatorStep(step, ctx)
    expect(references).toEqual([])
  })

  // ── 视频域（P4-A）──────────────────────────────────────────────
  it('set_video_specs 三格一起落，且各走各的收窄谓词（不复用图片那张 auto/1K/2K 表）', () => {
    const { ctx, dispatched } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
      payload: { durationSeconds: 10, aspectRatio: '9:16', resolution: '720p' },
      inverse: { durationSeconds: 5, aspectRatio: '1:1', resolution: null },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBe(STUDIO_OPERATOR_FIELD_IDS.specs)
    expect(dispatched).toEqual([
      { type: 'SET_ASPECT_RATIO', payload: '9:16' },
      { type: 'SET_VIDEO_DURATION', payload: 10 },
      { type: 'SET_VIDEO_RESOLUTION', payload: '720p' },
    ])
  })

  it('set_video_specs 的清晰度不是视频档位就落 null —— ⛔ 绝不 as 一个 720p 之外的值进去', () => {
    const { ctx, dispatched } = makeContext()
    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
        // `2K` 是图片档的清晰度档位，视频档只认 480p/540p/720p/1080p/2k。
        payload: { durationSeconds: null, aspectRatio: null, resolution: '2K' },
        inverse: {
          durationSeconds: null,
          aspectRatio: null,
          resolution: null,
        },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toEqual([
      { type: 'SET_VIDEO_RESOLUTION', payload: null },
    ])
  })

  it('set_video_specs 的逆操作也带齐三格 —— 撤销落回真实存在过的三元组', () => {
    const { ctx, dispatched } = makeContext()
    revertOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
        payload: {
          durationSeconds: 10,
          aspectRatio: '9:16',
          resolution: '720p',
        },
        inverse: { durationSeconds: 5, aspectRatio: '1:1', resolution: null },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toEqual([
      { type: 'SET_ASPECT_RATIO', payload: '1:1' },
      { type: 'SET_VIDEO_DURATION', payload: 5 },
      { type: 'SET_VIDEO_RESOLUTION', payload: null },
    ])
  })

  it('音频参考挂在自己的槽上（不是参考图那一格），撤销按 URL 摘', () => {
    const { ctx, audioReferences, references } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
      payload: {
        assetId: 'gen-audio-1',
        url: 'https://cdn.example.com/line.mp3',
        label: '我不走',
        ownerName: '阿岚',
      },
      inverse: { assetId: 'gen-audio-1' },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBe(
      STUDIO_OPERATOR_FIELD_IDS.audioReferences,
    )
    expect(audioReferences).toEqual([
      {
        url: 'https://cdn.example.com/line.mp3',
        fileName: '我不走',
        ownerName: '阿岚',
      },
    ])
    // ⭐ 图片参考位一条都没多 —— 两个槽，别混。
    expect(references).toEqual([])

    revertOperatorStep(step, ctx)
    expect(audioReferences).toEqual([])
  })

  it('⭐ set_sound 撤销回得到 null（「用户没设过」）—— ⛔ 不是 false', () => {
    const { ctx, sound } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSound,
      payload: { enabled: false },
      inverse: { enabled: null },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBe(STUDIO_OPERATOR_FIELD_IDS.sound)
    expect(sound.value).toBe(false)
    revertOperatorStep(step, ctx)
    // 发一个 false 与「没设过」在目录默认为开的模型上结果相反 —— 这一行就是那条闸。
    expect(sound.value).toBeNull()
  })

  it('prime 的逆操作把生成键熄灭', () => {
    const { ctx, primed } = makeContext()
    primed.value = true
    revertOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
        payload: { primed: true },
        inverse: { primed: false },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(primed.value).toBe(false)
  })
})

describe('getOperatorStepField / describeOperatorInverse', () => {
  it('比例与清晰度共用 specs 一格 —— 分开撤会撤出没存在过的组合', () => {
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      payload: { aspectRatio: '3:4', resolution: '2K' },
      inverse: { aspectRatio: '16:9', resolution: '1K' },
    } satisfies AssistantOperatorAppliedStep
    expect(getOperatorStepField(step)).toBe(STUDIO_OPERATOR_FIELD_IDS.specs)
    expect(describeOperatorInverse(step)).toBe('16:9 · 1K')
  })

  it('prime_generate 不算字段 —— 生成键不是表单的一格', () => {
    expect(
      getOperatorStepField({
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
        payload: { primed: true },
        inverse: { primed: false },
      } satisfies AssistantOperatorAppliedStep),
    ).toBeNull()
  })

  it('被拒的那一步没有字段可记', () => {
    expect(
      getOperatorStepField({
        id: 'step-2',
        title: '换模型',
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
        status: 'error',
        error: { reason: 'unknownModel' },
      }),
    ).toBeNull()
  })
})

/**
 * 拍板 22（P3-D）：用户递来的链接。
 *
 * 钉三件事：① 它算「动了参考位」（归属标记与撤销的粒度）；② 交出去的是**源地址**
 * （落地地址此刻还不存在）；③ 撤销走的是摘挂载那条，⛔ 不删素材。
 */
describe('import_user_url（拍板 22）', () => {
  const STEP = {
    ...BASE,
    tool: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
    payload: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/E.jpg',
      domain: 'upload.wikimedia.org',
    },
    inverse: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/E.jpg',
    },
  } satisfies AssistantOperatorAppliedStep

  it('应用 = 交给宿主去取图挂载，并记在参考位这一格', () => {
    const { ctx, userUrls, references } = makeContext()
    expect(applyOperatorStep(STEP, ctx)).toBe(
      STUDIO_OPERATOR_FIELD_IDS.references,
    )
    expect(userUrls).toEqual([
      {
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/E.jpg',
        domain: 'upload.wikimedia.org',
      },
    ])
    // ⚠ 这一层**不直接挂**：落地地址要等那一跳回来才有。
    expect(references).toEqual([])
  })

  it('撤销 = 按源地址摘掉它挂上去的那张（⛔ 不删素材）', () => {
    const { ctx, unmounted } = makeContext()
    revertOperatorStep(STEP, ctx)
    expect(unmounted).toEqual([
      'https://upload.wikimedia.org/wikipedia/commons/a/a1/E.jpg',
    ])
  })

  it('归属标记上显示的是用户自己粘的那一串，不是落地地址', () => {
    expect(describeOperatorInverse(STEP)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/a/a1/E.jpg',
    )
  })
})

describe('钱闸', () => {
  it('整张工具表里没有任何一条会调用生成', () => {
    const dispatch = vi.fn()
    const { ctx } = makeContext()
    const spied: StudioOperatorApplyContext = { ...ctx, dispatch }
    for (const tool of Object.values(ASSISTANT_OPERATOR_TOOL_IDS)) {
      expect(tool).not.toContain('generate_image')
    }
    // `prime_generate` 是离生成最近的一条，它连一个 dispatch 都不发。
    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
        payload: { primed: true },
        inverse: { primed: false },
      } satisfies AssistantOperatorAppliedStep,
      spied,
    )
    expect(dispatch).not.toHaveBeenCalled()
  })
})
/**
 * LoRA 装配台的那三条改动型（P4-C）。
 *
 * ⚠ 用**另一份上下文**：`lora` 是可选能力组（工作台那份宿主结构性没有挂载栈），
 * 而这几条用例要验的正是「有它时落到哪只手上、缺它时整步不记账」两侧。
 */
function makeLoraContext(): {
  ctx: StudioOperatorApplyContext
  mounted: {
    candidateId: string
    name: string
    weight: number
    triggerWords: readonly string[]
  }[]
  unmountedByCandidate: string[]
  unmountedById: string[]
  remounted: { loraId: string; weight: number }[]
  weights: { loraId: string; weight: number }[]
} {
  const base = makeContext()
  const mounted: {
    candidateId: string
    name: string
    weight: number
    triggerWords: readonly string[]
  }[] = []
  const unmountedByCandidate: string[] = []
  const unmountedById: string[] = []
  const remounted: { loraId: string; weight: number }[] = []
  const weights: { loraId: string; weight: number }[] = []

  const ctx: StudioOperatorApplyContext = {
    ...base.ctx,
    lora: {
      mount: ({ candidateId, name, weight, triggerWords }) => {
        mounted.push({ candidateId, name, weight, triggerWords })
      },
      unmountByCandidateId: (candidateId) => {
        unmountedByCandidate.push(candidateId)
      },
      unmount: (loraId) => {
        unmountedById.push(loraId)
      },
      remount: (loraId, weight) => {
        remounted.push({ loraId, weight })
      },
      setWeight: (loraId, weight) => {
        weights.push({ loraId, weight })
      },
    },
  }

  return {
    ctx,
    mounted,
    unmountedByCandidate,
    unmountedById,
    remounted,
    weights,
  }
}

const IMPORT_PAYLOAD = {
  name: 'Watercolor Storybook',
  triggerWord: 'watercolor',
  loraUrl: 'https://civitai.com/api/download/models/67890',
  type: 'style',
  baseModelFamily: 'illustrious',
  provider: 'civitai',
  sourceSnapshot: {
    source: 'civitai',
    author: 'someone',
    license: {
      label: null,
      commercialUse: ['Image'],
      allowDerivatives: true,
      allowNoCredit: false,
      known: true,
    },
    pageUrl: 'https://civitai.com/models/12345',
    revision: null,
    retrievedAt: '2026-08-31T00:00:00.000Z',
    fileSizeBytes: null,
    metadataCompleteness: 'partial',
  },
} as const

function mountLoraStep(): AssistantOperatorAppliedStep {
  return {
    ...BASE,
    tool: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
    payload: {
      candidateId: 'civitai:12345:67890',
      name: 'Watercolor Storybook',
      weight: 0.7,
      triggerWords: ['watercolor'],
      family: 'illustrious',
      compatible: true,
      importPayload: IMPORT_PAYLOAD,
    },
    inverse: { candidateId: 'civitai:12345:67890' },
  } as unknown as AssistantOperatorAppliedStep
}

describe('LoRA 装配台的三条改动型（P4-C）', () => {
  it('挂 / 摘 / 调权重共用 `loras` 一格 —— 它们回答的是同一个问题', () => {
    expect(getOperatorStepField(mountLoraStep())).toBe(
      STUDIO_OPERATOR_FIELD_IDS.loras,
    )
    expect(
      getOperatorStepField({
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
        payload: { loraId: 'lora-1', name: 'Ink Lines' },
        inverse: { loraId: 'lora-1', weight: 0.8 },
      } as unknown as AssistantOperatorAppliedStep),
    ).toBe(STUDIO_OPERATOR_FIELD_IDS.loras)
    expect(
      getOperatorStepField({
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
        payload: { loraId: 'lora-1', name: 'Ink Lines', weight: 1.2 },
        inverse: { loraId: 'lora-1', weight: 0.8 },
      } as unknown as AssistantOperatorAppliedStep),
    ).toBe(STUDIO_OPERATOR_FIELD_IDS.loras)
  })

  it('找 LoRA 是读类：不动表单、不记账', () => {
    const { ctx, mounted } = makeLoraContext()
    const field = applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
        payload: { query: 'watercolor', limit: 6 },
        result: { totalFound: 0, candidates: [], sources: [] },
      } as unknown as AssistantOperatorAppliedStep,
      ctx,
    )
    expect(field).toBeNull()
    expect(mounted).toEqual([])
  })

  it('挂一把：载荷原样交给宿主那只手（含触发词与导入载荷）', () => {
    const { ctx, mounted } = makeLoraContext()
    const field = applyOperatorStep(mountLoraStep(), ctx)
    expect(field).toBe(STUDIO_OPERATOR_FIELD_IDS.loras)
    expect(mounted).toEqual([
      {
        candidateId: 'civitai:12345:67890',
        name: 'Watercolor Storybook',
        weight: 0.7,
        triggerWords: ['watercolor'],
      },
    ])
  })

  /**
   * ⭐ 撤销挂载按 **candidateId** 反查，⛔ 不是库记录 id：后者是客户端导入那一跳
   * 才产生的，服务端给不出（与 `import_user_url` 的「源地址 → 落地地址」同构）。
   */
  it('撤销挂载：按 candidateId 反查那一把并摘掉', () => {
    const { ctx, unmountedByCandidate } = makeLoraContext()
    revertOperatorStep(mountLoraStep(), ctx)
    expect(unmountedByCandidate).toEqual(['civitai:12345:67890'])
  })

  it('摘一把 / 撤销摘除：撤销挂回**改前那个权重**，不是默认值', () => {
    const { ctx, unmountedById, remounted } = makeLoraContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
      payload: { loraId: 'lora-1', name: 'Ink Lines' },
      inverse: { loraId: 'lora-1', weight: 0.8 },
    } as unknown as AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBe(STUDIO_OPERATOR_FIELD_IDS.loras)
    expect(unmountedById).toEqual(['lora-1'])

    revertOperatorStep(step, ctx)
    expect(remounted).toEqual([{ loraId: 'lora-1', weight: 0.8 }])
  })

  it('调权重：应用用 payload 的数，撤销用 inverse 的数', () => {
    const { ctx, weights } = makeLoraContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
      payload: { loraId: 'lora-1', name: 'Ink Lines', weight: 1.2 },
      inverse: { loraId: 'lora-1', weight: 0.8 },
    } as unknown as AssistantOperatorAppliedStep

    applyOperatorStep(step, ctx)
    revertOperatorStep(step, ctx)
    expect(weights).toEqual([
      { loraId: 'lora-1', weight: 1.2 },
      { loraId: 'lora-1', weight: 0.8 },
    ])
  })

  /**
   * ⚠ 宿主没有 `lora` 这组手时**整步不记账**（返回 null），⛔ 不是「记了账但什么
   * 都没做」—— 后者的表现是 ✦ 亮着、点了没反应，本仓最难查的那一类。
   * 运行时到不了这里（域工具表 + 服务端硬闸两道），这条用例锁的是那个兜底形状。
   */
  it('宿主没有挂载栈时整步不记账（⛔ 不留一枚点了没反应的 ✦）', () => {
    const { ctx } = makeContext()
    expect(applyOperatorStep(mountLoraStep(), ctx)).toBeNull()
    // 撤销同理：不抛、不改任何别的字段。
    expect(() => revertOperatorStep(mountLoraStep(), ctx)).not.toThrow()
  })

  it('hover 显示的是**名字**与改前那个权重，不是候选 id', () => {
    expect(describeOperatorInverse(mountLoraStep())).toBe(
      'Watercolor Storybook',
    )
    expect(
      describeOperatorInverse({
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
        payload: { loraId: 'lora-1', name: 'Ink Lines', weight: 1.2 },
        inverse: { loraId: 'lora-1', weight: 0.8 },
      } as unknown as AssistantOperatorAppliedStep),
    ).toBe('0.8')
  })
})
