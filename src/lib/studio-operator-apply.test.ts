import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import type { StudioAction, StudioFormState } from '@/contexts/studio-context'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  applyOperatorStep,
  buildGenerationKnobSteps,
  describeOperatorInverse,
  fallbackGenerationValues,
  getOperatorStepField,
  revertOperatorStep,
  type StudioOperatorApplyContext,
} from '@/lib/studio-operator-apply'
import type {
  AssistantAssetWriteRevert,
  AssistantOperatorAppliedStep,
  AssistantOperatorGenerationRequest,
} from '@/types/assistant-operator'
import type { StudioOperatorGenerationControls } from '@/types/studio-assistant-operator'

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
  slots: (string | undefined)[]
  primed: { value: boolean }
  userUrls: { sourceUrl: string; domain?: string }[]
  unmounted: string[]
  audioReferences: { url: string; fileName: string; ownerName?: string }[]
  sound: { value: boolean | null }
  triggered: AssistantOperatorGenerationRequest[]
  /** 切片 Y：助手起的名字与它标过的审核态。 */
  labels: string[]
  reviewed: { assetId: string; state: string }[]
  /** commit #18：素材库四条写操作的**撤销**交出去的那份 inverse。 */
  assetWriteReverts: AssistantAssetWriteRevert[]
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
  /** 每次挂载记下**槽名**（第二期）—— 「挂到哪儿」是这一轮新加的那半件事。 */
  const slots: (string | undefined)[] = []
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
  const triggered: AssistantOperatorGenerationRequest[] = []

  const labels: string[] = []
  const reviewed: { assetId: string; state: string }[] = []
  const assetWriteReverts: AssistantAssetWriteRevert[] = []
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
    addReference: (url, slot) => {
      references.push(url)
      slots.push(slot)
    },
    removeReference: (url, slot) => {
      slots.push(slot)
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
    /** §6 花钱档：这一层只记账 —— 要验的是「谁被调、带的是不是那份载荷」。 */
    triggerGeneration: (request) => {
      triggered.push(request)
    },
    /** 切片 Y：名字与审核态同样只记账（真实实现一个落投递口、一个落 store）。 */
    setGenerationLabel: (value) => {
      labels.push(value)
    },
    setReviewState: (assetId, reviewState) => {
      reviewed.push({ assetId, state: reviewState })
    },
    /**
     * §10：这一层只记账 —— 要验的是「撤销交出去的是不是 step 上那份 inverse
     * **原样**」，⛔ 不是网络。
     */
    revertAssetWrite: (input) => {
      assetWriteReverts.push(input)
    },
  }

  return {
    ctx,
    dispatched,
    state,
    references,
    slots,
    primed,
    userUrls,
    unmounted,
    audioReferences,
    sound,
    triggered,
    labels,
    reviewed,
    assetWriteReverts,
  }
}

const BASE = { id: 'step-1', title: '一步', status: 'done' } as const

