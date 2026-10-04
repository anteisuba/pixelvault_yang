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
const revertAssetWrite = vi.hoisted(() => vi.fn())
const deleteProjectRule = vi.hoisted(() => vi.fn())
const assetRevertEnabled = vi.hoisted(() => ({ value: true }))
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
    workspace: 'image-natural',
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
      deleteProjectRule,
      ...(assetRevertEnabled.value ? { revertAssetWrite } : {}),
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
  assetRevertEnabled.value = true
  revertAssetWrite.mockResolvedValue(true)
  deleteProjectRule.mockResolvedValue(true)
  store = await import('@/hooks/use-studio-operator-store')
  revert = await import('@/hooks/use-studio-operator-revert')
  store.claimOperatorThreadScope('account-a:image-natural', 'image')
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
    verb: 'apply',
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
    verb: 'apply',
    payload: { count },
    inverse: { count: previous },
  } satisfies AssistantOperatorAppliedStep
}

const CRITIQUE_STEP = {
  id: 'step-0',
  title: 'look at what came back',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  verb: 'look',
  payload: {
    imageUrl: 'https://cdn.example.com/result.png',
    goal: 'a girl under a red umbrella',
  },
  result: {
    findings: [{ severity: 'fail', text: '雨丝糊成一片' }],
    advice: '把雨的方向写进提示词',
    borrowedVisionRoute: false,
  },
} satisfies AssistantOperatorAppliedStep

const PRIME_STEP = {
  id: 'step-3',
  title: 'arm the button',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  verb: 'request_generation',
  payload: { primed: true },
  inverse: { primed: false },
} satisfies AssistantOperatorAppliedStep

