import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import type { AssistantOperatorAppliedStep } from '@/types/assistant-operator'
import { operatorResumeStorageKey } from '@/lib/studio-operator-resume'

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
  verb: 'apply',
  payload: { modelId: 'gpt-image-2' },
  inverse: { modelId: null },
}

const DONE: AssistantOperatorAppliedStep = { ...RUNNING, status: 'done' }

/** 一轮的 token —— 服务端的步号每轮从 `step-1` 重来，线程侧的 key 必须带上它。 */
const RUN = 'run-1'

describe('显式跨工作区交接', () => {
  it('角色台交接文字只在同账号自然语言图片台消费一次', () => {
    store.claimOperatorThreadScope('account-a:cards', 'cards')
    store.requestOperatorDraft('image-natural', '给这个角色做一张立绘')
    expect(store.takeOperatorDraft('account-a:cards')).toBeNull()
    store.claimOperatorThreadScope('account-a:image-tags', 'image')
    expect(store.takeOperatorDraft('account-a:image-tags')).toBeNull()
    store.claimOperatorThreadScope('account-a:image-natural', 'image')
    expect(store.takeOperatorDraft('account-a:image-natural')).toBe(
      '给这个角色做一张立绘',
    )
    expect(store.takeOperatorDraft('account-a:image-natural')).toBeNull()
  })

  it('换账号清掉前一账号未消费的交接', () => {
    store.claimOperatorThreadScope('account-a:cards', 'cards')
    store.requestOperatorDraft('image-natural', '账号 A 的角色')
    store.claimOperatorThreadScope('account-b:image-natural', 'image')
    expect(store.takeOperatorDraft('account-b:image-natural')).toBeNull()
    store.claimOperatorThreadScope('account-a:image-natural', 'image')
    expect(store.takeOperatorDraft('account-a:image-natural')).toBeNull()
  })

  it('画布节点请求绑定当前项目，另一个画布项目不能消费', () => {
    store.claimOperatorThreadScope('account-a:canvas:project-a', 'canvas')
    store.requestOperatorDraft('canvas', '写这位角色的台词')
    store.claimOperatorThreadScope('account-a:canvas:project-b', 'canvas')
    expect(store.takeOperatorDraft('account-a:canvas:project-b')).toBeNull()
    store.claimOperatorThreadScope('account-a:canvas:project-a', 'canvas')
    expect(store.takeOperatorDraft('account-a:canvas:project-a')).toBe(
      '写这位角色的台词',
    )
  })
})

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
    verb: 'apply',
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

