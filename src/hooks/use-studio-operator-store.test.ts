import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import type { AssistantOperatorAppliedStep } from '@/types/assistant-operator'

/**
 * ⚠ 这个 store 是**模块级单例**（工作台本身是单例，两棵组件树共读一份）。
 * 用例之间必须换一份新的模块实例，否则前一个用例的线程会漏到下一个 ——
 * `vi.resetModules()` + 动态 import 是唯一真的能做到这件事的写法，顶层 import
 * 拿到的永远是同一份。
 */
type Store = typeof import('@/hooks/use-studio-operator-store')

let store: Store

beforeEach(async () => {
  vi.resetModules()
  store = await import('@/hooks/use-studio-operator-store')
})

function readState() {
  return renderHook(() => store.useStudioOperatorState()).result
}

const RUNNING: AssistantOperatorAppliedStep = {
  id: 'step-1',
  title: '换模型',
  status: 'running',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  payload: { modelId: 'gpt-image-2' },
  inverse: { modelId: null },
}

const DONE: AssistantOperatorAppliedStep = { ...RUNNING, status: 'done' }

/** 一轮的 token —— 服务端的步号每轮从 `step-1` 重来，线程侧的 key 必须带上它。 */
const RUN = 'run-1'

describe('日志条按 id 覆盖', () => {
  it('同一步的 running 与 done 只留一条 —— 追加的表现是每步在日志里重复两行', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(RUNNING, RUN))
    act(() => store.upsertOperatorStep(DONE, RUN))

    expect(result.current.entries).toHaveLength(1)
    const entry = result.current.entries[0]
    expect(entry.kind).toBe('step')
    if (entry.kind === 'step') expect(entry.step.status).toBe('done')
  })

  it('「跑完几步」只数 done 那一次 —— running 也数会一步顶两步', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(RUNNING, RUN))
    expect(result.current.stepsDone).toBe(0)
    act(() => store.upsertOperatorStep(DONE, RUN))
    expect(result.current.stepsDone).toBe(1)
    // 同一条再来一次（重发时的幂等）不该把数字顶上去
    act(() => store.upsertOperatorStep(DONE, RUN))
    expect(result.current.stepsDone).toBe(1)
  })

  it('撤销标记跨越同一步的再次 upsert 不丢', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(DONE, RUN))
    act(() => store.markOperatorStepUndone(`${RUN}:step-1`))
    act(() => store.upsertOperatorStep(DONE, RUN))

    const entry = result.current.entries[0]
    expect(entry.kind === 'step' && entry.undone).toBe(true)
  })

  /**
   * ⚠ 2026-08-30 真机实测抓到的：服务端每轮都从 `step-1` 重新编号，而线程是跨轮
   * 累积的。以 `step.id` 当线程 key 的表现是第二轮把第一轮那条**原地顶掉**，并且
   * 继承它的 `undone` —— 新改动一落地就带划线、也不计入改动数。
   */
  it('两轮各自的 step-1 是两条日志，且不继承上一轮的撤销标记', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(DONE, 'run-1'))
    act(() => store.markOperatorStepUndone('run-1:step-1'))
    act(() => store.upsertOperatorStep(DONE, 'run-2'))

    expect(result.current.entries).toHaveLength(2)
    const [first, second] = result.current.entries
    expect(first.kind === 'step' && first.undone).toBe(true)
    expect(second.kind === 'step' && second.undone).toBe(false)
    expect(second.id).toBe('run-2:step-1')
    expect(result.current.stepsDone).toBe(2)
  })
})

