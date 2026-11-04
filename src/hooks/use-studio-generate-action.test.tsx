import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  appendOperatorPendingResult,
  claimOperatorThreadScope,
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import {
  modelPickerGateKey,
  resetModelPickerGate,
  setPendingModel,
  subscribeModelPickerOpen,
} from '@/lib/model-picker-gate'
import { apiKeyRecord, runIdleTasksImmediately } from '@/test/api-keys'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderHookWithStudio,
  settle,
} from '@/test/studio-harness'
import type { StudioGenerateRequest } from '@/types'

import { useStudioGenerateAction } from './use-studio-generate-action'

/**
 * `useStudioGenerateAction` 是**两个**生成按钮共用的那份闸门与请求组装
 * （桌面参数栏底部那颗 + 移动端 composer 的 44×44 方形键）。这里锁的就是
 * 「两处共用」这件事的判据本身：缺什么 → 哪一条 `blockedReason`，
 * 不缺 → 发出去的出图请求长什么样。
 *
 * 全程真工作台：真 `StudioProvider`（真表单 reducer、真 `useUnifiedGenerate`）、
 * 真 `ApiKeysProvider`、真型号目录；只假 api-client 上「出图」那一跳
 * （`studioGenerateAPI`，断言它收到的请求）与 key 名单那条接口。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
// 默认型号自动补位只在 `/studio/image` 上开火 —— 这里要「没选模型」那一档，换个路由。
vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/studio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio',
  useRouter: () => ({ push: vi.fn() }),
}))

/** 被挡住时说的那一句：用户看到的是这条 toast（sonner 是项目外的包）。 */
const toastInfo = vi.hoisted(() => vi.fn())
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>()
  return {
    ...actual,
    toast: Object.assign(vi.fn(), {
      ...actual.toast,
      info: toastInfo,
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
    }),
  }
})

/** 出图那一跳：记下请求，回一个失败（⛔ 不进轮询）。 */
const studioGenerateAPI = vi.hoisted(() =>
  vi.fn(
    async (
      ...request: [unknown]
    ): Promise<{ success: false; error: string }> => {
      void request
      return { success: false, error: 'stop here' }
    },
  ),
)
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  studioGenerateAPI,
}))

const FLARE = AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE
const GPT2 = AI_MODELS.OPENAI_GPT_IMAGE_2
const SUNBURST = AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST
const SEEDREAM = AI_MODELS.SEEDREAM_50_PRO
const NAI_FULL = AI_MODELS.NOVELAI_V45_FULL
const NAI_CURATED = AI_MODELS.NOVELAI_V45_CURATED
const NANO_BANANA = AI_MODELS.GEMINI_NANO_BANANA_21

/** 她配过的 key：每一把都绑在一个型号上，选项 id 是 `key:<id>`。 */
const KEYS = [
  apiKeyRecord({
    id: 'k-flare',
    modelId: FLARE,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  }),
  apiKeyRecord({
    id: 'k-gpt2',
    modelId: GPT2,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  }),
  apiKeyRecord({
    id: 'k-nai',
    modelId: NAI_FULL,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
  }),
]
const SAVED = (keyId: string) => `key:${keyId}`
const WORKSPACE = (modelId: string) => `workspace:${modelId}`

const requests = () =>
  studioGenerateAPI.mock.calls.map(
    ([request]) => request as StudioGenerateRequest,
  )

type Bench = ReturnType<typeof renderAction>

function renderAction() {
  const view = renderHookWithStudio(() => useStudioGenerateAction())
  return {
    ...view,
    action: () => view.result.current.value,
    dispatch: view.result.current.studio.dispatch,
  }
}

/** 挂上工作台、等 key 名单回来，再把表单摆好。 */
async function bench(
  setup: (dispatch: Bench['dispatch']) => void = () => {},
): Promise<Bench> {
  const view = renderAction()
  await settle()
  act(() => setup(view.dispatch))
  return view
}

function pick(
  dispatch: Bench['dispatch'],
  optionId: string,
  prompt?: string,
  extras: string[] = [],
) {
  dispatch({ type: 'SET_OPTION_ID', payload: optionId })
  if (prompt !== undefined) dispatch({ type: 'SET_PROMPT', payload: prompt })
  for (const id of extras) dispatch({ type: 'TOGGLE_EXTRA_MODEL', payload: id })
}