describe('applyOperatorStep', () => {
  it('set_specs 一次下两个 dispatch —— 比例与清晰度必须同时到（台账 AE/BG/BS）', () => {
    const { ctx, dispatched, state } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      verb: 'apply',
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

  it('applies and restores GPT image quality, transparency and preview without clearing unrelated settings', () => {
    const { ctx, state } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      verb: 'apply',
      payload: {
        aspectRatio: '1:1',
        resolution: '2K',
        quality: 'max',
        background: 'transparent',
        preview: true,
      },
      inverse: {
        aspectRatio: '1:1',
        resolution: 'auto',
        quality: null,
        background: null,
        preview: null,
      },
    } satisfies AssistantOperatorAppliedStep
    applyOperatorStep(step, ctx)
    expect(state.advancedParams).toMatchObject({
      seed: 1234,
      quality: 'max',
      background: 'transparent',
      preview: true,
    })
    revertOperatorStep(step, ctx)
    expect(state.advancedParams.quality).toBeUndefined()
    expect(state.advancedParams.background).toBeUndefined()
    expect(state.advancedParams.preview).toBeUndefined()
    expect(state.advancedParams.seed).toBe(1234)
  })

  it('set_specs 的值不在收窄表里就整条不落，绝不 as 过去', () => {
    const { ctx, dispatched } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      verb: 'apply',
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
      verb: 'apply',
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
        verb: 'apply',
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
          verb: 'apply',
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
        verb: 'apply',
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
        verb: 'apply',
        payload: { count: 4 },
        inverse: { count: 1 },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toEqual([{ type: 'SET_IMAGE_BATCH_COUNT', payload: 4 }])
  })

  /**
   * 换模型带渠道（进度表 10 + 21）—— 这一层只验**分派**：渠道那三条判据住宿主，
   * ⛔ 不在这里复算（复算一遍就有第二份会漂的真值）。
   */
  it('宿主接了渠道那只手时整件事交给它 —— 连缺省（没指定渠道）也交过去', () => {
    const { ctx, dispatched } = makeContext()
    const calls: { modelId: string | null; channelId: string | null }[] = []
    const withChannel: StudioOperatorApplyContext = {
      ...ctx,
      selectModelChannel: (input) => {
        calls.push(input)
        return true
      },
    }
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      verb: 'apply',
      payload: { modelId: 'known-model', channelId: 'saved:known-model' },
      inverse: { modelId: 'old-model', channelId: 'workspace:old-model' },
    } satisfies AssistantOperatorAppliedStep
    expect(applyOperatorStep(step, withChannel)).toBe(
      STUDIO_OPERATOR_FIELD_IDS.model,
    )
    // ⛔ 这一层不自己 dispatch —— 切不切、切到哪条由宿主说了算。
    expect(dispatched).toHaveLength(0)
    expect(calls).toEqual([
      { modelId: 'known-model', channelId: 'saved:known-model' },
    ])

    revertOperatorStep(step, withChannel)
    // ⭐ 撤销连渠道一起回去：回到型号却换了条路，价钱就变了。
    expect(calls.at(-1)).toEqual({
      modelId: 'old-model',
      channelId: 'workspace:old-model',
    })
  })

  it('「进了先选渠道态」也算落成 —— 它在触发器上看得见，要撤得掉', () => {
    const { ctx } = makeContext()
    const withChannel: StudioOperatorApplyContext = {
      ...ctx,
      // 多渠道且没点过：宿主什么都不切，只记下型号 —— 仍然回 true。
      selectModelChannel: () => true,
    }
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
          verb: 'apply',
          payload: { modelId: 'multi-channel-model' },
          inverse: { modelId: null },
        } satisfies AssistantOperatorAppliedStep,
        withChannel,
      ),
    ).toBe(STUDIO_OPERATOR_FIELD_IDS.model)
  })

  it('宿主没接那只手时回落到老路 —— 行为与改动之前逐字相同', () => {
    const { ctx, dispatched } = makeContext()
    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
        verb: 'apply',
        payload: { modelId: 'known-model', channelId: 'saved:known-model' },
        inverse: { modelId: null },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toEqual([
      { type: 'SET_OPTION_ID', payload: 'workspace:known-model' },
    ])
  })

  /** 摘一张（进度表 21）—— 与挂载共用那两只手，撤销把它原样挂回同一个槽。 */
  it('unmount_reference 摘掉那一张，撤销挂回同一个槽', () => {
    const { ctx, references, slots } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.unmountReference,
      verb: 'apply',
      payload: { url: 'https://cdn.example.com/a.png', slot: 'reference' },
      inverse: { url: 'https://cdn.example.com/a.png', slot: 'reference' },
    } satisfies AssistantOperatorAppliedStep
    ctx.addReference('https://cdn.example.com/a.png')
    expect(references).toEqual(['https://cdn.example.com/a.png'])

    expect(applyOperatorStep(step, ctx)).toBe(
      STUDIO_OPERATOR_FIELD_IDS.references,
    )
    expect(references).toEqual([])

    revertOperatorStep(step, ctx)
    expect(references).toEqual(['https://cdn.example.com/a.png'])
    // ⚠ 槽一路带着：摘首帧与摘一张普通参考在客户端是两个动作。
    expect(slots.at(-1)).toBe('reference')
  })

  it('清一个帧槽：槽名原样带到两侧', () => {
    const { ctx, slots } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.unmountReference,
      verb: 'apply',
      payload: { url: 'https://cdn.example.com/first.png', slot: 'first' },
      inverse: { url: 'https://cdn.example.com/first.png', slot: 'first' },
    } satisfies AssistantOperatorAppliedStep
    applyOperatorStep(step, ctx)
    expect(slots.at(-1)).toBe('first')
    revertOperatorStep(step, ctx)
    expect(slots.at(-1)).toBe('first')
  })

  /**
   * 专属 chip（进度表 21）—— 三件事：整体替换不吞别的键、撤销回得到「没设过」、
   * 撤销回得到旧值。
   */
  it('set_capability 并进 advancedParams —— ⛔ 不吞用户调好的 seed', () => {
    const { ctx, dispatched, state } = makeContext()
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
          verb: 'apply',
          payload: { key: 'quality', value: 'high' },
          inverse: { key: 'quality', value: null },
        } satisfies AssistantOperatorAppliedStep,
        ctx,
      ),
    ).toBe(STUDIO_OPERATOR_FIELD_IDS.capabilities)
    expect(dispatched).toEqual([
      {
        type: 'SET_ADVANCED_PARAMS',
        payload: { seed: 1234, resolution: 'auto', quality: 'high' },
      },
    ])
    expect(state.advancedParams).toMatchObject({ seed: 1234, quality: 'high' })
  })

  it('⭐ 撤销回 null = **把那个键删掉**，⛔ 不是写一个缺省值进去', () => {
    const { ctx, state } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
      verb: 'apply',
      payload: { key: 'quality', value: 'high' },
      inverse: { key: 'quality', value: null },
    } satisfies AssistantOperatorAppliedStep
    applyOperatorStep(step, ctx)
    revertOperatorStep(step, ctx)
    expect(state.advancedParams).not.toHaveProperty('quality')
    expect(state.advancedParams).toMatchObject({ seed: 1234 })
    // hover 里那句「原来是空的」—— 三态要说得出「没设过」。
    expect(describeOperatorInverse(step)).toBe('')
  })

  it('撤销回旧值：设过的那一格回到设之前那个数', () => {
    const { ctx, state } = makeContext({
      advancedParams: { seed: 1234, guidanceScale: 7 },
    } as Partial<StudioFormState>)
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
      verb: 'apply',
      payload: { key: 'guidanceScale', value: 12 },
      inverse: { key: 'guidanceScale', value: 7 },
    } satisfies AssistantOperatorAppliedStep
    applyOperatorStep(step, ctx)
    expect(state.advancedParams).toMatchObject({ guidanceScale: 12 })
    revertOperatorStep(step, ctx)
    expect(state.advancedParams).toMatchObject({ guidanceScale: 7, seed: 1234 })
    expect(describeOperatorInverse(step)).toBe('7')
  })

  it('登记簿记在专属那一格 —— ⛔ 不与规格共用（还原规格不该撤掉 guidance）', () => {
    expect(
      getOperatorStepField({
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
        verb: 'apply',
        payload: { key: 'quality', value: 'high' },
        inverse: { key: 'quality', value: null },
      } satisfies AssistantOperatorAppliedStep),
    ).toBe(STUDIO_OPERATOR_FIELD_IDS.capabilities)
  })

  it('prime_generate 只点亮生成键 —— 一个 dispatch 都不发（钱闸）', () => {
    const { ctx, dispatched, primed } = makeContext()
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          verb: 'request_generation',
          payload: { primed: true },
          inverse: { primed: false },
        } satisfies AssistantOperatorAppliedStep,
        ctx,
      ),
    ).toBeNull()
    expect(primed.value).toBe(true)
    expect(dispatched).toHaveLength(0)
  })

  /**
   * §6 花钱档 —— **客户端扣扳机**那一跳。
   *
   * ⭐ 钉的是「它把服务端那份载荷原样交给宿主」：卡上写的、发出去的、日志里记的
   * 必须是同一个对象。
   * ⭐ 同时钉「它不动表单一格」：返回 `null` = 不进登记簿、不算进 checkpoint 的
   * 「已改 N 项」—— 登记簿里的每一条都配着一个 `inverse`，而这一条撤不掉。
   */
  it('⭐ request_generation 把载荷原样交给宿主，且一格表单都不动', () => {
    const { ctx, dispatched, triggered, primed } = makeContext()
    const payload = {
      model: { id: 'seedream-4', label: 'Seedream 4' },
      count: 2,
      specs: {
        aspectRatio: '1:1',
        resolution: '2K',
        durationSeconds: null,
      },
      estimate: { credits: 6, model: 'Seedream 4', count: 2 },
    }
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
          verb: 'request_generation',
          payload,
        } satisfies AssistantOperatorAppliedStep,
        ctx,
      ),
    ).toBeNull()
    expect(triggered).toEqual([payload])
    expect(dispatched).toHaveLength(0)
    // ⛔ 它不顺手点亮生成键：那是 `prime_generate` 的活，两条工具各撤各的。
    expect(primed.value).toBe(false)
  })

  /**
   * ⛔ **撤不掉，也不假装撤得掉**。这条用例是写给下一个「顺手补一个 inverse」
   * 的人看的：钱花出去了，客户端这一侧没有任何动作能收回来。
   */
  it('⛔ 撤销 request_generation 什么都不做（钱退不回来）', () => {
    const { ctx, dispatched, triggered, primed } = makeContext()
    revertOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
        verb: 'request_generation',
        payload: {
          model: { id: 'seedream-4', label: 'Seedream 4' },
          count: 1,
          specs: { aspectRatio: null, resolution: null, durationSeconds: null },
        },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(triggered).toHaveLength(0)
    expect(dispatched).toHaveLength(0)
    expect(primed.value).toBe(false)
  })

  it('宿主没有生成键时（装配台）静默不做，⛔ 不抛', () => {
    const { ctx, triggered } = makeContext()
    const withoutTrigger = { ...ctx, triggerGeneration: undefined }
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
          verb: 'request_generation',
          payload: {
            model: { id: 'seedream-4', label: 'Seedream 4' },
            count: 1,
            specs: {
              aspectRatio: null,
              resolution: null,
              durationSeconds: null,
            },
          },
        } satisfies AssistantOperatorAppliedStep,
        withoutTrigger,
      ),
    ).toBeNull()
    expect(triggered).toHaveLength(0)
  })

  it('读类工具不产生任何改动', () => {
    const { ctx, dispatched } = makeContext()
    expect(
      applyOperatorStep(
        {
          ...BASE,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          verb: 'look',
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
        verb: 'apply',
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
        verb: 'apply',
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
        verb: 'apply',
        payload: { modelId: 'known-model' },
        inverse: { modelId: null },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(dispatched).toEqual([{ type: 'SET_OPTION_ID', payload: null }])
  })

  it('参考图按 payload 里的 URL 摘除 —— inverse 只有 assetId，摘不动', () => {
    const { ctx, references, slots } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
      verb: 'apply',
      payload: {
        assetId: 'asset-1',
        url: 'https://cdn.example.com/a.png',
        kind: 'image',
        slot: 'reference',
      },
      inverse: { assetId: 'asset-1', slot: 'reference' },
    } satisfies AssistantOperatorAppliedStep

    applyOperatorStep(step, ctx)
    expect(references).toEqual(['https://cdn.example.com/a.png'])
    revertOperatorStep(step, ctx)
    expect(references).toEqual([])
    // 挂与摘各带一次槽名 —— 撤销那一侧读的是 `inverse.slot`（第二期）。
    expect(slots).toEqual(['reference', 'reference'])
  })

  /**
   * 具名槽（第二期 · 视频域）：`slot` 一路原样传到宿主那只手上。
   * ⭐ 这里锁的是**「挂到哪儿」不许在中途丢失** —— 丢了的表现是「助手说换了尾帧，
   * 画面上换的是首帧」，而两张图看上去都很合理，没人查得出来。
   */
  it.each([['first'], ['last'], ['video']] as const)(
    'mount_reference 把 slot=%s 原样交给宿主，撤销读 inverse.slot',
    (slot) => {
      const { ctx, slots } = makeContext()
      const step = {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
        verb: 'apply',
        payload: {
          assetId: 'asset-1',
          url: 'https://cdn.example.com/a.mp4',
          kind: slot === 'video' ? 'video' : 'image',
          slot,
        },
        inverse: { assetId: 'asset-1', slot },
      } satisfies AssistantOperatorAppliedStep

      applyOperatorStep(step, ctx)
      revertOperatorStep(step, ctx)
      expect(slots).toEqual([slot, slot])
    },
  )

  // ── 视频域（P4-A）──────────────────────────────────────────────
  it('set_video_specs 三格一起落，且各走各的收窄谓词（不复用图片那张 auto/1K/2K 表）', () => {
    const { ctx, dispatched } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
      verb: 'apply',
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
        verb: 'apply',
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
        verb: 'apply',
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
      verb: 'apply',
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
      verb: 'apply',
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
        verb: 'request_generation',
        payload: { primed: true },
        inverse: { primed: false },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(primed.value).toBe(false)
  })

  /**
   * 切片 Y —— 名字透传与审核态。钉四件：
   *  ① `prime_generate` 带名字时落到投递口；
   *  ② `request_generation` **先落名字再扣扳机**（顺序反了这一枪带的是上一次的名字）；
   *  ③ 没给名字时 ⛔ 不清掉上一次的（模型常常先定名、再改参数、最后空着 label 发）；
   *  ④ `set_review_state` 落 store 且**不进登记簿**（它一格旋钮都没动）。
   */
  it('prime_generate / request_generation 的 label 落到投递口，⛔ 空 label 不清名字', () => {
    const { ctx, labels, triggered } = makeContext()
    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
        verb: 'request_generation',
        payload: { primed: true, label: '银发少女立绘' },
        inverse: { primed: false },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(labels).toEqual(['银发少女立绘'])

    // ⛔ 空着 label 的那一枪不覆盖上一次定的名字。
    applyOperatorStep(
      {
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
        verb: 'request_generation',
        payload: {
          model: { id: 'seedream-4', label: 'Seedream 4' },
          count: 1,
          specs: { aspectRatio: null, resolution: null, durationSeconds: null },
        },
      } satisfies AssistantOperatorAppliedStep,
      ctx,
    )
    expect(labels).toEqual(['银发少女立绘'])
    expect(triggered).toHaveLength(1)
  })

  it('set_review_state 落到宿主，且不进登记簿（它没动表单的任何一格）', () => {
    const { ctx, reviewed, dispatched } = makeContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
      verb: 'apply',
      payload: { assetId: 'gen-9', state: 'blocked', reason: '手指糊了' },
      inverse: { assetId: 'gen-9', state: 'pending' },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBeNull()
    expect(reviewed).toEqual([{ assetId: 'gen-9', state: 'blocked' }])
    expect(dispatched).toHaveLength(0)

    // ⛔ 撤销链不碰它 —— 改回去的入口是结果格上那两颗动作。
    revertOperatorStep(step, ctx)
    expect(reviewed).toHaveLength(1)
  })
})