describe('改动登记簿', () => {
  const first: AssistantOperatorAppliedStep = {
    id: 'step-1',
    title: '写提示词',
    status: 'done',
    tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
    payload: { value: '第一版', mode: 'replace' },
    inverse: { value: '用户手写的原文' },
  }
  const second: AssistantOperatorAppliedStep = {
    ...first,
    id: 'step-2',
    payload: { value: '第二版', mode: 'replace' },
    inverse: { value: '第一版' },
  }

  it('同一字段第二次被改时保留**最早那次**的 inverse 与原值', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: first.id,
        firstInverse: first,
        previousLabel: '用户手写的原文',
      }),
    )
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: second.id,
        reason: '按你后来说的调了',
        firstInverse: second,
        previousLabel: '第一版',
      }),
    )

    // ⭐ 只留最近一次的 inverse，撤销会停在助手的中间版本上 —— 用户以为撤了，
    //    其实只回到助手的第一版。
    expect(result.current.changes.prompt).toMatchObject({
      stepId: 'step-2',
      reason: '按你后来说的调了',
      previousLabel: '用户手写的原文',
    })
    expect(result.current.changes.prompt?.firstInverse.id).toBe('step-1')
  })

  it('清掉全部改动时顺手把生成键熄灭（拍板 14）', () => {
    const result = readState()
    act(() => store.setOperatorPrimed(true))
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: first.id,
        firstInverse: first,
        previousLabel: '',
      }),
    )
    expect(result.current.primed).toBe(true)

    act(() => store.clearOperatorChanges())
    expect(result.current.changes).toEqual({})
    expect(result.current.primed).toBe(false)
  })
})

describe('新对话', () => {
  it('只清线程 —— 登记簿与 primed 留着，否则 ✦ 还在但点了没反应', () => {
    const result = readState()
    act(() => store.setOperatorPrimed(true))
    act(() => store.upsertOperatorStep(DONE, RUN))
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.model,
        stepId: DONE.id,
        firstInverse: DONE,
        previousLabel: '',
      }),
    )

    act(() => store.resetOperatorThread())

    expect(result.current.entries).toHaveLength(0)
    expect(result.current.stepsDone).toBe(0)
    expect(result.current.changes.model).toBeDefined()
    expect(result.current.primed).toBe(true)
  })
})

describe('续跑注册口', () => {
  it('注册与注销 —— 就地确认条在参数栏，续跑的能力在面板', () => {
    const resume = vi.fn()
    store.registerOperatorRunner({ resume })
    store.getOperatorRunner()?.resume('append')
    expect(resume).toHaveBeenCalledWith('append')

    store.registerOperatorRunner(null)
    expect(store.getOperatorRunner()).toBeNull()
  })
})

// ── 跨域（P4-A，拍板 8：切域换工具、不断会话）────────────────────────
describe('切域', () => {
  it('线程连续 —— 域标记插在原地，之前的条目一条都不掉', () => {
    const result = readState()
    act(() =>
      store.appendOperatorEntry({
        kind: 'user',
        id: 'user-1',
        text: '帮我配一张海报',
        attachments: [],
      }),
    )

    act(() => store.switchOperatorDomain('video'))

    expect(result.current.domain).toBe('video')
    expect(result.current.entries.map((entry) => entry.kind)).toEqual([
      'user',
      'domainMark',
    ])
    expect(result.current.entries.at(-1)).toMatchObject({
      kind: 'domainMark',
      domain: 'video',
    })
  })

  it('线程还空着时不插标记 —— 一条孤零零的「切到视频工作台」说的是还没发生的事', () => {
    const result = readState()
    act(() => store.switchOperatorDomain('video'))
    expect(result.current.domain).toBe('video')
    expect(result.current.entries).toHaveLength(0)
  })

  it('域没变时整个是 no-op（⛔ 不白发一次全面板重渲染）', () => {
    const result = readState()
    const before = result.current
    act(() => store.switchOperatorDomain('image'))
    expect(result.current).toBe(before)
  })

  it('⭐ 改动账本按域分槽：视频域改的东西不顶掉图片域的登记', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'image-step',
        firstInverse: DONE,
        previousLabel: '图片域原文',
      }),
    )

    act(() => store.switchOperatorDomain('video'))
    // 切过去那一刻是干净的 —— 视频域助手还没动过任何东西。
    expect(result.current.changes).toEqual({})

    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'video-step',
        firstInverse: DONE,
        previousLabel: '视频域原文',
      }),
    )
    expect(result.current.changes.prompt?.stepId).toBe('video-step')

    // ⭐ 切回去：图片域那笔账原样还在（⛔ 不是被视频那笔顶掉的版本）。
    act(() => store.switchOperatorDomain('image'))
    expect(result.current.changes.prompt).toMatchObject({
      stepId: 'image-step',
      previousLabel: '图片域原文',
    })
  })

  it('⭐ primed 按域分槽：图片域备好的那一枪不会把视频档的生成键点亮', () => {
    const result = readState()
    act(() => store.setOperatorPrimed(true))
    expect(result.current.primed).toBe(true)

    act(() => store.switchOperatorDomain('video'))
    expect(result.current.primed).toBe(false)

    act(() => store.switchOperatorDomain('image'))
    // 切走时不消失 —— 那份表单还预填着，生成键该继续亮。
    expect(result.current.primed).toBe(true)
  })

  it('就地确认条也按域分槽 —— 问的是图片档的提示词，条子不该出现在视频档', () => {
    const result = readState()
    act(() =>
      store.setOperatorConfirm({
        // §6 第二档 —— 切片 3a 起 `tier` 是必填（花钱档走自己那一帧）。
        tier: 'overwrite',
        field: 'prompt',
        have: '用户手写的原文',
        proposed: '助手想写的',
      }),
    )
    act(() => store.switchOperatorDomain('video'))
    expect(result.current.confirm).toBeNull()

    act(() => store.switchOperatorDomain('image'))
    expect(result.current.confirm).toMatchObject({ field: 'prompt' })
  })

  it('清掉全部改动只清当前域 —— ⛔ 别把用户切回去要用的那份一起清了', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'image-step',
        firstInverse: DONE,
        previousLabel: '',
      }),
    )
    act(() => store.switchOperatorDomain('video'))
    act(() => store.clearOperatorChanges())

    act(() => store.switchOperatorDomain('image'))
    expect(result.current.changes.prompt?.stepId).toBe('image-step')
  })
})