async function generate(view: Bench) {
  await act(async () => {
    await view.action().handleGenerate()
  })
  await settle()
}

const state = (view: Bench) => view.result.current.studio.state

beforeEach(() => {
  window.localStorage.clear()
  resetModelPickerGate()
  studioGenerateAPI.mockClear()
  toastInfo.mockClear()
  runIdleTasksImmediately()
  fakeStudioServer().on('GET', API_ENDPOINTS.API_KEYS, () =>
    Response.json({ success: true, data: KEYS }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('useStudioGenerateAction', () => {
  it('REQUEST_GENERATE传递提交身份，切到新对话时不使用新表单生成', async () => {
    claimOperatorThreadScope('user-a:image-natural', 'image')
    resetOperatorThread()
    appendOperatorPendingResult({ id: 'request-owned', total: 1 })
    const owner = {
      threadScope: 'user-a:image-natural',
      localThreadId: getOperatorState().localThreadId,
      pendingResultId: 'request-owned',
    }
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat'),
    )
    act(() => view.dispatch({ type: 'REQUEST_GENERATE', owner }))
    await settle()
    expect(requests()).toHaveLength(1)
    expect(requests()[0]).toMatchObject({ modelId: FLARE, freePrompt: 'a cat' })

    act(() => {
      resetOperatorThread()
      appendOperatorPendingResult({ id: 'request-new', total: 1 })
    })
    act(() => {
      view.dispatch({ type: 'SET_PROMPT', payload: 'new thread prompt' })
      view.dispatch({ type: 'REQUEST_GENERATE', owner })
    })
    await settle()
    // 旧对话的那一枪落不到新对话上：⛔ 拿新表单再发一次。
    expect(requests()).toHaveLength(1)
  })

  it('blocks a missing image mention without submitting a generation', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'Use @Image2'),
    )
    expect(view.action().canGenerate).toBe(false)
    expect(view.action().blockedReason?.message).toBe(
      text('StudioPromptArea.referenceMention.invalid'),
    )
    await generate(view)
    expect(requests()).toHaveLength(0)
  })

  it('blocks with modelRequired when no model is selected', async () => {
    const view = await bench((dispatch) =>
      dispatch({ type: 'SET_PROMPT', payload: 'a cat' }),
    )
    expect(view.action().canGenerate).toBe(false)
    expect(view.action().blockedReason?.message).toBe(
      text('StudioPromptArea.blocked.modelRequired'),
    )
  })

  it('blocks with promptRequired when the prompt is empty', async () => {
    const view = await bench((dispatch) => pick(dispatch, SAVED('k-flare')))
    expect(view.action().blockedReason?.message).toBe(
      text('StudioPromptArea.blocked.promptRequired'),
    )
    // 空提示词那条要把焦点送回输入框（桌面与移动端共用这一份判据）。
    expect(view.action().blockedReason?.focusPrompt).toBe('now')
  })

  it('clears the block and submits once model + prompt are both present', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat'),
    )
    expect(view.action().blockedReason).toBeNull()
    expect(view.action().canGenerate).toBe(true)

    await generate(view)

    expect(requests()).toHaveLength(1)
    expect(requests()[0]).toMatchObject({
      modelId: FLARE,
      apiKeyId: 'k-flare',
      freePrompt: 'a cat',
    })
  })

  it('surfaces the blocked reason as a toast instead of silently doing nothing', async () => {
    const view = await bench((dispatch) => pick(dispatch, SAVED('k-flare')))
    await generate(view)
    expect(requests()).toHaveLength(0)
    expect(toastInfo).toHaveBeenCalledWith(
      text('StudioPromptArea.blocked.promptRequired'),
    )
  })

  it('carries the whole run list only when more than one model is picked', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat', [SAVED('k-gpt2')]),
    )
    expect(view.action().runModels).toHaveLength(2)

    await generate(view)

    // 矩阵逐格发：两个型号各一枪，各自带自己的 key。
    expect(
      requests().map(({ modelId, apiKeyId }) => ({ modelId, apiKeyId })),
    ).toEqual([
      { modelId: FLARE, apiKeyId: 'k-flare' },
      { modelId: GPT2, apiKeyId: 'k-gpt2' },
    ])
  })

  it('先搜再画：开着且型号支持才带上，参数里残留的那一位不算数', async () => {
    const view = await bench((dispatch) => {
      pick(dispatch, WORKSPACE(NANO_BANANA), 'Taipei 101')
      dispatch({ type: 'SET_SEARCH_GROUNDING', payload: true })
    })
    await generate(view)
    expect(requests()[0]?.advancedParams).toEqual({ searchGrounding: true })

    // 关着：即便「做同款」把这一位写回了参数，也不发。
    act(() => {
      view.dispatch({ type: 'SET_SEARCH_GROUNDING', payload: false })
      view.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: { searchGrounding: true },
      })
    })
    await generate(view)
    expect(requests()[1]?.advancedParams).toBeUndefined()

    // 不支持的型号：开着也不发。
    act(() => {
      view.dispatch({ type: 'SET_OPTION_ID', payload: SAVED('k-flare') })
      view.dispatch({ type: 'SET_SEARCH_GROUNDING', payload: true })
    })
    await generate(view)
    expect(requests()[2]?.modelId).toBe(FLARE)
    expect(requests()[2]?.advancedParams).toBeUndefined()
  })

  // ⛔ 不跨方言（D10 ② Q3）：跨台留下来的陈旧选择不进这一轮的名单。
  it('drops a model from the other dialect', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat', [SAVED('k-nai')]),
    )
    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      SAVED('k-flare'),
    ])
  })

  it('keeps only the tag-dialect models on the tag workbench', async () => {
    const view = await bench((dispatch) => {
      dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
      pick(dispatch, SAVED('k-nai'), '1girl', [SAVED('k-flare')])
    })
    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      SAVED('k-nai'),
    ])
  })

  /**
   * ⭐ 真机 2026-09-20 的重复计费：名单里已有的那一条再点一次走了「新增」。
   * 名单长度必须**减一**，且任何时候不出现同一条路两份。
   */
  it('toggling a model already in the run list shortens it', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat', [SAVED('k-gpt2')]),
    )
    expect(view.action().runModels).toHaveLength(2)

    // ⚠ 点的是**主模型**那一条 —— 它对 `TOGGLE_EXTRA_MODEL` 是个 no-op，
    // 「名单第一条点不掉」就是从这里来的。
    const primary = view.action().runModels[0]!
    act(() => view.action().handleToggleRunModel(primary))

    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      SAVED('k-gpt2'),
    ])
    expect(state(view).selectedOptionId).toBe(SAVED('k-gpt2'))
    expect(state(view).extraModelOptionIds).toEqual([])
  })

  it('toggling a model that is not in the run list still adds it', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat'),
    )
    const second = view
      .action()
      .modelOptions.find((o) => o.optionId === SAVED('k-gpt2'))!
    act(() => view.action().handleToggleRunModel(second))
    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      SAVED('k-flare'),
      SAVED('k-gpt2'),
    ])
  })

  it('replaces the entire family and clears its parameters even on the same provider', async () => {
    const view = await bench((dispatch) => {
      pick(dispatch, SAVED('k-flare'), 'a cat', [SAVED('k-gpt2')])
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: { quality: 'high' } })
    })
    const other = view
      .action()
      .modelOptions.find((o) => o.optionId === WORKSPACE(SEEDREAM))!
    act(() => view.action().handleToggleRunModel(other))

    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      WORKSPACE(SEEDREAM),
    ])
    expect(state(view).extraModelOptionIds).toEqual([])
    expect(state(view).advancedParams).toEqual({})
  })

  // 标签台只能单选（owner 2026-09-27）：同系列点一行 = 换成它，参数不归零。
  it('replaces the run list with one model and keeps same-family parameters', async () => {
    const view = await bench((dispatch) => {
      pick(dispatch, SAVED('k-flare'), 'a cat', [SAVED('k-gpt2')])
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: { quality: 'high' } })
    })
    const third = view
      .action()
      .modelOptions.find((o) => o.optionId === WORKSPACE(SUNBURST))!
    act(() => view.action().handleReplaceRunModel(third))

    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      WORKSPACE(SUNBURST),
    ])
    expect(state(view).advancedParams).toEqual({ quality: 'high' })
  })

  it('runs a single model on the tag studio even with extras left over', async () => {
    const view = await bench((dispatch) => {
      dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
      pick(dispatch, SAVED('k-nai'), '1girl', [WORKSPACE(NAI_CURATED)])
    })
    expect(view.action().runModels.map((model) => model.optionId)).toEqual([
      SAVED('k-nai'),
    ])
  })

  it('excludes stale cross-family selections from the generation request', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat', [WORKSPACE(SEEDREAM)]),
    )
    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      SAVED('k-flare'),
    ])
    await generate(view)
    // 只跑主模型：一枪、只发它。
    expect(requests().map((request) => request.modelId)).toEqual([FLARE])

    act(() => view.action().handleRemoveRunModel(SAVED('k-flare')))
    expect(state(view).selectedOptionId).toBeNull()
    expect(view.action().runModels).toEqual([])
  })

  // 同一条路的两个 optionId 若仍旧溜进 state，出图名单也只认一条 —— 算钱、
  // 裁剪 payload、画 chip 读的都是它。
  it('never runs the same route twice', async () => {
    const view = await bench((dispatch) =>
      pick(dispatch, SAVED('k-flare'), 'a cat', [WORKSPACE(FLARE)]),
    )
    expect(view.action().runModels.map((o) => o.optionId)).toEqual([
      SAVED('k-flare'),
    ])
  })

  // 标签台那一枪要带着方言出门，翻译才发生在发请求那一跳。
  it('tells the generator which dialect the prompt came from', async () => {
    const view = await bench((dispatch) => {
      dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
      pick(dispatch, SAVED('k-nai'), '1girl, rain:1.2')
    })
    await generate(view)

    // 标签串的权重写法按 NovelAI 的语法翻过再发（⛔ 原样带着 `rain:1.2` 出门）。
    expect(requests()[0]?.freePrompt).not.toContain('rain:1.2')
    expect(requests()[0]?.freePrompt).toContain('rain')
  })
})