const ASSET_STEP = {
  id: 'step-asset',
  title: 'tag asset',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
  verb: 'apply',
  payload: { tags: ['draft'], assetIds: ['asset-1'] },
  inverse: { entries: [{ assetId: 'asset-1', tags: [] }] },
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

/**
 * **记一条规则**（§10）—— 后果落在库里，表单一格没动，所以它不进登记簿。
 * ⚠ 但它照旧是可撤的一步（`inverse` 里是库记录 id），因此照旧算进「已改 N 项」。
 */
const RULE_STEP = {
  id: 'step-4',
  title: 'note the rule',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
  verb: 'apply',
  payload: {
    ruleId: 'rule-9',
    scope: null,
    workspaceKey: 'image-natural',
    text: '输出一律不加水印',
    kind: 'note',
    source: 'assistant',
    createdAt: '2026-09-12T10:00:00.000Z',
  },
  inverse: { ruleId: 'rule-9' },
} satisfies AssistantOperatorAppliedStep

describe('checkpoint 薄卡的「已改 N 项：××」', () => {
  /**
   * 2026-09-12 实测第 9 步：记一条规则之后薄卡上写着「已改 1 项：」——冒号后面
   * 空着。数来自「可撤的步」，名字来自登记簿，而这一步进得了前者进不了后者。
   */
  it('记规则那一步有数也有名字，⛔ 冒号后面不留空', () => {
    store.upsertOperatorStep(RULE_STEP, ROUND_A)
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    expect(result.current.countRoundChanges(ROUND_A)).toBe(1)
    expect(result.current.roundChangeLabelKeys(ROUND_A)).toEqual([
      'changeSubject.rule',
    ])
  })

  it('撤销的本钱还在 —— inverse 里是库记录 id', () => {
    store.upsertOperatorStep(RULE_STEP, ROUND_A)
    const entry = store
      .getOperatorState()
      .entries.find((item) => item.kind === 'step')
    const step = entry?.kind === 'step' ? entry.step : null
    expect(
      step?.tool === ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule &&
        step.status === 'done'
        ? step.inverse
        : null,
    ).toEqual({ ruleId: 'rule-9' })
  })

  it('表单那几格在前、按登记簿顺序；库里那一档跟在后面', () => {
    buildTwoRounds()
    store.upsertOperatorStep(RULE_STEP, ROUND_B)
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    expect(result.current.roundChangeLabelKeys(ROUND_B)).toEqual([
      'field.prompt',
      'field.count',
      'changeSubject.rule',
    ])
  })
})

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

  it('切工作区后保留的旧撤销回调不会撤掉新工作区的同名轮次', () => {
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())
    const oldRevert = result.current.revertRound

    act(() => {
      store.claimOperatorThreadScope('account-a:image-tags', 'image')
      store.upsertOperatorStep(promptStep('step-1', 'tag prompt', ''), ROUND_B)
      oldRevert(ROUND_B)
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(store.getOperatorState().entries).toHaveLength(1)
    expect(store.getOperatorState().entries[0]).toMatchObject({ undone: false })
  })

  it('新对话后旧撤销回调不能修改当前对话', () => {
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())
    const oldRevert = result.current.revertRound

    act(() => {
      store.resetOperatorThread()
      store.upsertOperatorStep(promptStep('step-1', 'new prompt', ''), ROUND_B)
      oldRevert(ROUND_B)
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(store.getOperatorState().entries).toHaveLength(1)
    expect(store.getOperatorState().entries[0]).toMatchObject({ undone: false })
  })

  it('旧 NULL 工作区历史只读，不提供撤销计数、标签或写入', async () => {
    store.loadOperatorThread({
      history: [],
      sessionId: 'legacy-session',
      sessionSurface: 'IMAGE_STUDIO',
      readOnlyHistory: true,
    })
    buildTwoRounds()
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    await act(async () => result.current.revertRound(ROUND_B))

    expect(result.current.countRoundChanges(ROUND_B)).toBe(0)
    expect(result.current.roundChangeLabelKeys(ROUND_B)).toEqual([])
    expect(dispatch).not.toHaveBeenCalled()
    expect(store.getOperatorState().primed).toBe(true)
    expect(
      store
        .getOperatorState()
        .entries.filter((entry) => entry.kind === 'system'),
    ).toEqual([])
  })

  it('等待网络撤销成功回执后才划线并撤下一步', async () => {
    let finish: (value: boolean) => void = () => {}
    revertAssetWrite.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
    )
    store.upsertOperatorStep(promptStep('step-1', 'changed', ''), ROUND_B)
    store.upsertOperatorStep(ASSET_STEP, ROUND_B)
    const { result } = renderHook(() => revert.useStudioOperatorRevert())
    let pending = Promise.resolve()

    act(() => {
      pending = result.current.revertRound(ROUND_B)
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(store.getOperatorState().entries[1]).toMatchObject({ undone: false })

    await act(async () => {
      finish(true)
      await pending
    })

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_PROMPT', payload: '' })
    expect(store.getOperatorState().entries.slice(0, 2)).toEqual([
      expect.objectContaining({ undone: true }),
      expect.objectContaining({ undone: true }),
    ])
    expect(store.getOperatorState().entries.at(-1)).toMatchObject({
      code: 'revertRound',
      count: 2,
    })
  })

  it('网络失败停止该轮剩余逆操作，仅通报已经成功的数量', async () => {
    revertAssetWrite.mockResolvedValue(false)
    store.upsertOperatorStep(promptStep('step-1', 'changed', ''), ROUND_B)
    store.upsertOperatorStep(ASSET_STEP, ROUND_B)
    store.upsertOperatorStep(PRIME_STEP, ROUND_B)
    store.setOperatorPrimed(true)
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    await act(async () => result.current.revertRound(ROUND_B))

    expect(dispatch).not.toHaveBeenCalled()
    expect(store.getOperatorState().primed).toBe(false)
    expect(result.current.countRoundChanges(ROUND_B)).toBe(2)
    expect(
      store
        .getOperatorState()
        .entries.filter((entry) => entry.kind === 'system'),
    ).toEqual([
      expect.objectContaining({ code: 'revertRound', count: 1 }),
      expect.objectContaining({ code: 'revertFailed' }),
    ])
  })

  it('缺少宿主撤销能力时不划线，留下失败通报', async () => {
    assetRevertEnabled.value = false
    store.upsertOperatorStep(ASSET_STEP, ROUND_B)
    const { result } = renderHook(() => revert.useStudioOperatorRevert())

    await act(async () => result.current.revertRound(ROUND_B))

    expect(store.getOperatorState().entries[0]).toMatchObject({ undone: false })
    expect(store.getOperatorState().entries.at(-1)).toMatchObject({
      code: 'revertFailed',
    })
    expect(revertAssetWrite).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    '切台后旧网络回执 %s 不修改新线程或继续撤下一步',
    async (success) => {
      let finish: (value: boolean) => void = () => {}
      revertAssetWrite.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finish = resolve
        }),
      )
      store.upsertOperatorStep(promptStep('step-1', 'changed', ''), ROUND_B)
      store.upsertOperatorStep(ASSET_STEP, ROUND_B)
      const { result } = renderHook(() => revert.useStudioOperatorRevert())
      let pending = Promise.resolve()
      act(() => {
        pending = result.current.revertRound(ROUND_B)
        store.claimOperatorThreadScope('account-a:image-tags', 'image')
        store.upsertOperatorStep(ASSET_STEP, ROUND_B)
      })

      await act(async () => {
        finish(success)
        await pending
      })

      expect(dispatch).not.toHaveBeenCalled()
      expect(store.getOperatorState().entries).toHaveLength(1)
      expect(store.getOperatorState().entries[0]).toMatchObject({
        undone: false,
      })
    },
  )

  it('等待回执时重复点击不重发，失败后仍可重试', async () => {
    let finish: (value: boolean) => void = () => {}
    revertAssetWrite.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
    )
    store.upsertOperatorStep(ASSET_STEP, ROUND_B)
    const { result } = renderHook(() => revert.useStudioOperatorRevert())
    let pending = Promise.resolve()
    act(() => {
      pending = result.current.revertRound(ROUND_B)
      void result.current.revertRound(ROUND_B)
    })
    expect(revertAssetWrite).toHaveBeenCalledOnce()

    await act(async () => {
      finish(false)
      await pending
    })
    await act(async () => result.current.revertRound(ROUND_B))

    expect(revertAssetWrite).toHaveBeenCalledTimes(2)
    expect(store.getOperatorState().entries[0]).toMatchObject({ undone: true })
  })
})