/**
 * 会话历史（P4-B）在 store 里的三条硬规矩。
 *
 * ⭐ 「载入历史不碰表单」与「新对话要清会话身份」是一对：前者漏了会让用户
 * 「翻一眼历史，✦ 标记全没了」，后者漏了会让「新对话」之后的第一次保存写进
 * **上一条会话那一行** —— 库里永远只有一条，而那要读库才发现得了。
 */
describe('会话历史 · 载入与新对话', () => {
  const HISTORY = [
    {
      kind: 'user' as const,
      id: 'u1',
      text: '上次说到一半',
      attachments: [],
    },
  ]

  it('载入历史**不碰**登记簿与 primed —— 表单上的改动是另一件事', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'step-a',
        firstInverse: DONE,
        previousLabel: '原来的',
      }),
    )
    act(() => store.setOperatorPrimed(true))

    act(() =>
      store.loadOperatorThread({
        history: HISTORY,
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      }),
    )

    expect(result.current.history).toEqual(HISTORY)
    expect(result.current.entries).toEqual([])
    expect(result.current.sessionId).toBe('conv-1')
    // ⭐ 这两条是「载入历史 ≠ 交还控制权」的反面：改动与 primed 属于表单此刻。
    expect(result.current.changes.prompt?.stepId).toBe('step-a')
    expect(result.current.primed).toBe(true)
  })

  it('新对话把历史与会话身份一起清掉 —— 否则下一次保存会覆盖上一条会话', () => {
    const result = readState()
    act(() =>
      store.loadOperatorThread({
        history: HISTORY,
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      }),
    )
    act(() => store.resetOperatorThread())

    expect(result.current.history).toEqual([])
    expect(result.current.sessionId).toBeNull()
    expect(result.current.sessionSurface).toBeNull()
  })

  it('新对话仍然**不清**登记簿 —— 撤销的本钱留着（P2 那条规矩没变）', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'step-a',
        firstInverse: DONE,
        previousLabel: '原来的',
      }),
    )
    act(() => store.resetOperatorThread())
    expect(result.current.changes.prompt?.stepId).toBe('step-a')
  })
})

/**
 * 正文那三颗（§4.1 / v2 §13.1）。它们是「发送即回显 + 整段出现」在 store 里的
 * 全部实现，三条纪律各钉一条：占位与正文共用条目 · 定稿**按 id 覆盖** · 只扔空占位。
 */