describe('getOperatorStepField / describeOperatorInverse', () => {
  it('比例与清晰度共用 specs 一格 —— 分开撤会撤出没存在过的组合', () => {
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
      verb: 'apply',
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
        verb: 'request_generation',
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
        verb: 'apply',
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
    verb: 'apply',
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
        verb: 'request_generation',
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
      mount: async ({ candidateId, name, weight, triggerWords }) => {
        mounted.push({ candidateId, name, weight, triggerWords })
        return {
          status: 'ok',
          imported: true,
          mounted: true,
          triggerWordsApplied: triggerWords.length > 0,
        }
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
    verb: 'apply',
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
        verb: 'apply',
        payload: { loraId: 'lora-1', name: 'Ink Lines' },
        inverse: { loraId: 'lora-1', weight: 0.8 },
      } as unknown as AssistantOperatorAppliedStep),
    ).toBe(STUDIO_OPERATOR_FIELD_IDS.loras)
    expect(
      getOperatorStepField({
        ...BASE,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
        verb: 'apply',
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
        verb: 'research',
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

  it('applies and undoes LoRA parameters through the host parameter setter', () => {
    const { ctx } = makeLoraContext()
    const setParameters = vi.fn()
    ctx.lora!.setParameters = setParameters
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters,
      verb: 'apply',
      payload: { steps: 28, guidanceScale: 6, runnerSeed: '42' },
      inverse: { steps: 25, guidanceScale: 7, runnerSeed: null },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBe(STUDIO_OPERATOR_FIELD_IDS.specs)
    expect(setParameters).toHaveBeenNthCalledWith(1, step.payload)
    revertOperatorStep(step, ctx)
    expect(setParameters).toHaveBeenNthCalledWith(2, step.inverse)
  })

  it('does not record a parameter change when the host cannot apply it', () => {
    const { ctx } = makeLoraContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters,
      verb: 'apply',
      payload: { steps: 28 },
      inverse: { steps: null },
    } satisfies AssistantOperatorAppliedStep

    expect(applyOperatorStep(step, ctx)).toBeNull()
    expect(() => revertOperatorStep(step, ctx)).not.toThrow()
  })

  it('摘一把 / 撤销摘除：撤销挂回**改前那个权重**，不是默认值', () => {
    const { ctx, unmountedById, remounted } = makeLoraContext()
    const step = {
      ...BASE,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
      verb: 'apply',
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
      verb: 'apply',
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
        verb: 'apply',
        payload: { loraId: 'lora-1', name: 'Ink Lines', weight: 1.2 },
        inverse: { loraId: 'lora-1', weight: 0.8 },
      } as unknown as AssistantOperatorAppliedStep),
    ).toBe('0.8')
  })
})

