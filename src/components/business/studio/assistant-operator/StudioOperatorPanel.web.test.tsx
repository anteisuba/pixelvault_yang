// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type { UseStudioOperatorUploadResult } from '@/hooks/use-studio-operator-upload'
import type { UseStudioOperatorWebImportResult } from '@/hooks/use-studio-operator-web-import'

/**
 * **接线闸**（切片 3a）：四种卡真的出现在时间线里。
 *
 * ⭐ 这份用例存在的理由：前四片把 `StudioOperatorQuestionCard` /
 * `StudioOperatorSpendConfirmCard` / `RuleChip` / `StudioOperatorAssetChoiceCard`
 * 各自写完并单测过了，但**没有任何调用方** —— 四个组件全绿、面板里一张都不出。
 * 组件级用例永远发现不了这种失败，只有「把 store 摆成那个状态、看面板画了什么」
 * 才发现得了。
 *
 * 钉五件事：
 *  ① 计划卡（`awaitingPlan`）· ② 花钱硬确认卡 · ③ 歧义反问单选卡 · ④ 规则薄卡；
 *  ⑤ 结果行卡的数据源是**宿主契约的 `results`**，⛔ 不是 `useStudioGen`
 *     （LoRA 装配台上那条 context 根本不存在）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    return t
  },
  useFormatter: () => ({ dateTime: () => '09-06 12:00' }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('motion/react', () => ({
  motion: { div: 'div' },
  useReducedMotion: () => true,
}))

/** 模型 chip 点开的是现有「自动路由」组件（拍板 11）—— 这里不验它。 */
vi.mock('@/components/business/node/CanvasAssistantRouteSelector', () => ({
  CanvasAssistantRouteSelector: () => <span data-testid="route-selector" />,
}))

vi.mock('@/hooks/use-studio-assistant-controls', () => ({
  useStudioAssistantControls: () => ({
    route: { apiKeyId: null, modelId: null },
    setRoute: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({ profile: null }),
}))

const HOST_RESULTS = [
  { id: 'gen-1', url: 'https://cdn.test/a.png', label: '第一张' },
  { id: 'gen-2', url: 'https://cdn.test/b.png', label: '第二张' },
]

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: 'image' as const,
    buildSnapshot: () => ({
      prompt: '',
      availableModels: [],
      references: { items: HOST_RESULTS.map(({ url }) => ({ url })), limit: 4 },
    }),
    results: HOST_RESULTS,
    referenceLimit: 4,
    referenceImages: [
      ...HOST_RESULTS.map(({ url }) => ({ url })),
      { url: 'https://cdn.test/disabled.png', disabledReason: 'over_limit' },
    ],
    open: true,
    setOpen: vi.fn(),
    apply: {},
  }),
}))

type Store = typeof import('@/hooks/use-studio-operator-store')
type PanelModule = typeof import('./StudioOperatorPanel')

let store: Store
let Panel: PanelModule['StudioOperatorPanel']

const answerQuestions = vi.fn()
const revisePlan = vi.fn()
const answerSpend = vi.fn()
const answerChoice = vi.fn()

/**
 * ⚠ store 是**模块级单例**，用例之间必须换新的一份，而面板也要在同一次 reset
 * 之后 import —— 顶层 import 拿到的是同一份（照抄 store 用例的头注）。
 */
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  initialAttachments = []
  store = await import('@/hooks/use-studio-operator-store')
  Panel = (await import('./StudioOperatorPanel')).StudioOperatorPanel
})

const HISTORY = {
  sessions: [],
  currentSessionId: null,
  isHydrating: false,
  error: null,
  selectSession: vi.fn(),
} as unknown as UseStudioOperatorHistoryResult

const UPLOAD = {
  uploads: [],
  uploadFiles: vi.fn(),
  retryUpload: vi.fn(),
  dismissUpload: vi.fn(),
} as unknown as UseStudioOperatorUploadResult

const WEB_IMPORT = {
  states: {},
  limit: 4,
  toggleCandidate: vi.fn(),
} as unknown as UseStudioOperatorWebImportResult

const onOpenProjectRules = vi.fn()
const onOpenAssistantSettings = vi.fn()

