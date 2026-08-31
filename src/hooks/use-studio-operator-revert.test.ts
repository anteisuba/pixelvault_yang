import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import type { AssistantOperatorAppliedStep } from '@/types/assistant-operator'

/**
 * 「还原这轮」（P3-C，评价卡上那颗按钮）。
 *
 * 钉四件事：
 *  ① **只撤这一轮** —— 上一轮改的那些留在原地（否则用户点一下「还原这轮」，
 *    半小时前的工作也一起没了）；
 *  ② **倒着撤** —— 同一个字段这一轮被改过两次时，正序会停在助手的中间版本上；
 *  ③ 登记簿收尾按字段算：这个字段在别的轮还有没撤的步就留着 ✦，
 *    ⛔ 否则「标记没了、值还在」；
 *  ④ 生成键跟着熄灭 —— 撤掉了那一轮，还留一个亮着的生成键等于把人推去点一次
 *    他刚刚撤销掉的配置。
 */

const dispatch = vi.hoisted(() => vi.fn())
const removeReference = vi.hoisted(() => vi.fn())
/**
 * ⚠ `setPrimed` **必须接回真 store**：拍板 14 那条「撤完顺手把生成键熄灭」验的
 * 就是 store 里那一位。桩成空函数的话这条断言永远是「已经是 false 了」，而那正是
 * 它要防的回归。真实宿主里这只手就是 `setOperatorPrimed` 本人。
 */
const primedSink = vi.hoisted(() => ({
  set: (() => {}) as (primed: boolean) => void,
}))

/**
 * ⭐ P4-C 起落笔的那几只手**由宿主给**（`contexts/studio-operator-host.tsx`）——
 * 撤销这条链不再直接碰 `studio-context`，所以桩的也从那三个 hook 换成了宿主本身。
 * 桩宿主比桩 studio-context 更贴这一层的职责：这里验的是「撤销挑哪几条、按什么
 * 顺序撤」，不是「dispatch 长什么样」。
 */
vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: 'image',
    buildSnapshot: () => ({ prompt: '', availableModels: [] }),
    referenceLimit: 4,
    open: true,
    setOpen: () => {},
    apply: {
      getState: () => ({
        prompt: 'whatever is on screen right now',
        advancedParams: {},
      }),
      dispatch,
      resolveOptionId: () => null,
      addReference: () => {},
      removeReference,
      addAudioReference: () => {},
      removeAudioReference: () => {},
      setSound: () => {},
      mountUserUrl: () => {},
      unmountUserUrl: () => {},
      setPrimed: (primed: boolean) => primedSink.set(primed),
    },
  }),
}))

type Store = typeof import('@/hooks/use-studio-operator-store')
type RevertHook = typeof import('@/hooks/use-studio-operator-revert')

let store: Store
let revert: RevertHook

/** ⚠ 模块级单例 —— 两个模块必须在同一次 reset 之后一起 import（见 store 头注）。 */
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  store = await import('@/hooks/use-studio-operator-store')
  revert = await import('@/hooks/use-studio-operator-revert')
  // 每次 resetModules 之后 store 是新的一份实例 —— 桩宿主的那只手要接到这一份上。
  primedSink.set = store.setOperatorPrimed
})

const ROUND_A = 'run-a'
const ROUND_B = 'run-b'

function promptStep(id: string, value: string, previous: string) {
  return {
    id,
    title: `write "${value}"`,
    status: 'done',
    tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
    payload: { value, mode: 'replace' },
    inverse: { value: previous },
  } satisfies AssistantOperatorAppliedStep
}

function countStep(id: string, count: number, previous: number) {
  return {
    id,
    title: `${count} outputs`,
    status: 'done',
    tool: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
    payload: { count },
    inverse: { count: previous },
  } satisfies AssistantOperatorAppliedStep
}

const CRITIQUE_STEP = {
  id: 'step-0',
  title: 'look at what came back',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  payload: {
    imageUrl: 'https://cdn.example.com/result.png',
    goal: 'a girl under a red umbrella',
  },
  result: {
    findings: [{ ok: false, text: '雨丝糊成一片' }],
    advice: '把雨的方向写进提示词',
    borrowedVisionRoute: false,
  },
} satisfies AssistantOperatorAppliedStep

const PRIME_STEP = {
  id: 'step-3',
  title: 'arm the button',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  payload: { primed: true },
  inverse: { primed: false },
} satisfies AssistantOperatorAppliedStep