describe('正文与占位行', () => {
  it('占位行是一条 text 为空的待写正文条 —— 与正文共用同一条条目', () => {
    const result = readState()
    act(() => store.appendOperatorPending('run-1:msg-0'))
    expect(result.current.entries).toEqual([
      { kind: 'message', id: 'run-1:msg-0', text: '', streaming: true },
    ])

    act(() => store.finalizeOperatorMessage('run-1:msg-0', '夜景'))
    expect(result.current.entries).toEqual([
      { kind: 'message', id: 'run-1:msg-0', text: '夜景' },
    ])
  })

  /**
   * ⭐ **§13.1 的那一条纪律**：同一个 id 再来一帧就**原地覆盖**，⛔ 不追加 ——
   * 追加正是「计划上下各出现一次同一段回复」那条 bug 的形状。
   */
  it('⭐ 定稿按 id **覆盖**，⛔ 不是追加', () => {
    const result = readState()
    act(() => store.appendOperatorPending('run-1:msg-0'))
    act(() => store.finalizeOperatorMessage('run-1:msg-0', '已经改成夜'))
    act(() => store.finalizeOperatorMessage('run-1:msg-0', '已经改成夜景了。'))
    expect(result.current.entries).toEqual([
      { kind: 'message', id: 'run-1:msg-0', text: '已经改成夜景了。' },
    ])
  })

  it('条目不在就新起一条 —— 占位行被别的事件吃掉之后仍然接得住', () => {
    const result = readState()
    act(() => store.finalizeOperatorMessage('run-1:msg-1', '好'))
    act(() => store.finalizeOperatorMessage('run-1:msg-2', '完成'))
    expect(result.current.entries.map((entry) => entry.id)).toEqual([
      'run-1:msg-1',
      'run-1:msg-2',
    ])
  })

  it('⛔ 只扔**空着**的占位 —— 已经说出口的那句话不许被让位逻辑扫掉', () => {
    const result = readState()
    act(() => store.appendOperatorPending('run-1:msg-0'))
    act(() => store.dropOperatorPending('run-1:msg-0'))
    expect(result.current.entries).toEqual([])

    act(() => store.appendOperatorPending('run-1:msg-1'))
    act(() => store.finalizeOperatorMessage('run-1:msg-1', '这就来'))
    act(() => store.dropOperatorPending('run-1:msg-1'))
    expect(result.current.entries).toHaveLength(1)
  })
})

// ── 切片 Y：审核态 / 跨轮工作记忆 / 成本计数 ─────────────────────────

describe('审核态', () => {
  it('pending 不落键（没有键 = 没人看过），再标一次同一档才是 no-op', async () => {
    const { GENERATION_REVIEW_STATE_IDS } =
      await import('@/constants/assistant-operator')
    const result = readState()
    act(() =>
      store.setOperatorReviewState(
        'gen-1',
        GENERATION_REVIEW_STATE_IDS.blocked,
      ),
    )
    expect(result.current.reviewStates).toEqual({
      'gen-1': GENERATION_REVIEW_STATE_IDS.blocked,
    })
    expect(store.getOperatorReviewState('gen-1')).toBe(
      GENERATION_REVIEW_STATE_IDS.blocked,
    )

    act(() =>
      store.setOperatorReviewState(
        'gen-1',
        GENERATION_REVIEW_STATE_IDS.pending,
      ),
    )
    // ⛔ 不留一个写着 `'pending'` 的键 —— 两种表示法并存会让「看过几张」数错。
    expect(result.current.reviewStates).toEqual({})
    expect(store.getOperatorReviewState('gen-1')).toBe(
      GENERATION_REVIEW_STATE_IDS.pending,
    )
  })

  it('⛔ 新对话不清审核态 —— 那是对产物的判断，与聊哪条线程无关', async () => {
    const { GENERATION_REVIEW_STATE_IDS } =
      await import('@/constants/assistant-operator')
    const result = readState()
    act(() =>
      store.setOperatorReviewState(
        'gen-1',
        GENERATION_REVIEW_STATE_IDS.blocked,
      ),
    )
    act(() => store.resetOperatorThread())
    expect(result.current.reviewStates['gen-1']).toBe(
      GENERATION_REVIEW_STATE_IDS.blocked,
    )
  })
})