describe('工作区作用域', () => {
  it('图片和标签使用不同线程，返回原工作区恢复其消息与会话身份', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    act(() =>
      store.appendOperatorEntry({
        kind: 'user',
        id: 'user-1',
        text: '帮我配一张海报',
        attachments: [],
      }),
    )

    act(() => store.setOperatorSession('image-conversation', 'IMAGE_STUDIO'))
    const localThreadId = result.current.localThreadId
    act(() => store.claimOperatorThreadScope('user:image-tags', 'image'))
    expect(result.current.entries).toEqual([])
    expect(result.current.sessionId).toBeNull()
    expect(result.current.localThreadId).not.toBe(localThreadId)
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    expect(result.current.localThreadId).toBe(localThreadId)
    expect(result.current.sessionId).toBe('image-conversation')
    expect(result.current.entries.map((entry) => entry.id)).toEqual(['user-1'])
  })

  it('线程还空着时不插标记 —— 一条孤零零的「切到视频工作台」说的是还没发生的事', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:video', 'video'))
    expect(result.current.domain).toBe('video')
    expect(result.current.entries).toHaveLength(0)
  })

  it('同一作用域重复认领不改变状态引用', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    const before = result.current
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    expect(result.current).toBe(before)
  })

  it('同域的图片和标签也分别保留改动账本', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'image-step',
        firstInverse: DONE,
        previousLabel: '图片域原文',
      }),
    )

    act(() => store.claimOperatorThreadScope('user:image-tags', 'image'))
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
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    expect(result.current.changes.prompt).toMatchObject({
      stepId: 'image-step',
      previousLabel: '图片域原文',
    })
  })

  it('⭐ primed 按域分槽：图片域备好的那一枪不会把视频档的生成键点亮', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    act(() => store.setOperatorPrimed(true))
    expect(result.current.primed).toBe(true)

    act(() => store.claimOperatorThreadScope('user:video', 'video'))
    expect(result.current.primed).toBe(false)

    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    // 切走时不消失 —— 那份表单还预填着，生成键该继续亮。
    expect(result.current.primed).toBe(true)
  })

  it('同页返回原会话保留自动生成偏好，另一工作区和账号不继承', () => {
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    act(() => store.setOperatorAutoGenerate(true))
    act(() => store.claimOperatorThreadScope('user:lora', 'lora'))
    expect(store.getOperatorState().autoGenerate).toBe(false)
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    expect(store.getOperatorState().autoGenerate).toBe(true)
    act(() => store.claimOperatorThreadScope(null, 'image'))
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    expect(store.getOperatorState().autoGenerate).toBe(false)
  })

  it('两个未落库会话也有不同身份，旧保存回包不能回填新会话', () => {
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    const previous = store.getOperatorState()
    act(() => store.resetOperatorThread())
    expect(store.getOperatorState().localThreadId).not.toBe(
      previous.localThreadId,
    )
    act(() =>
      store.setOperatorSession('old-conversation', 'IMAGE_STUDIO', previous),
    )
    expect(store.getOperatorState().sessionId).toBeNull()
  })

  it('旧工作区的保存回包仅更新其缓存，不改变当前工作区', () => {
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    const previous = store.getOperatorState()
    act(() => store.claimOperatorThreadScope('user:lora', 'lora'))
    act(() =>
      store.setOperatorSession('image-conversation', 'IMAGE_STUDIO', previous),
    )
    expect(store.getOperatorState().sessionId).toBeNull()
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    expect(store.getOperatorState().sessionId).toBe('image-conversation')
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

  it('载回一段会话时，末尾还没决定的卡放回面板、状态回到「等你定」（owner 09-27）', () => {
    const result = readState()
    const handoff = {
      kind: 'imageHandoff' as const,
      handoff: { characterId: 'denia', request: '给 Denia 出一张背面图' },
    }
    act(() =>
      store.loadOperatorThread({
        history: HISTORY,
        sessionId: 'conv-1',
        sessionSurface: 'CARDS',
        pending: handoff,
      }),
    )
    expect(result.current.confirm).toMatchObject({
      ...handoff,
      status: 'idle',
    })
    expect(result.current.question).toBeNull()
    expect(result.current.status).toBe('awaitingConfirm')

    act(() =>
      store.loadOperatorThread({
        history: HISTORY,
        sessionId: 'conv-2',
        sessionSurface: 'CARDS',
      }),
    )
    // 换一段会话：上一段的卡不跟过来。
    expect(result.current.confirm).toBeNull()
    expect(result.current.status).toBe('idle')
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

  it('⭐ 增量**追加**到那条 streaming 气泡后面，定稿再整体覆盖并降旗（56b 切片 3）', () => {
    const result = readState()
    act(() => store.appendOperatorPending('run-1:msg-0'))
    act(() => store.appendOperatorStreamingMessage('run-1:msg-0', '图3是'))
    expect(result.current.entries).toEqual([
      {
        kind: 'message',
        id: 'run-1:msg-0',
        text: '图3是',
        streaming: true,
      },
    ])
    act(() =>
      store.appendOperatorStreamingMessage('run-1:msg-0', '风格化 3D。'),
    )
    expect(result.current.entries).toEqual([
      {
        kind: 'message',
        id: 'run-1:msg-0',
        text: '图3是风格化 3D。',
        streaming: true,
      },
    ])
    act(() => store.finalizeOperatorMessage('run-1:msg-0', '图3是风格化 3D。'))
    expect(result.current.entries).toEqual([
      { kind: 'message', id: 'run-1:msg-0', text: '图3是风格化 3D。' },
    ])
  })

  it('restart：新一稿换掉还在流的旧稿，⛔ 不接在后面', () => {
    const result = readState()
    act(() => store.appendOperatorStreamingMessage('run-1:msg-0', '第一稿'))
    act(() =>
      store.appendOperatorStreamingMessage('run-1:msg-0', '第二稿', true),
    )
    expect(result.current.entries).toEqual([
      { kind: 'message', id: 'run-1:msg-0', text: '第二稿', streaming: true },
    ])
    act(() => store.appendOperatorStreamingMessage('run-1:msg-0', '继续'))
    expect(result.current.entries).toEqual([
      {
        kind: 'message',
        id: 'run-1:msg-0',
        text: '第二稿继续',
        streaming: true,
      },
    ])
  })

  it('⛔ 占位行被顶走时不静默丢字 —— 新建一条装它', () => {
    const result = readState()
    act(() => store.appendOperatorStreamingMessage('run-1:msg-0', '第一段'))
    expect(result.current.entries).toEqual([
      {
        kind: 'message',
        id: 'run-1:msg-0',
        text: '第一段',
        streaming: true,
      },
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

// ── 切片 Y：审核态 / 跨轮工作记忆 ───────────────────────────────────

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
    act(() => store.claimOperatorThreadScope('user:canvas:project-a', 'canvas'))
    act(() => store.setOperatorSession('conversation-a', 'NODE_CANVAS'))
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
    act(() => store.claimOperatorThreadScope('user:canvas:project-a', 'canvas'))
    act(() => store.setOperatorSession('conversation-a', 'NODE_CANVAS'))
    act(() => store.hydrateOperatorResume())
    expect(second.current.resume?.planId).toBe('p1')
    expect(second.current.resume?.steps).toHaveLength(3)
  })

  it('按 scope 隔离：换个项目 hydrate 不到别人的计划', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:canvas:project-a', 'canvas'))
    act(() => store.startOperatorResumePlan({ planId: 'p1', labels: ['一'] }))
    act(() => store.claimOperatorThreadScope('user:canvas:project-b', 'canvas'))
    // 换 scope 当帧就把镜像清掉，⛔ 不让上一个项目那份多活一帧。
    expect(result.current.resume).toBeNull()
    act(() => store.hydrateOperatorResume())
    expect(result.current.resume).toBeNull()
  })

  it('逐步标记落盘，failed 带得回那句原因', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:canvas:project-a', 'canvas'))
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
        operatorResumeStorageKey(
          'user:canvas:project-a',
          store.getOperatorState(),
        ),
      ) as string,
    )
    expect(stored.steps[1].state).toBe('failed')
  })

  it('＋新对话把那份计划连盘上一起清掉', () => {
    const result = readState()
    act(() => store.claimOperatorThreadScope('user:canvas:project-a', 'canvas'))
    act(() => store.startOperatorResumePlan({ planId: 'p1', labels: ['一'] }))
    act(() => store.resetOperatorThread())
    expect(result.current.resume).toBeNull()
    act(() => store.hydrateOperatorResume())
    expect(result.current.resume).toBeNull()
  })

  it('首次保存把本地计划绑定到服务器会话；另一会话不能恢复它', () => {
    act(() => store.claimOperatorThreadScope('user:image-natural', 'image'))
    const local = store.getOperatorState()
    act(() =>
      store.startOperatorResumePlan({ planId: 'p1', labels: ['一', '二'] }),
    )
    act(() => store.setOperatorSession('conversation-a', 'IMAGE_STUDIO'))
    expect(store.getOperatorState().resume?.sessionId).toBe('conversation-a')
    expect(
      localStorage.getItem(
        operatorResumeStorageKey('user:image-natural', local),
      ),
    ).toBeNull()
    act(() =>
      store.loadOperatorThread({
        history: [],
        sessionId: 'conversation-b',
        sessionSurface: 'IMAGE_STUDIO',
      }),
    )
    expect(store.getOperatorState().resume).toBeNull()
    act(() =>
      store.loadOperatorThread({
        history: [],
        sessionId: 'conversation-a',
        sessionSurface: 'IMAGE_STUDIO',
      }),
    )
    expect(store.getOperatorState().resume?.planId).toBe('p1')
  })
})