/**
 * D2 Q1（owner 2026-09-17）：没有「自动」渠道 —— 多渠道型号没点过渠道就发不出去。
 * 桌面参数栏与移动端 composer 共用这一份判据（见本文件头注）。
 */
describe('useStudioGenerateAction — 未选渠道闸门', () => {
  const ready = (dispatch: Bench['dispatch']) =>
    pick(dispatch, SAVED('k-flare'), 'a cat')

  it('型号在等渠道时不能生成，按钮上写「先选渠道」', async () => {
    const view = await bench(ready)
    act(() => setPendingModel(modelPickerGateKey('image'), SEEDREAM))

    expect(view.action().canGenerate).toBe(false)
    expect(view.action().blockedReason?.message).toBe(
      text('ModelPicker.pickChannel'),
    )
    expect(view.action().blockedReason?.action).toBe('pickChannel')
  })

  it('点这颗被挡住的按钮 → 打开选择器，⛔ 不发生成', async () => {
    const opened = vi.fn()
    subscribeModelPickerOpen(modelPickerGateKey('image'), opened)
    const view = await bench(ready)
    act(() => setPendingModel(modelPickerGateKey('image'), SEEDREAM))

    await generate(view)

    expect(opened).toHaveBeenCalledTimes(1)
    expect(requests()).toHaveLength(0)
  })

  it('选定渠道之后闸门解除', async () => {
    const view = await bench(ready)
    act(() => {
      setPendingModel(modelPickerGateKey('image'), SEEDREAM)
      setPendingModel(modelPickerGateKey('image'), null)
    })
    expect(view.action().canGenerate).toBe(true)
    expect(view.action().blockedReason).toBeNull()
  })

  /** ⚠ 画布卡的闸门带 gateId，⛔ 不能挡住工作台这一份。 */
  it('别的宿主（带 gateId）的待选渠道挡不住工作台', async () => {
    const view = await bench(ready)
    act(() => setPendingModel(modelPickerGateKey('image', 'node-a'), SEEDREAM))
    expect(view.action().canGenerate).toBe(true)
  })
})