describe('跨轮工作记忆', () => {
  const artifact = (id: string) => ({
    id,
    displayName: id,
    kind: 'result' as const,
    url: `https://x/${id}`,
  })

  it('同一轮按 runKey 合并、轮内按 id 去重', () => {
    const result = readState()
    act(() => store.recordOperatorArtifacts('run-1', [artifact('a')]))
    act(() =>
      store.recordOperatorArtifacts('run-1', [artifact('a'), artifact('b')]),
    )
    expect(result.current.workingMemory).toHaveLength(1)
    expect(
      result.current.workingMemory[0]?.artifacts.map((item) => item.id),
    ).toEqual(['a', 'b'])
  })

  it('轮内封顶留最先见到的那些，轮数封顶只留最近几轮', async () => {
    const { ASSISTANT_WORKING_MEMORY } =
      await import('@/constants/assistant-operator')
    const result = readState()
    const many = Array.from(
      { length: ASSISTANT_WORKING_MEMORY.maxArtifactsPerRound + 5 },
      (_, index) => artifact(`a${index}`),
    )
    act(() => store.recordOperatorArtifacts('run-0', many))
    expect(result.current.workingMemory[0]?.artifacts).toHaveLength(
      ASSISTANT_WORKING_MEMORY.maxArtifactsPerRound,
    )
    // ⚠ 留的是**最先**那些：截头会让助手记不住这一轮从什么开始。
    expect(result.current.workingMemory[0]?.artifacts[0]?.id).toBe('a0')

    for (
      let round = 1;
      round <= ASSISTANT_WORKING_MEMORY.maxRounds;
      round += 1
    ) {
      act(() =>
        store.recordOperatorArtifacts(`run-${round}`, [artifact(`r${round}`)]),
      )
    }
    expect(result.current.workingMemory).toHaveLength(
      ASSISTANT_WORKING_MEMORY.maxRounds,
    )
    // 最早那一轮（run-0）被挤掉了。
    expect(
      result.current.workingMemory.map((round) => round.runKey),
    ).not.toContain('run-0')
  })

  it('新对话清空 —— 新话题里指认上一条线程的产物是幻觉', () => {
    const result = readState()
    act(() => store.recordOperatorArtifacts('run-1', [artifact('a')]))
    act(() => store.resetOperatorThread())
    expect(result.current.workingMemory).toHaveLength(0)
  })
})

describe('成本计数', () => {
  it('同一档累加而不是覆盖，明细留最近几条', async () => {
    const { STUDIO_OPERATOR_COST_DETAIL_LIMIT } =
      await import('@/constants/studio-assistant-operator')
    const result = readState()
    act(() => store.addOperatorCostTick({ kind: 'vision', units: 2 }))
    act(() => store.addOperatorCostTick({ kind: 'vision', units: 1 }))
    act(() => store.addOperatorCostTick({ kind: 'llm', units: 3 }))
    expect(result.current.costs.vision).toBe(3)
    expect(result.current.costs.llm).toBe(3)
    expect(result.current.costs.research).toBe(0)

    for (
      let index = 0;
      index < STUDIO_OPERATOR_COST_DETAIL_LIMIT + 4;
      index += 1
    ) {
      act(() => store.addOperatorCostTick({ kind: 'research', units: 1 }))
    }
    expect(result.current.costDetails).toHaveLength(
      STUDIO_OPERATOR_COST_DETAIL_LIMIT,
    )
  })

  it('新对话归零 —— ⛔ 一条新对话不该一上来就写着往返 37', () => {
    const result = readState()
    act(() => store.addOperatorCostTick({ kind: 'llm', units: 7 }))
    act(() => store.resetOperatorThread())
    expect(result.current.costs.llm).toBe(0)
    expect(result.current.costDetails).toHaveLength(0)
  })
})

/**
 * 断点续跑（第三期）——「刷新之后还在」是这一组唯一要钉的事。
 *
 * ⚠ 用真的 `localStorage`（jsdom 自带）而不是 mock：这一段的失败模式全在盘上
 * （写了读不回来、串了 scope、跑完了没清），mock 掉的话每一条都测不到。
 */