describe('结论记录（v2 §7.7，commit #13）', () => {
  const ROUND = {
    roundIndex: 0,
    createdAt: '2026-09-11T03:26:00.000Z',
    facts: ['参考图是冷蓝夜景'],
    decisions: ['用 16:9'],
    todos: [],
    evidenceRefs: ['#e12'],
  }

  it('`done` 的结账落进线程，同一轮再来一次是覆盖不是追加', () => {
    act(() => {
      store.appendOperatorRoundSummary(ROUND)
      store.appendOperatorRoundSummary({ ...ROUND, facts: ['改写过的事实'] })
    })
    const entries = store
      .getOperatorState()
      .entries.filter((entry) => entry.kind === 'roundSummary')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'roundSummary',
      summary: { roundIndex: 0, facts: ['改写过的事实'] },
    })
  })

  it('轮次号不同就各占一条', () => {
    act(() => {
      store.appendOperatorRoundSummary(ROUND)
      store.appendOperatorRoundSummary({ ...ROUND, roundIndex: 1 })
    })
    expect(
      store
        .getOperatorState()
        .entries.filter((entry) => entry.kind === 'roundSummary'),
    ).toHaveLength(2)
  })

  it('载回来的那几条住 `historyRounds`，⛔ 不混进 entries', () => {
    act(() => {
      store.loadOperatorThread({
        history: [],
        rounds: [ROUND],
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      })
    })
    const state = store.getOperatorState()
    expect(state.historyRounds).toEqual([ROUND])
    expect(state.entries).toEqual([])
  })

  it('就地编辑同时改在飞那条与载回来那条，并标 editedByUser', () => {
    act(() => {
      store.loadOperatorThread({
        history: [],
        rounds: [ROUND],
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      })
      store.appendOperatorRoundSummary(ROUND)
      store.updateOperatorRoundSummary(0, {
        facts: ['我改过的'],
        decisions: [],
        todos: ['等我确认'],
      })
    })
    const state = store.getOperatorState()
    expect(state.historyRounds[0]).toMatchObject({
      facts: ['我改过的'],
      todos: ['等我确认'],
      editedByUser: true,
      // ⚠ 编号与时刻原样留着 —— 它们是这条记录的出处与身份。
      evidenceRefs: ['#e12'],
      createdAt: ROUND.createdAt,
    })
    const live = state.entries.find((entry) => entry.kind === 'roundSummary')
    expect(live).toMatchObject({
      summary: { facts: ['我改过的'], editedByUser: true },
    })
  })

  it('＋新对话把载回来的那几条也清掉', () => {
    act(() => {
      store.loadOperatorThread({
        history: [],
        rounds: [ROUND],
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      })
      store.resetOperatorThread()
    })
    expect(store.getOperatorState().historyRounds).toEqual([])
  })
})

// ─── 隐身（56a 切片 4）────────────────────────────────────────────

describe('隐身', () => {
  /**
   * ⚠ store 是模块级的 —— 每条用例自己摆状态、自己收拾，⛔ 不依赖用例顺序。
   */
  it('默认关着；切开 / 切回都真的落进状态', () => {
    expect(store.getOperatorState().incognito).toBe(false)

    act(() => {
      store.setOperatorIncognito(true)
    })
    expect(store.getOperatorState().incognito).toBe(true)

    act(() => {
      store.setOperatorIncognito(false)
    })
    expect(store.getOperatorState().incognito).toBe(false)
  })

  it('⛔ 切开隐身不动这条线程的任何别的东西', () => {
    act(() => {
      store.loadOperatorThread({
        history: [],
        rounds: [],
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      })
      store.setOperatorIncognito(true)
    })
    expect(store.getOperatorState().sessionId).toBe('conv-1')
    expect(store.getOperatorState().sessionSurface).toBe('IMAGE_STUDIO')
    act(() => {
      store.setOperatorIncognito(false)
      store.resetOperatorThread()
    })
  })
})