const send = vi.fn()
const changeAttachments = vi.fn()
let initialAttachments: readonly StudioOperatorAttachment[] = []

function PanelHarness() {
  const [draft, setDraft] = useState('')
  return (
    <Panel
      operator={
        {
          domain: 'image',
          routeModelId: undefined,
          send,
          stop: vi.fn(),
          cancelQueued: vi.fn(),
          answerConfirm: vi.fn(),
          answerQuestions,
          revisePlan,
          answerSpend,
          cancelSpend: vi.fn(),
          answerChoice,
          critique: vi.fn(),
          newThread: vi.fn(),
        } as unknown as Parameters<typeof Panel>[0]['operator']
      }
      draft={draft}
      onDraftChange={setDraft}
      attachments={initialAttachments}
      onAttachmentsChange={changeAttachments}
      upload={UPLOAD}
      webImport={WEB_IMPORT}
      history={HISTORY}
      onOpenAssistantSettings={onOpenAssistantSettings}
      onOpenProjectRules={onOpenProjectRules}
      onCollapse={vi.fn()}
    />
  )
}

function renderPanel() {
  render(<PanelHarness />)
}

describe('StudioOperatorPanel 接线（切片 3a）', () => {
  it('助手正文选择缩略图引用后，发送实际图片并保留对应编号', () => {
    renderPanel()
    const editor = screen.getByRole('textbox', { name: 'placeholderIdle' })
    editor.focus()
    editor.textContent = '采用@'
    const range = document.createRange()
    range.selectNodeContents(editor)
    if (editor.firstChild) range.setStart(editor.firstChild, 3)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    fireEvent.input(editor)
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByTestId('operator-input-area')).toContainElement(
      screen.getByRole('listbox'),
    )
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
    expect(editor.querySelector('img')).toHaveAttribute(
      'src',
      HOST_RESULTS[1].url,
    )
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(send).toHaveBeenCalledWith('采用reference image 2', [
      expect.objectContaining({
        url: HOST_RESULTS[1].url,
        kind: 'image',
        label: 'reference image 2',
      }),
    ])
    expect(editor.textContent).toBe('')
  })

  it('sends shared enabled references and keeps all reference images after sending', () => {
    initialAttachments = [
      ...HOST_RESULTS.map((item) => ({ ...item, kind: 'image' as const })),
      {
        id: 'disabled',
        kind: 'image',
        url: 'https://cdn.test/disabled.png',
        label: 'disabled',
      },
      {
        id: 'audio',
        kind: 'audio',
        url: 'https://cdn.test/audio.mp3',
        label: 'audio',
      },
    ]
    renderPanel()
    const editor = screen.getByRole('textbox', { name: 'placeholderIdle' })
    editor.textContent = '一起参考'
    fireEvent.input(editor)
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(send).toHaveBeenCalledWith('一起参考', [
      expect.objectContaining({
        url: HOST_RESULTS[0].url,
        label: 'reference image 1',
      }),
      expect.objectContaining({
        url: HOST_RESULTS[1].url,
        label: 'reference image 2',
      }),
      expect.objectContaining({ kind: 'audio' }),
    ])
    expect(changeAttachments).toHaveBeenCalledWith(
      initialAttachments.slice(0, 3),
    )
  })

  it('历史调查默认折叠，最终结论与失败仍直接显示', () => {
    store.loadOperatorThread({
      sessionId: null,
      sessionSurface: null,
      history: [
        { kind: 'message', id: 'intro', text: '正在核实资料' },
        {
          kind: 'step',
          id: 'search',
          tool: 'search_web',
          title: '检索资料',
          status: 'done',
          undone: false,
        },
        { kind: 'message', id: 'answer', text: '已核实的最终结论' },
        {
          kind: 'step',
          id: 'failure',
          tool: 'search_web',
          title: '搜索失败',
          status: 'error',
          undone: false,
        },
      ],
    })
    renderPanel()
    const disclosure = screen.getByTestId('operator-research')
    expect(disclosure).not.toHaveAttribute('open')
    expect(disclosure).toContainElement(screen.getByText('正在核实资料'))
    expect(disclosure).toContainElement(screen.getByText('检索资料'))
    expect(disclosure).not.toContainElement(
      screen.getByText('已核实的最终结论'),
    )
    expect(disclosure).not.toContainElement(screen.getByText('搜索失败'))
  })

  it('① 待确认卡钉在流末尾 —— 一轮只有一张，「开始」把答复交给驱动 hook', () => {
    store.setOperatorPlan({
      id: 'plancard-1',
      steps: [
        { id: 'plan-1', label: '写提示词' },
        { id: 'plan-2', label: '挂参考图' },
        { id: 'plan-3', label: '备好生成键' },
      ],
      questions: [],
      answers: [],
      estimate: { credits: 4 },
      resolved: false,
    })
    store.setOperatorStatus('awaitingPlan')
    renderPanel()

    expect(screen.getByTestId('operator-question-card')).toBeTruthy()
    // 没有题 → 阶段清单默认展开（那时它就是这张卡的全部内容）。
    expect(screen.getAllByTestId('operator-plan-step')).toHaveLength(3)
    fireEvent.click(screen.getByTestId('operator-question-start'))
    // 没有题 → 空数组，⛔ 不是 undefined（服务端那边按数组读）。
    expect(answerQuestions).toHaveBeenCalledWith([])
  })

  it('⭐ 有题时只有一张卡 —— ⛔ 阶段清单不再另起一张（第 2 件）', () => {
    store.setOperatorPlan({
      id: 'plancard-2',
      steps: [{ id: 'plan-1', label: '写提示词' }],
      questions: [
        {
          id: 'q1',
          header: '取景',
          question: '要取到多少身？',
          multiSelect: false,
          allowOther: false,
          options: [
            { id: 'o1', label: '半身', description: '腰以上' },
            { id: 'o2', label: '全身', description: '连鞋一起' },
          ],
        },
      ],
      answers: [],
      estimate: { credits: 4 },
      resolved: false,
    })
    store.setOperatorStatus('awaitingPlan')
    renderPanel()

    expect(screen.getAllByTestId('operator-question-card')).toHaveLength(1)
    // 有题 → 阶段清单折着（一行「计划 · N 步」）。
    expect(screen.queryAllByTestId('operator-plan-step')).toHaveLength(0)
    expect(screen.getByTestId('operator-plan-fold')).toBeTruthy()
  })

  it('不显示实时或历史工作台切换提示', () => {
    store.loadOperatorThread({
      sessionId: null,
      sessionSurface: null,
      history: [
        { kind: 'domainMark', id: 'old-mark', domain: 'video' },
        { kind: 'message', id: 'old-message', text: '保留的对话' },
        { kind: 'domainMark', id: 'old-mark-2', domain: 'image' },
      ],
    })
    for (const [index, domain] of ['image', 'video', 'image'].entries()) {
      store.appendOperatorEntry({
        kind: 'domainMark',
        id: `mark-${index}`,
        domain: domain as 'image' | 'video',
      })
    }
    renderPanel()

    expect(screen.queryByTestId('operator-domain-mark')).toBeNull()
    expect(screen.queryByTestId('operator-history-domain-mark')).toBeNull()
    expect(screen.getByText('保留的对话')).toBeTruthy()
  })

  it('⭐ 历史只摊开最近两轮，更早的折成一行（第 5 件）', () => {
    store.loadOperatorThread({
      sessionId: null,
      sessionSurface: null,
      history: [
        { kind: 'user', id: 'u1', text: '第一轮', attachments: [] },
        { kind: 'message', id: 'a1', text: '第一轮答' },
        { kind: 'user', id: 'u2', text: '第二轮', attachments: [] },
        { kind: 'message', id: 'a2', text: '第二轮答' },
        { kind: 'user', id: 'u3', text: '第三轮', attachments: [] },
        { kind: 'message', id: 'a3', text: '第三轮答' },
      ],
    })
    renderPanel()

    const older = screen.getByTestId('operator-history-older')
    expect(older).toContainElement(screen.getByText('第一轮'))
    // 最近两轮摊在外面 —— ⛔ 不折掉「我刚才让它改的那件事」。
    expect(older).not.toContainElement(screen.getByText('第二轮'))
    expect(older).not.toContainElement(screen.getByText('第三轮'))
  })

  it('② 花钱硬确认卡出现，四要素齐；点「生成」把「不再问」一起交出去', () => {
    store.setOperatorSpend({
      id: 'spend-1',
      request: {
        model: { id: 'seedream-4', label: 'Seedream 4' },
        count: 2,
        specs: { aspectRatio: '3:4', resolution: '2K', durationSeconds: null },
        estimate: { credits: 8 },
      },
      resolved: false,
    })
    renderPanel()

    expect(screen.getByTestId('operator-spend-model').textContent).toBe(
      'Seedream 4',
    )
    expect(screen.getByTestId('operator-spend-count').textContent).toBe('2')
    fireEvent.click(screen.getByTestId('operator-spend-remember'))
    fireEvent.click(screen.getByTestId('operator-spend-confirm'))
    expect(answerSpend).toHaveBeenCalledWith({ rememberForSession: true })
  })

  it('③ 歧义反问单选卡出现，点一张走 `answerChoice`', () => {
    const options = [
      {
        id: 'gen-1',
        url: 'https://cdn.test/a.png',
        label: '结果①',
        kind: 'image' as const,
        thumbnailUrl: 'https://cdn.test/a.png',
      },
      {
        id: 'gen-2',
        url: 'https://cdn.test/b.png',
        label: '结果②',
        kind: 'image' as const,
        thumbnailUrl: 'https://cdn.test/b.png',
      },
    ]
    store.setOperatorChoice({
      id: 'choice-1',
      question: '你说的是哪一张？',
      options,
      chosenId: null,
    })
    renderPanel()

    const grid = screen.getAllByTestId('operator-asset-choice-option')
    expect(grid).toHaveLength(2)
    fireEvent.click(grid[1] as HTMLElement)
    expect(answerChoice).toHaveBeenCalledTimes(1)
    expect(answerChoice.mock.calls[0]?.[0]).toMatchObject({ id: 'gen-2' })
  })

  it('④ 规则薄卡长在时间线里；「查看规则」开设置弹层的规则页', () => {
    store.appendOperatorEntry({
      kind: 'rule',
      id: 'rule-entry-1',
      ruleId: 'rule-1',
      text: '主角的耳环永远在左边',
      source: 'creator',
      createdAt: '2026-08-14T02:00:00.000Z',
    })
    renderPanel()

    expect(screen.getByText('主角的耳环永远在左边')).toBeTruthy()
    fireEvent.click(screen.getByText('view'))
    expect(onOpenProjectRules).toHaveBeenCalledTimes(1)
  })

  /**
   * ⭐ 助手设置的入口在**进度带上**（owner 2026-09-07）—— 面板这一层验的是
   * 「接线还在」：齿轮那颗组件级用例已经绿了，而面板不把 `onOpenAssistantSettings`
   * 递下去的话，点它什么都不会发生。
   */
  it('⭐ 进度带上那颗常驻齿轮点得开助手设置', () => {
    renderPanel()
    const gear = screen.getByTestId('operator-assistant-settings')
    expect(gear.tagName).toBe('BUTTON')
    fireEvent.click(gear)
    expect(onOpenAssistantSettings).toHaveBeenCalledTimes(1)
  })

  it('⑤ 结果行卡读的是**宿主的 results**（⛔ 不是 useStudioGen）', () => {
    renderPanel()
    expect(screen.getByTestId('operator-result-row')).toBeTruthy()
    expect(screen.getAllByTestId('operator-result-tile')).toHaveLength(
      HOST_RESULTS.length,
    )
  })
})