describe('resume（断点续跑）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('没设 scope 时一切都是 no-op —— ⛔ 不往默认键里写', () => {
    const result = readState()
    act(() =>
      store.startOperatorResumePlan({ planId: 'p1', labels: ['一', '二'] }),
    )
    expect(result.current.resume).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('批准计划 → 落盘 → 刷新后 hydrate 得回来', async () => {
    const first = readState()
    act(() => store.setOperatorResumeScope('project-a'))
    act(() =>
      store.startOperatorResumePlan({
        planId: 'p1',
        labels: ['读表单', '写提示词', '生成'],
      }),
    )
    expect(first.current.resume?.steps).toHaveLength(3)

    // 「刷新」= 换一份全新的模块实例，只有盘上那一格活得过去。
    vi.resetModules()
    store = await import('@/hooks/use-studio-operator-store')
    const second = readState()
    expect(second.current.resume).toBeNull()
    act(() => store.setOperatorResumeScope('project-a'))
    act(() => store.hydrateOperatorResume())
    expect(second.current.resume?.planId).toBe('p1')
    expect(second.current.resume?.steps).toHaveLength(3)
  })

  it('按 scope 隔离：换个项目 hydrate 不到别人的计划', () => {
    const result = readState()
    act(() => store.setOperatorResumeScope('project-a'))
    act(() => store.startOperatorResumePlan({ planId: 'p1', labels: ['一'] }))
    act(() => store.setOperatorResumeScope('project-b'))
    // 换 scope 当帧就把镜像清掉，⛔ 不让上一个项目那份多活一帧。
    expect(result.current.resume).toBeNull()
    act(() => store.hydrateOperatorResume())
    expect(result.current.resume).toBeNull()
  })

  it('逐步标记落盘，failed 带得回那句原因', () => {
    const result = readState()
    act(() => store.setOperatorResumeScope('project-a'))
    act(() =>
      store.startOperatorResumePlan({ planId: 'p1', labels: ['一', '二'] }),
    )
    act(() =>
      store.markOperatorResumeStep('p1:0', {
        state: 'done',
        artifactIds: ['gen-1'],
      }),
    )
    act(() =>
      store.markOperatorResumeStep('p1:1', {
        state: 'failed',
        reason: '模型超时',
      }),
    )
    expect(result.current.resume?.steps[0]).toMatchObject({
      state: 'done',
      artifactIds: ['gen-1'],
    })
    expect(result.current.resume?.steps[1]?.reason).toBe('模型超时')

    const stored = JSON.parse(
      localStorage.getItem(
        'pixelvault.studio.operatorResume.v1.project-a',
      ) as string,
    )
    expect(stored.steps[1].state).toBe('failed')
  })

  it('＋新对话把那份计划连盘上一起清掉', () => {
    const result = readState()
    act(() => store.setOperatorResumeScope('project-a'))
    act(() => store.startOperatorResumePlan({ planId: 'p1', labels: ['一'] }))
    act(() => store.resetOperatorThread())
    expect(result.current.resume).toBeNull()
    act(() => store.hydrateOperatorResume())
    expect(result.current.resume).toBeNull()
  })
})

it('恢复配置保留历史并清掉旧撤销、确认、待生成及未完成计划', async () => {
  const { toOperatorHistory, historyToPriorSteps, historyToOperatorMessages } =
    await import('@/lib/studio-operator-history')
  store.upsertOperatorStep(DONE, RUN)
  store.setOperatorConfirm({
    tier: 'overwrite',
    field: 'prompt',
    have: 'old',
    proposed: 'new',
  })
  store.setOperatorPrimed(true)
  store.setOperatorResumeScope('checkpoint-test')
  store.startOperatorResumePlan({ planId: 'p', labels: ['change prompt'] })
  const history = toOperatorHistory(store.getOperatorState().entries)
  store.restoreOperatorThreadCheckpoint(history, 'restore')
  const state = store.getOperatorState()
  expect(state.history).toEqual(history)
  expect(state.entries).toHaveLength(1)
  expect(state.entries[0]).toMatchObject({
    kind: 'system',
    code: 'checkpointRestored',
  })
  expect(state).toMatchObject({
    status: 'idle',
    confirm: null,
    primed: false,
    changes: {},
    plan: null,
    spend: null,
    choice: null,
    resume: null,
    queue: [],
  })
  const restoredHistory = [
    ...state.history,
    ...toOperatorHistory(state.entries),
  ]
  expect(historyToPriorSteps(restoredHistory)).toEqual([])
  expect(historyToOperatorMessages(restoredHistory).at(-1)?.content).toContain(
    'restored a configuration checkpoint',
  )
})