/**
 * ─── 生成确认卡的就地改参数（v2 §5，commit #9）─────────────────────────
 *
 * 钉两件事：
 *  ① `fallbackGenerationValues` —— 换模型之后不合法的值回落到该模型第一档，
 *    并**说清动了哪几颗**（卡上那行「已按 X 调整」）；
 *  ② `buildGenerationKnobSteps` —— 一次旋钮改动翻译成那几条 step，
 *    `inverse` 一律是**改之前**那份（撤销的本钱）。
 */

const CHOICES = {
  aspectRatios: ['1:1', '16:9'],
  resolutions: ['1K', '2K'],
  counts: [1, 2, 4],
}

const CONTROLS: StudioOperatorGenerationControls = {
  model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
  models: [
    { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
    { id: 'seedream-4', label: 'Seedream 4' },
  ],
  aspectRatio: '4:3',
  resolution: '4K',
  count: 4,
  choicesByModel: {
    'flux-2-flash': {
      aspectRatios: ['4:3', '1:1'],
      resolutions: ['4K', '1K'],
      counts: [1, 2, 4],
    },
    'seedream-4': CHOICES,
  },
}

const KNOB_BASE = {
  domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  controls: CONTROLS,
  stepId: 'knob-1',
  title: '在确认卡上改了参数',
  reason: '你在确认卡上改的',
  advanced: { quality: undefined, preview: undefined, background: undefined },
} as const

describe('fallbackGenerationValues（§5.1 换模型 → 非法值回落）', () => {
  it('合法的一律不动，也不报「已调整」', () => {
    const result = fallbackGenerationValues(
      { aspectRatio: '16:9', resolution: '2K', count: 2 },
      CHOICES,
    )
    expect(result.values).toEqual({
      aspectRatio: '16:9',
      resolution: '2K',
      count: 2,
    })
    expect(result.adjusted).toEqual([])
  })

  it('三格都不合法 → 各自落到该模型第一档，三颗都记在「已调整」里', () => {
    const result = fallbackGenerationValues(
      { aspectRatio: '3:2', resolution: '4K', count: 3 },
      CHOICES,
    )
    expect(result.values).toEqual({
      aspectRatio: '1:1',
      resolution: '1K',
      count: 1,
    })
    expect(result.adjusted).toEqual(['aspect', 'resolution', 'count'])
  })

  it('⭐ 清晰度候选为空 = 这个模型没有这颗旋钮 → 落 `null`，⛔ 不编一个值', () => {
    const result = fallbackGenerationValues(
      { aspectRatio: '1:1', resolution: '2K', count: 1 },
      { aspectRatios: ['1:1'], resolutions: [], counts: [1] },
    )
    expect(result.values.resolution).toBeNull()
    expect(result.adjusted).toEqual(['resolution'])
  })

  it('⚠ 比例 / 张数候选为空 → 保持原值（那说明这张表压根没算出来）', () => {
    const result = fallbackGenerationValues(
      { aspectRatio: '21:9', resolution: null, count: 7 },
      { aspectRatios: [], resolutions: [], counts: [] },
    )
    expect(result.values).toEqual({
      aspectRatio: '21:9',
      resolution: null,
      count: 7,
    })
    expect(result.adjusted).toEqual([])
  })
})

describe('buildGenerationKnobSteps（§5.2 第二行：卡上改一项 → 写回工作台）', () => {
  it('换比例 → 一条 `set_specs`，两格一起下，`inverse` 是改之前那份', () => {
    const { steps, adjusted } = buildGenerationKnobSteps({
      ...KNOB_BASE,
      knob: 'aspect',
      value: '1:1',
    })
    expect(adjusted).toEqual([])
    expect(steps).toHaveLength(1)
    const step = steps[0]!
    expect(step.tool).toBe(ASSISTANT_OPERATOR_TOOL_IDS.setSpecs)
    expect(step.status).toBe('done')
    expect(step.payload).toMatchObject({ aspectRatio: '1:1', resolution: '4K' })
    expect(step).toMatchObject({
      inverse: { aspectRatio: '4:3', resolution: '4K' },
    })
  })

  it('换张数 → 一条 `set_count`（字符串进来，数字出去）', () => {
    const { steps } = buildGenerationKnobSteps({
      ...KNOB_BASE,
      knob: 'count',
      value: '2',
    })
    expect(steps).toHaveLength(1)
    expect(steps[0]!.tool).toBe(ASSISTANT_OPERATOR_TOOL_IDS.setCount)
    expect(steps[0]!.payload).toEqual({ count: 2 })
    expect(steps[0]!).toMatchObject({ inverse: { count: 4 } })
  })

  it('⭐ 换模型 → `set_model` + 回落出来的 `set_specs` / `set_count`，逐条记账', () => {
    const { steps, adjusted } = buildGenerationKnobSteps({
      ...KNOB_BASE,
      knob: 'model',
      value: 'seedream-4',
    })
    // 4:3 与 4K 在 Seedream 4 上都不合法，4 张合法 —— 于是只有规格那一条。
    expect(adjusted).toEqual(['aspect', 'resolution'])
    expect(steps.map((step) => step.tool)).toEqual([
      ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
    ])
    expect(steps[0]!.payload).toMatchObject({
      modelId: 'seedream-4',
      modelLabel: 'Seedream 4',
    })
    expect(steps[0]!).toMatchObject({ inverse: { modelId: 'flux-2-flash' } })
    expect(steps[1]!.payload).toMatchObject({
      aspectRatio: '1:1',
      resolution: '1K',
    })
  })

  it('⚠ 选中当前那一项 = 什么都没改 → 一条 step 都不落', () => {
    expect(
      buildGenerationKnobSteps({
        ...KNOB_BASE,
        knob: 'model',
        value: 'flux-2-flash',
      }).steps,
    ).toEqual([])
    expect(
      buildGenerationKnobSteps({ ...KNOB_BASE, knob: 'aspect', value: '4:3' })
        .steps,
    ).toEqual([])
  })

  it('⭐ 视频档走 `set_video_specs`（⛔ 不把图片那份载荷硬塞过去）', () => {
    const { steps } = buildGenerationKnobSteps({
      ...KNOB_BASE,
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
      knob: 'aspect',
      value: '16:9',
    })
    expect(steps[0]!.tool).toBe(ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs)
    expect(steps[0]!.payload).toEqual({
      durationSeconds: null,
      aspectRatio: '16:9',
      resolution: '4K',
    })
  })

  it('⭐ 造出来的 step 能被 `applyOperatorStep` 真的落下去，也撤得回来', () => {
    const { ctx, state, dispatched } = makeContext({ aspectRatio: '4:3' })
    const { steps } = buildGenerationKnobSteps({
      ...KNOB_BASE,
      knob: 'aspect',
      value: '1:1',
    })
    expect(applyOperatorStep(steps[0]!, ctx)).toBe(
      STUDIO_OPERATOR_FIELD_IDS.specs,
    )
    expect(dispatched).toContainEqual({
      type: 'SET_ASPECT_RATIO',
      payload: '1:1',
    })
    revertOperatorStep(steps[0]!, ctx)
    expect(state.aspectRatio).toBe('4:3')
  })
})

/**
 * **素材库四条写操作**（v2 §10，commit #18）。
 *
 * ⭐ 这一层要验的只有两件事，而它们正是这四条与其余改动型工具的全部区别：
 *  ① **应用是空操作**（后果已经落在服务端），所以表单一格都不动、登记簿不记账；
 *  ② **撤销交出去的是 step 上那份 `inverse` 原样** —— ⛔ 客户端不重算原值，
 *    算第二遍就有第二份判据（`studio-operator-apply.ts` 头注）。
 */
describe('素材库四条写操作（§10）', () => {
  const STEPS = [
    {
      ...BASE,
      verb: 'apply',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
      payload: { tags: ['线稿'], assetIds: ['a1', 'a2'] },
      inverse: {
        entries: [
          { assetId: 'a1', tags: ['线稿'] },
          { assetId: 'a2', tags: ['线稿'] },
        ],
      },
    },
    {
      ...BASE,
      verb: 'apply',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
      payload: { value: true, assetIds: ['a1', 'a2'] },
      inverse: {
        entries: [
          { assetId: 'a1', value: false },
          { assetId: 'a2', value: true },
        ],
      },
    },
    {
      ...BASE,
      verb: 'apply',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
      payload: { folderId: 'folder-1', name: '角色参考', parentId: null },
      inverse: { folderId: 'folder-1' },
    },
    {
      ...BASE,
      verb: 'apply',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
      payload: {
        targetFolderId: 'folder-1',
        targetFolderName: '角色参考',
        assetIds: ['a1', 'a2'],
      },
      inverse: {
        entries: [
          { assetId: 'a1', folderId: null },
          { assetId: 'a2', folderId: 'folder-9' },
        ],
      },
    },
  ] as unknown as AssistantOperatorAppliedStep[]

  it('应用是空操作：表单一格都不动，登记簿不记账', () => {
    for (const step of STEPS) {
      const { ctx, dispatched } = makeContext()
      expect(applyOperatorStep(step, ctx)).toBeNull()
      expect(getOperatorStepField(step)).toBeNull()
      expect(dispatched).toEqual([])
    }
  })

  it('⭐ 撤销把 step 上那份 inverse 原样交回服务端（含混合原值那一例）', () => {
    const { ctx, assetWriteReverts } = makeContext()
    for (const step of STEPS) revertOperatorStep(step, ctx)

    expect(assetWriteReverts).toEqual([
      {
        tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
        entries: [
          { assetId: 'a1', tags: ['线稿'] },
          { assetId: 'a2', tags: ['线稿'] },
        ],
      },
      {
        // ⭐ 一批里 a1 原来没收藏、a2 原来收藏着 —— 交出去的必须是这两个**原值**，
        //   ⛔ 不是一个「取反」的开关（§10 那条 ⚠）。
        tool: ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
        entries: [
          { assetId: 'a1', value: false },
          { assetId: 'a2', value: true },
        ],
      },
      {
        tool: ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
        folderId: 'folder-1',
      },
      {
        tool: ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
        entries: [
          { assetId: 'a1', folderId: null },
          { assetId: 'a2', folderId: 'folder-9' },
        ],
      },
    ])
  })

  /** ⚠ 宿主没接这只手时**静默不做**，⛔ 不抛：少一只手不该让整条撤销链断掉。 */
  it('宿主没接这只手时静默不做', () => {
    const { ctx } = makeContext()
    delete (ctx as { revertAssetWrite?: unknown }).revertAssetWrite
    for (const step of STEPS) {
      expect(() => revertOperatorStep(step, ctx)).not.toThrow()
    }
  })
})