/**
 * 流式与加载态的**接线闸**（§4.1）。
 *
 * ⭐ 与上面那份同一条论据：`StudioOperatorTimelineList` 与
 * `StudioOperatorStreamingText` 各自单测都绿，而面板不用它们的话屏幕上什么都
 * 没变 —— 组件级用例永远发现不了这种失败。
 */
describe('StudioOperatorPanel · 流式正文与加载态', () => {
  it('时间线容器是 B3 那颗 role=log 的 polite live region', () => {
    renderPanel()
    const thread = screen.getByTestId('operator-thread')
    expect(thread).toHaveAttribute('role', 'log')
    expect(thread).toHaveAttribute('aria-live', 'polite')
    // 滚的仍然是这一层 —— 换容器不许把滚动挪走。
    expect(thread.className).toContain('overflow-y-auto')
  })

  it('空正文 + streaming = 占位行（头像那一档 + 三点脉冲），⛔ 不是一行空白', () => {
    store.appendOperatorPending('run-1:msg-0')
    renderPanel()
    expect(screen.getByTestId('operator-message-pending')).toBeTruthy()
    // 占位行挂在**助手**那一档的沟位上 —— 头像必须已经在了。
    const rows = screen.getAllByTestId('operator-timeline-row')
    expect(rows.at(-1)?.dataset.node).toBe('assistant')
  })

  it('长出来的正文按片渲染，定稿之后 streaming 落下来', () => {
    store.appendOperatorPending('run-1:msg-0')
    store.appendOperatorMessageDelta('run-1:msg-0', '夜景')
    renderPanel()
    expect(
      screen
        .getAllByTestId('operator-message-slice')
        .map((node) => node.textContent),
    ).toEqual(['夜', '景'])
    expect(screen.getByTestId('operator-message-text').dataset.streaming).toBe(
      'true',
    )
  })
})