/** 上一轮改过提示词，这一轮（看完图之后）又改了提示词 + 张数 + 预填生成键。 */
function buildTwoRounds(): void {
  store.upsertOperatorStep(promptStep('step-1', 'round A prompt', ''), ROUND_A)
  store.recordOperatorChange({
    field: STUDIO_OPERATOR_FIELD_IDS.prompt,
    stepId: store.operatorStepEntryId(ROUND_A, 'step-1'),
    firstInverse: promptStep('step-1', 'round A prompt', ''),
    previousLabel: '',
  })

  store.upsertOperatorStep(CRITIQUE_STEP, ROUND_B)
  store.upsertOperatorStep(
    promptStep('step-1', 'round B prompt', 'round A prompt'),
    ROUND_B,
  )
  store.recordOperatorChange({
    field: STUDIO_OPERATOR_FIELD_IDS.prompt,
    stepId: store.operatorStepEntryId(ROUND_B, 'step-1'),
    firstInverse: promptStep('step-1', 'round B prompt', 'round A prompt'),
    previousLabel: 'round A prompt',
  })
  store.upsertOperatorStep(countStep('step-2', 4, 1), ROUND_B)
  store.recordOperatorChange({
    field: STUDIO_OPERATOR_FIELD_IDS.count,
    stepId: store.operatorStepEntryId(ROUND_B, 'step-2'),
    firstInverse: countStep('step-2', 4, 1),
    previousLabel: '1',
  })
  store.upsertOperatorStep(PRIME_STEP, ROUND_B)
  store.setOperatorPrimed(true)
}

describe('还原这轮', () => {
  it('数的是这一轮里可还原的步 —— 评价那一条不算（它什么都没改）', () => {
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    // round B 有四条 step，其中 critique_result 是读类 → 3。
    expect(result.current.countRoundChanges(ROUND_B)).toBe(3)
    expect(result.current.countRoundChanges(ROUND_A)).toBe(1)
  })

  it('倒着撤，落回上一轮的值；上一轮的改动原地不动', () => {
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    act(() => {
      result.current.revertRound(ROUND_B)
    })

    // 倒序：prime → count → prompt。
    expect(dispatch.mock.calls.map((call) => call[0])).toEqual([
      { type: 'SET_IMAGE_BATCH_COUNT', payload: 1 },
      { type: 'SET_PROMPT', payload: 'round A prompt' },
    ])

    const entries = store.getOperatorState().entries
    const undoneByRound = Object.fromEntries(
      ['a', 'b'].map((suffix) => [suffix, [] as boolean[]]),
    )
    for (const entry of entries) {
      if (entry.kind !== 'step') continue
      undoneByRound[entry.runKey === ROUND_A ? 'a' : 'b'].push(entry.undone)
    }
    // ① 只撤这一轮。
    expect(undoneByRound.a).toEqual([false])
    // 评价那一条不是可还原的步，所以不划线；另外三条全划。
    expect(undoneByRound.b).toEqual([false, true, true, true])
  })

  it('提示词在上一轮还被改着 → ✦ 留着；张数只有这一轮动过 → 清掉', () => {
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    act(() => {
      result.current.revertRound(ROUND_B)
    })

    const changes = store.getOperatorState().changes
    expect(changes[STUDIO_OPERATOR_FIELD_IDS.prompt]).toBeDefined()
    expect(changes[STUDIO_OPERATOR_FIELD_IDS.count]).toBeUndefined()
  })

  it('生成键跟着熄灭，并且只插一行系统行', () => {
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    act(() => {
      result.current.revertRound(ROUND_B)
    })

    expect(store.getOperatorState().primed).toBe(false)
    const systemLines = store
      .getOperatorState()
      .entries.filter((entry) => entry.kind === 'system')
    expect(systemLines).toHaveLength(1)
    expect(systemLines[0]).toMatchObject({ code: 'revertRound', count: 3 })
  })

  it('已经撤过的那一轮再点一次什么都不做（不插第二行系统行）', () => {
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    act(() => {
      result.current.revertRound(ROUND_B)
    })
    dispatch.mockClear()
    act(() => {
      result.current.revertRound(ROUND_B)
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(
      store.getOperatorState().entries.filter((e) => e.kind === 'system'),
    ).toHaveLength(1)
  })
})