/**
 * 2026-09-07 真机三条的**接线闸**（调查卡 / checkpoint 去重）。
 *
 * ⭐ 与上面同一条论据：判据本身在 `lib/studio-operator-timeline.ts` 里单测过了，
 * 但面板不用它的话屏幕上一点没变。
 */
describe('StudioOperatorPanel · 空调查卡与重复 checkpoint', () => {
  /** 一条跑完的步 —— `upsertOperatorStep` 收的形状。 */
  function pushStep(runKey: string, step: Record<string, unknown>): void {
    store.upsertOperatorStep(
      step as unknown as Parameters<typeof store.upsertOperatorStep>[0],
      runKey,
    )
  }

  it('⭐ 证据与候选都为空 → ⛔ 不画调查卡，这一组退回 ToolGroup', () => {
    pushStep('run-1', {
      id: 'step-1',
      title: '查了一下',
      tool: 'research',
      status: 'done',
      payload: { goal: '', round: 1, sources: ['web'] },
      result: { evidence: [], totalFound: 0 },
    })
    renderPanel()
    expect(screen.queryByTestId('operator-research-card')).toBeNull()
    // 过程没有被藏起来 —— 折叠行还在。
    expect(screen.getByTestId('operator-tool-group')).toBeTruthy()
  })

  it('有一条证据就照旧画调查卡', () => {
    pushStep('run-1', {
      id: 'step-1',
      title: '查了一下',
      tool: 'research',
      status: 'done',
      payload: { goal: '找官方设定', round: 1, sources: ['web'] },
      result: {
        evidence: [
          {
            title: '官方设定集',
            publisher: '官网',
            snippet: '披风是深红',
            kind: 'official',
            confidence: 'high',
          },
        ],
      },
    })
    renderPanel()
    expect(screen.getByTestId('operator-research-card')).toBeTruthy()
  })

  it('⭐ 一轮被正文劈成两个工具块时，checkpoint 只出**一张**', () => {
    pushStep('run-1', {
      id: 'step-1',
      title: '写提示词',
      tool: 'set_prompt',
      status: 'done',
      payload: { value: '夜景' },
      inverse: { tool: 'set_prompt', payload: { value: '' } },
    })
    store.appendOperatorEntry({
      kind: 'message',
      id: 'msg-1',
      text: '顺手说一句',
    })
    pushStep('run-1', {
      id: 'step-2',
      title: '再写一次提示词',
      tool: 'set_prompt',
      status: 'done',
      payload: { value: '夜景 + 霓虹' },
      inverse: { tool: 'set_prompt', payload: { value: '夜景' } },
    })
    renderPanel()

    // 两个工具块（正文把它们劈开了）——⛔ 但 checkpoint 只归最后那一个。
    expect(screen.getAllByTestId('operator-tool-group')).toHaveLength(2)
    expect(screen.getAllByTestId('operator-checkpoint')).toHaveLength(1)
  })
})
