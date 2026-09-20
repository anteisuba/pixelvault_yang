// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_KEEP_OPEN_ATTR } from '@/constants/studio-assistant-operator'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type { UseStudioOperatorUploadResult } from '@/hooks/use-studio-operator-upload'
import type { UseStudioOperatorWebImportResult } from '@/hooks/use-studio-operator-web-import'

/**
 * **接线闸**：五类卡真的出现在它们该在的地方（v2 §3.2 / §3.4）。
 *
 * ⭐ 这份用例存在的理由：卡片各自写完并单测过了，也可能**没有任何调用方**
 * —— 组件全绿、面板里一张都不出。
 * 组件级用例永远发现不了这种失败，只有「把 store 摆成那个状态、看面板画了什么」
 * 才发现得了。
 *
 * 钉五件事：
 *  ① 计划卡（`awaitingPlan`）· ② 花钱硬确认卡 · ③ 歧义反问单选卡 · ④ 规则薄卡；
 *  ⑤ 结果行卡的数据源是**宿主契约的 `results`**，⛔ 不是 `useStudioGen`
 *     （LoRA 装配台上那条 context 根本不存在）。
 */

/**
 * ⚠ 回执那一行的去处（56a）走 `@/i18n/navigation`，而那条链在 jsdom 里会去解
 * `next/navigation` —— 这份用例验的是**面板接线**，不是路由。桩掉它。
 */
vi.mock('@/hooks/use-open-assistant-memory', () => ({
  useOpenAssistantMemory: () => vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    return Object.assign(t, { has: () => true })
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

/**
 * 模型 chip 有自己的一份闸（`StudioOperatorModelChip.web.test.tsx`）——
 * 这里只桩掉它要的 key 表，免得面板测试连上 `ApiKeysProvider`。
 */
vi.mock('@/hooks/use-llm-route-picker', () => ({
  useLLMRoutePicker: () => ({
    savedRoutes: [],
    lockedRoutes: [],
    allRoutes: [],
    healthMap: {},
  }),
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({ profile: null }),
}))

/** ⛔ 用例里不打真请求。 */
const fetchGalleryImages = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client/gallery', () => ({
  fetchGalleryImages,
  fetchGenerationByIdAPI: vi.fn(),
}))

/**
 * 素材库弹层（切片 #7c）—— 桩成「一颗按钮 = 挑完两张」，⛔ 不把整个 picker
 * 拉进面板用例：它自己有一份闸（`AssetPickerBrowser.test.tsx`）。
 */
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    mediaType,
    multiSelect,
    pageSize,
    onConfirmMany,
  }: {
    mediaType?: string
    multiSelect?: boolean
    pageSize?: number
    onConfirmMany?: (generations: unknown[]) => void
  }) => (
    <div
      data-testid="asset-selector-dialog"
      data-media-type={mediaType}
      data-multi={String(Boolean(multiSelect))}
      data-page-size={String(pageSize)}
    >
      <button
        type="button"
        data-testid="asset-selector-confirm-many"
        onClick={() => onConfirmMany?.(libraryPicks)}
      />
    </div>
  ),
}))

const applyDispatch = vi.hoisted(() => vi.fn())

const HOST_RESULTS = [
  { id: 'gen-1', url: 'https://cdn.test/a.png', label: '第一张' },
  { id: 'gen-2', url: 'https://cdn.test/b.png', label: '第二张' },
]

/**
 * 这个宿主有没有「点开规格弹层」那只手（D7c ④ · `face.openSpec`）。
 *
 * ⚠ 可变盒子：工作台有、画布与 LoRA 装配台没有 —— 两档都要能验，而 mock 工厂
 * 只跑一次。
 */
const HOST_SPEC = vi.hoisted(() => ({
  openSpec: null as null | (() => void),
}))

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: 'image' as const,
    /** 四张脸那一格（D7b ③）—— 面板读 `face` 而不是按 domain 取药丸表。 */
    face: {
      domainIcon: () => null,
      contextLine: () => 'Seedream 5.0 Pro · 1:1 · 4 张',
      emptyLine: '说你想要的画面，我来写提示词、挑模型、配参考。',
      starterPills: ['把这句写成好提示词', '换个模型看差别'],
      inputPlaceholder: '描述画面，或把参考图挂进来…',
      ...(HOST_SPEC.openSpec ? { openSpec: HOST_SPEC.openSpec } : {}),
    },
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
    apply: {
      getState: () => ({ prompt: '原始提示词' }),
      dispatch: applyDispatch,
    },
  }),
}))

type Store = typeof import('@/hooks/use-studio-operator-store')
type PanelModule = typeof import('./StudioOperatorPanel')

let store: Store
let Panel: PanelModule['StudioOperatorPanel']

const answerQuestion = vi.fn()
const approvePlan = vi.fn()
const declinePlan = vi.fn()
const revisePlan = vi.fn()
const confirmGeneration = vi.fn()
const cancelGeneration = vi.fn()
const retryGeneration = vi.fn()

/**
 * ⚠ store 是**模块级单例**，用例之间必须换新的一份，而面板也要在同一次 reset
 * 之后 import —— 顶层 import 拿到的是同一份（照抄 store 用例的头注）。
 */
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  initialAttachments = []
  libraryPicks = [
    {
      id: 'lib-1',
      url: 'https://cdn.test/lib-1.png',
      prompt: '库里那张海报',
      outputType: 'IMAGE',
    },
    {
      id: 'lib-2',
      url: 'https://cdn.test/lib-2.png',
      prompt: '库里那张插画',
      outputType: 'IMAGE',
    },
  ]
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

/** 素材库弹层里「挑中」的那些 —— 用例各自改。 */
let libraryPicks: unknown[] = []

const onOpenProjectRules = vi.fn()
const onOpenAssistantSettings = vi.fn()
const onSelectRouteModel = vi.fn().mockResolvedValue(true)

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
          send,
          stop: vi.fn(),
          cancelQueued: vi.fn(),
          answerQuestion,
          approvePlan,
          declinePlan,
          revisePlan,
          confirmGeneration,
          cancelGeneration,
          retryGeneration,
          cancelSpend: vi.fn(),
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
      onSelectRouteModel={onSelectRouteModel}
      onOpenProjectRules={onOpenProjectRules}
      onCollapse={vi.fn()}
      headerAvatarOwned={false}
    />
  )
}

function renderPanel() {
  render(<PanelHarness />)
}

describe('StudioOperatorPanel 接线（切片 3a）', () => {
  it('点击评价建议会实际更新宿主提示词并显示成功状态', () => {
    store.upsertOperatorStep(
      {
        id: 'advice-step',
        title: '看图',
        tool: 'critique_result',
        verb: 'look',
        status: 'done',
        payload: { imageUrl: 'https://cdn.test/result.png', goal: '3D渲染' },
        result: {
          findings: [{ severity: 'warn', text: '质感偏插画' }],
          advice: '强化3D材质',
          borrowedVisionRoute: false,
        },
      },
      'advice-run',
    )
    renderPanel()
    fireEvent.click(screen.getByTestId('operator-critique-apply-advice'))
    expect(applyDispatch).toHaveBeenCalledWith({
      type: 'SET_PROMPT',
      payload: '原始提示词, 强化3D材质',
    })
    expect(
      screen.getByTestId('operator-critique-apply-advice'),
    ).toHaveTextContent('critique.adviceApplied')
  })

  it.each(['live', 'history'] as const)(
    '提问附件在 %s 显示图片缩略图，不将音频当成图片',
    (mode) => {
      const entry = {
        kind: 'user' as const,
        id: 'question-with-images',
        text: '画风参考reference image 2，再看reference image 2，reference image 4。',
        attachments: [
          {
            id: 'ref',
            kind: 'image' as const,
            label: 'reference image 1',
            url: 'https://cdn.test/ref.png',
            thumbnailUrl: 'https://cdn.test/thumb.png',
          },
          {
            id: 'ref2',
            kind: 'image' as const,
            label: 'reference image 2',
            url: 'https://cdn.test/ref2.png',
          },
          {
            id: 'audio',
            kind: 'audio' as const,
            label: 'voice sample',
            url: 'https://cdn.test/voice.mp3',
          },
        ],
      }
      if (mode === 'history') {
        store.loadOperatorThread({
          sessionId: null,
          sessionSurface: null,
          history: [entry],
        })
      } else {
        store.appendOperatorEntry(entry)
      }
      renderPanel()
      expect(
        screen.queryByRole('img', { name: 'reference image 1' }),
      ).toBeNull()
      expect(
        screen.getAllByRole('img', { name: 'reference image 2' })[0],
      ).toHaveAttribute('src', 'https://cdn.test/ref2.png')
      expect(screen.queryByRole('img', { name: 'voice sample' })).toBeNull()
      expect(screen.getByText('voice sample')).toBeTruthy()
      const body = within(screen.getByTestId('operator-user-text'))
      expect(
        body.getAllByRole('img', { name: 'reference image 2' }),
      ).toHaveLength(2)
      expect(
        body.getAllByRole('img', { name: 'reference image 2' })[0],
      ).toHaveAttribute('src', 'https://cdn.test/ref2.png')
      expect(body.queryByRole('img', { name: 'reference image 4' })).toBeNull()
      expect(screen.getByTestId('operator-user-text')).toHaveTextContent(
        'reference image 4',
      )
      /* 用户消息靠右 —— 实时与历史回放同一套对齐（画板 Main / BCards）：
         行标 `data-align="end"`，头像排在气泡之后 = 视觉上在右侧。 */
      const userRow = screen
        .getByTestId('operator-user-text')
        .closest('[data-testid="operator-timeline-row"]')
      expect(userRow).not.toBeNull()
      expect((userRow as HTMLElement).dataset.align).toBe('end')
      const userAvatar = within(userRow as HTMLElement).getByTestId(
        'operator-timeline-avatar',
      )
      expect(userAvatar.dataset.speaker).toBe('user')
      expect(
        within(userRow as HTMLElement)
          .getByTestId('operator-timeline-content')
          .compareDocumentPosition(userAvatar) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    },
  )

  it('助手正文选择缩略图引用后，发送实际图片并保留对应编号', () => {
    renderPanel()
    const editor = screen.getByRole('textbox', {
      name: '描述画面，或把参考图挂进来…',
    })
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
    /**
     * 2026-09-11 回归的钉子：候选浮层是 `position: fixed`，只有挂在
     * `document.body` 下才以视口为参照。面板换成 `assistant-glass-panel`
     * （`backdrop-filter` 生成包含块）+ `overflow-hidden` 之后，portal 进面板的
     * 浮层会被接管坐标再被裁掉——实测落在输入区右下角压着发送键。
     * ⛔ 别把它 portal 回任何面板 / 卡片里。
     */
    const listbox = screen.getByRole('listbox')
    expect(listbox.parentElement).toBe(document.body)
    for (
      let node = listbox.parentElement;
      node;
      node = node.parentElement as HTMLElement | null
    ) {
      expect(node.className).not.toContain('overflow-hidden')
    }
    // portal 出面板后，点候选不能被「注意力收放法则」当成点了面板外面。
    expect(listbox.hasAttribute(STUDIO_OPERATOR_KEEP_OPEN_ATTR)).toBe(true)
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

  it('已有消息中的媒体地址显示为简短引用名称', () => {
    const attachment: StudioOperatorAttachment = {
      id: 'clip',
      kind: 'video',
      label: '视频',
      url: 'https://cdn.test/long-source.mp4',
    }
    store.appendOperatorEntry({
      kind: 'user',
      id: 'media-message',
      text: '视频 (video) https://cdn.test/long-source.mp4 分析画风',
      attachments: [attachment],
    })
    renderPanel()
    expect(screen.getByTestId('operator-user-text')).toHaveTextContent(
      '@视频 分析画风',
    )
    expect(screen.getByTestId('operator-user-text')).not.toHaveTextContent(
      'https://',
    )
  })

  it.each(['video', 'audio'] as const)(
    '@ 候选包含上传的 %s，选择后发送对应文件且不将媒体 URL 当缩略图',
    (kind) => {
      const attachment: StudioOperatorAttachment = {
        id: `${kind}-upload`,
        kind,
        url: `https://cdn.test/sample.${kind === 'audio' ? 'mp3' : 'mp4'}`,
        label: `${kind} sample`,
      }
      initialAttachments = [attachment]
      renderPanel()
      const editor = screen.getByRole('textbox', {
        name: '描述画面，或把参考图挂进来…',
      })
      editor.focus()
      editor.textContent = '参考@'
      const range = document.createRange()
      range.selectNodeContents(editor)
      if (editor.firstChild) range.setStart(editor.firstChild, 3)
      range.collapse(true)
      document.getSelection()?.removeAllRanges()
      document.getSelection()?.addRange(range)
      fireEvent.input(editor)
      expect(screen.getAllByRole('option')).toHaveLength(3)
      fireEvent.click(screen.getByRole('option', { name: attachment.label }))
      expect(send).not.toHaveBeenCalled()
      expect(editor.textContent).toContain(attachment.label)
      expect(editor.querySelector('img')).toBeNull()
      fireEvent.keyDown(editor, { key: 'Enter' })
      expect(send).toHaveBeenCalledWith(`参考@${attachment.label}`, [
        attachment,
      ])
    },
  )

  it('IME 选字回车不发送，过一会儿再回车才发送', () => {
    const now = vi.spyOn(performance, 'now')
    renderPanel()
    const editor = screen.getByRole('textbox', {
      name: '描述画面，或把参考图挂进来…',
    })
    editor.textContent = '改成夜景'
    fireEvent.input(editor)
    now.mockReturnValue(0)
    fireEvent.compositionStart(editor)
    fireEvent.compositionEnd(editor)
    now.mockReturnValue(10)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
    now.mockReturnValue(150)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(send).toHaveBeenCalledWith('改成夜景', [])
    now.mockRestore()
  })

  it.each([false, true])(
    '只发送正文 @ 的图片，保留共享参考图（有引用：%s）',
    (hasMention) => {
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
      const editor = screen.getByRole('textbox', {
        name: '描述画面，或把参考图挂进来…',
      })
      editor.textContent = hasMention ? '一起参考@Image2' : '一起参考'
      fireEvent.input(editor)
      fireEvent.click(screen.getByRole('button', { name: 'send' }))
      expect(send).toHaveBeenCalledWith(
        hasMention ? '一起参考reference image 2' : '一起参考',
        [
          expect.objectContaining({ kind: 'audio' }),
          ...(hasMention
            ? [
                expect.objectContaining({
                  url: HOST_RESULTS[1].url,
                  label: 'reference image 2',
                }),
              ]
            : []),
        ],
      )
      expect(changeAttachments).toHaveBeenCalledWith(
        initialAttachments.slice(0, 3),
      )
    },
  )

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
    const groups = screen.getAllByTestId('operator-tool-group')
    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.dataset.open === 'false')).toBe(true)
    expect(screen.getByText('正在核实资料')).toBeVisible()
    expect(screen.getByText('已核实的最终结论')).toBeVisible()
    expect(screen.getByText('检索资料')).not.toBeVisible()
    expect(screen.getByTestId('operator-tool-group-blocker')).toHaveTextContent(
      '搜索失败',
    )
    fireEvent.click(
      within(groups[1]!).getByTestId('operator-tool-group-toggle'),
    )
    expect(
      within(groups[1]!).getByTestId('operator-history-step'),
    ).toBeVisible()
  })

  it('① 确认卡（多步）钉在流末尾 —— 一行动作串 +「开始」交给驱动 hook', () => {
    store.setOperatorConfirm({
      id: 'confirm-1',
      kind: 'multistep',
      steps: [
        { id: 'plan-1', label: '写提示词' },
        { id: 'plan-2', label: '挂参考图' },
        { id: 'plan-3', label: '备好生成键' },
      ],
      status: 'idle',
    })
    store.setOperatorStatus('awaitingPlan')
    renderPanel()

    const card = screen.getByTestId('operator-confirm-card')
    expect(card.dataset.kind).toBe('multistep')
    expect(screen.getByTestId('operator-confirm-steps')).toHaveTextContent(
      '写提示词 · 挂参考图 · 备好生成键',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(approvePlan).toHaveBeenCalledTimes(1)
  })

  /**
   * 五类之后**时间线上只剩一张待定卡**：问题卡钉到了输入框上方（§3.4），
   * ⛔ 它不许再出现在时间线容器里。
   */
  it('⭐ 问题块与输入框同框 —— ⛔ 不在时间线里（56b 切片 4）', () => {
    store.setOperatorQuestion({
      id: 'ask-1',
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
    })
    store.setOperatorStatus('awaitingConfirm')
    renderPanel()

    const card = screen.getByTestId('operator-question-block')
    // 「1 / 1」—— 一组一道题时进度仍旧写出来（⛔ 不为一道题特判）。
    expect(card.dataset.step).toBe('1')
    expect(card.dataset.total).toBe('1')
    expect(screen.getByTestId('operator-thread')).not.toContainElement(card)
    // 它长在输入区里：位置就是「输入框上方、同一个 composer 容器」。
    expect(
      screen.getByTestId('operator-input-area').parentElement,
    ).toContainElement(card)
  })

  it('⭐ 答完之后时间线落一行「你选了 X」（§3.4 落账规则 ①）', () => {
    store.appendOperatorEntry({
      kind: 'system',
      id: 'sys-question-1',
      code: 'questionAnswered',
      subject: '全身',
    })
    renderPanel()

    // 词表桩只回键名 —— 断言的是「落到了这一条系统行」而不是译文本身。
    const line = screen.getByTestId('operator-system-line')
    expect(line).toHaveTextContent('system.questionAnswered')
    expect(
      line
        .closest('[data-testid="operator-timeline-row"]')
        ?.getAttribute('data-card'),
    ).toBe('system')
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

  it('② 确认卡（生成）四颗旋钮在场；点「确认生成」走 `confirmGeneration`', () => {
    store.setOperatorConfirm({
      id: 'confirm-2',
      kind: 'generate',
      request: {
        model: { id: 'seedream-4', label: 'Seedream 4' },
        count: 2,
        specs: { aspectRatio: '3:4', resolution: '2K', durationSeconds: null },
      },
      status: 'idle',
    })
    renderPanel()

    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs[0]).toHaveTextContent('Seedream 4')
    expect(knobs[1]).toHaveTextContent('3:4')
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(confirmGeneration).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(cancelGeneration).toHaveBeenCalledTimes(1)
  })

  it('③ 问题卡的缩略图那一支：点一张走 `answerQuestion` 并带上素材', () => {
    store.setOperatorQuestion({
      id: 'ask-2',
      questions: [
        {
          id: 'q2',
          header: '候选',
          question: '你说的是哪一张？',
          multiSelect: false,
          allowOther: false,
          options: [
            {
              id: 'gen-1',
              label: '结果①',
              description: '',
              assetUrl: 'https://cdn.test/a.png',
            },
            {
              id: 'gen-2',
              label: '结果②',
              description: '',
              assetUrl: 'https://cdn.test/b.png',
            },
          ],
        },
      ],
      answers: [],
    })
    renderPanel()

    const grid = screen.getAllByTestId('operator-question-option')
    expect(grid).toHaveLength(2)
    fireEvent.click(grid[1] as HTMLElement)
    expect(answerQuestion).toHaveBeenCalledTimes(1)
    expect(answerQuestion.mock.calls[0]?.[1]).toMatchObject({
      label: '结果②',
      asset: { id: 'gen-2', url: 'https://cdn.test/b.png' },
    })
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
   * ⭐ 助手设置的入口在**头部那颗 ⋯ 菜单里**（D7b ④；此前是并排那颗齿轮）——
   * 面板这一层验的是「接线还在」：菜单项那颗组件级用例已经绿了，而面板不把
   * `onOpenAssistantSettings` 递下去的话，点它什么都不会发生。
   */
  it('⭐ 头部 ⋯ 菜单里的「设置」点得开助手设置', () => {
    renderPanel()
    fireEvent.pointerDown(
      screen.getByTestId('operator-more'),
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    )
    fireEvent.click(screen.getByTestId('operator-assistant-settings'))
    expect(onOpenAssistantSettings).toHaveBeenCalledTimes(1)
  })

  it('会话不再重复显示工作台生成结果大卡', () => {
    renderPanel()
    expect(screen.queryByTestId('operator-result-row')).toBeNull()
    expect(screen.queryByTestId('operator-result-expand')).toBeNull()
  })
})

/**
 * 正文与加载态的**接线闸**（§4.1 / v2 §13.1）。
 *
 * ⭐ 与上面那份同一条论据：`StudioOperatorTimelineList` 与
 * `StudioOperatorMessageBody` 各自单测都绿，而面板不用它们的话屏幕上什么都
 * 没变 —— 组件级用例永远发现不了这种失败。
 */
describe('StudioOperatorPanel · 正文与加载态', () => {
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

  it('定稿帧就地写进占位行 —— 正文整段出现，⛔ 不切片', () => {
    store.appendOperatorPending('run-1:msg-0')
    store.finalizeOperatorMessage('run-1:msg-0', '已经改成夜景了。')
    renderPanel()
    expect(screen.queryByTestId('operator-message-pending')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe(
      '已经改成夜景了。',
    )
    // ⛔ 逐字切片已删（v2 拍板 13）：正文是一个完整文本节点，读屏与用例都找得到。
    expect(screen.queryAllByTestId('operator-message-slice')).toHaveLength(0)
  })

  /**
   * ⭐ **§13.1 时间线重复消息** —— `message` → `plan` → `message`（同一条正文）
   * 之后线程里只有**一条**正文条目。
   *
   * 🔬 旧行为：计划帧把序号顶掉一位，定稿帧于是另起一条，同一段分析回复在计划
   * 的上下各出现一次（owner 真机「帮我看看这张参考」）。
   */
  it('⭐ message → plan → message：面板上只有一条正文', () => {
    store.finalizeOperatorMessage('run-1:msg-0', '这张参考是暖调人像。')
    store.appendOperatorEntry({
      kind: 'plan',
      id: 'plan-1',
      steps: ['读参考', '改提示词'],
    })
    store.finalizeOperatorMessage('run-1:msg-0', '这张参考是暖调人像。')
    renderPanel()
    expect(screen.getAllByTestId('operator-message-text')).toHaveLength(1)
  })
})

/**
 * 2026-09-07 真机三条的**接线闸**（调查卡 / checkpoint 去重）。
 *
 * ⭐ 与上面同一条论据：判据本身在 `lib/studio-operator-timeline.ts` 里单测过了，
 * 但面板不用它的话屏幕上一点没变。
 */
describe('StudioOperatorPanel · 空调查卡与重复 checkpoint', () => {
  it('⭐ 分析卡退场：看参考图那一条折进工具组，⛔ 不再出卡（56b 切片 5）', () => {
    pushStep('run-reference', {
      id: 'reference-analysis',
      title: '分析参考图',
      tool: 'analyze_references',
      verb: 'look',
      status: 'done',
      payload: {},
      result: {
        profiles: [],
        brief: {
          summary: '双人拥抱，保留指定画风',
          assignments: [
            {
              url: 'https://cdn.test/style.png',
              roles: ['style'],
              preserve: ['柔和明暗与块状发束'],
              exclude: ['原图背景'],
            },
          ],
          requirements: ['纯白背景'],
          avoid: [],
          uncertainties: [],
        },
      },
    })
    renderPanel()
    expect(screen.queryByTestId('operator-reference-analysis')).toBeNull()
    // 过程没有被藏起来 —— 它与其它步一样折在工具组里。
    expect(screen.getByTestId('operator-tool-group')).toBeTruthy()
  })

  /** 一条跑完的步 —— `upsertOperatorStep` 收的形状。 */
  function pushStep(runKey: string, step: Record<string, unknown>): void {
    store.upsertOperatorStep(
      step as unknown as Parameters<typeof store.upsertOperatorStep>[0],
      runKey,
    )
  }

  it('⭐ 调查卡退场：过程收成调查行，⛔ 时间线里不再有那张卡（56b 切片 1 / 2）', () => {
    pushStep('run-1', {
      id: 'step-1',
      title: '查了一下',
      tool: 'research',
      verb: 'research',
      status: 'done',
      payload: {
        goal: '找官方设定',
        round: 1,
        sources: ['web'],
        depth: 'quick',
        readPages: 3,
      },
      result: {
        evidence: [
          {
            title: '官方设定集',
            publisher: 'official.test',
            snippet: '披风是深红',
            kind: 'text',
            confidence: 'high',
            credibility: 'official',
            scope: 'character',
            corroboration: 1,
            cite: 1,
          },
        ],
      },
    })
    renderPanel()
    expect(screen.queryByTestId('operator-research-card')).toBeNull()
    // 过程没有被藏起来 —— 那一行还在，点它才展开步骤（56b 切片 2）。
    const line = screen.getByTestId('operator-research-progress')
    expect(line.dataset.depth).toBe('quick')
    expect(line.dataset.state).toBe('done')
  })

  it('clears an earlier conflict after a successful write even across separate log blocks', () => {
    pushStep('run-1', {
      id: 'failed',
      title: '写提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'error',
      error: { reason: 'promptConflict', detail: '人物来源颠倒' },
    })
    store.appendOperatorEntry({
      kind: 'message',
      id: 'fix',
      text: '已校正人物来源。',
    })
    pushStep('run-1', {
      id: 'fixed',
      title: '修正提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'done',
      payload: { value: '图2人物，图1服装' },
      inverse: { value: '' },
    })
    renderPanel()
    expect(screen.queryByTestId('operator-tool-group-blocker')).toBeNull()
    expect(screen.getAllByTestId('operator-tool-group')).toHaveLength(2)
  })

  it('shows one unresolved conflict per run while keeping all attempts available', () => {
    pushStep('run-1', {
      id: 'failed-1',
      title: '写提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'error',
      error: { reason: 'promptConflict', detail: '人物来源颠倒' },
    })
    store.appendOperatorEntry({
      kind: 'message',
      id: 'fix',
      text: '检查人物来源。',
    })
    pushStep('run-1', {
      id: 'failed-2',
      title: '修正提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'error',
      error: { reason: 'promptConflict', detail: '仍缺少保持身材的要求' },
    })
    renderPanel()
    expect(screen.getAllByTestId('operator-tool-group-blocker')).toHaveLength(1)
    expect(screen.getByTestId('operator-tool-group-blocker')).toHaveTextContent(
      '仍缺少保持身材的要求',
    )
    expect(screen.getAllByTestId('operator-log-item')).toHaveLength(2)
  })

  it('⭐ 一轮被正文劈成两个工具块时，checkpoint 只出**一张**', () => {
    pushStep('run-1', {
      id: 'step-1',
      title: '写提示词',
      tool: 'set_prompt',
      verb: 'apply',
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
      verb: 'apply',
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

/**
 * 覆盖手写三选 —— v2 §3.1 起它**降级成问题卡**（旧的就地确认条整块删掉）。
 * 三个选项 id 就是 `confirmations` 要带回服务端的那三个值。
 */
it.each(['append', 'overwrite', 'keep'] as const)(
  '提示词 %s 走问题卡，答复带 choice 回执',
  (choice) => {
    const proposed = '完整提示词'.repeat(100)
    store.setOperatorQuestion({
      id: 'ask-overwrite',
      questions: [
        {
          id: 'overwrite-prompt',
          header: '提示词',
          question: '提示词你已经自己写过了，这一段怎么办？',
          multiSelect: false,
          allowOther: false,
          options: [
            { id: 'append', label: '追加在后', description: '你写的留着' },
            { id: 'overwrite', label: '覆盖', description: '换成它写的' },
            { id: 'keep', label: '保留', description: '什么都不改' },
          ],
        },
      ],
      answers: [],
      overwrite: { field: 'prompt', have: '手写提示词', proposed },
    })
    renderPanel()
    const card = screen.getByTestId('operator-question-block')
    expect(within(card).getByText(proposed)).toBeInTheDocument()
    fireEvent.click(
      within(card)
        .getAllByTestId('operator-question-option')
        .find((node) => node.dataset.optionId === choice)!,
    )
    expect(answerQuestion).toHaveBeenCalledTimes(1)
    expect(answerQuestion.mock.calls[0]?.[1]).toMatchObject({ choice })
  },
)

/**
 * 规格行（D7c ④ · 画板 `DesignD7cFlow`「输入区拆解」）。
 *
 * 钉三件事：
 *  ① 那一句在**输入框上方**，⛔ 不在头部（头部只回答「这是哪个会话」）；
 *  ② 宿主给了 `openSpec` 时它是一颗 button，点它开的是**参数栏那一颗**规格 chip；
 *  ③ 宿主没给时渲染成非交互的一句读数 —— ⛔ 不画 chevron、⛔ 不做「点了没反应」。
 */
describe('StudioOperatorPanel · D7c 规格行', () => {
  afterEach(() => {
    HOST_SPEC.openSpec = null
  })

  it('⭐ 那一句长在输入框上方，且点开的是宿主那只手', () => {
    const openSpec = vi.fn()
    HOST_SPEC.openSpec = openSpec
    renderPanel()

    const line = screen.getByTestId('operator-spec-line')
    expect(line.textContent).toContain('Seedream 5.0 Pro · 1:1 · 4 张')
    expect(line.tagName).toBe('BUTTON')
    // ⚠ DOCUMENT_POSITION_FOLLOWING = 输入区排在这一行**后面**。
    expect(
      line.compareDocumentPosition(screen.getByTestId('operator-input-area')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(line)
    expect(openSpec).toHaveBeenCalledTimes(1)
  })

  it('⭐ 宿主没有那只手时它不是按钮（⛔ 不做「点了没反应」）', () => {
    renderPanel()
    const line = screen.getByTestId('operator-spec-line')
    expect(line.tagName).not.toBe('BUTTON')
    expect(line.textContent).toContain('Seedream 5.0 Pro · 1:1 · 4 张')
  })
})

/**
 * v2 §4.4 输入区**两行**（画板 Main「输入区」/ BCards 三态）。
 *
 * ⭐ 钉的是**结构与接线**，不是皮肤（皮肤归 commit #21）：
 *  ① 上行是文本框、下行是工具条，⛔ 不是 v1 的「上行工具条 / 下行文本框」；
 *  ② 下行从左到右 `+` · 上传 · 文本模型 chip ……… 发送；
 *  ③ 上传按钮真的开文件选择器，并把文件交回上传那一条通道（owner 打回过
 *     「点了没反应」那个形态，判据同 P3-A）；
 *  ④ 「先问我」开关**整颗消失**（v2 决策 6）。
 */
describe('StudioOperatorPanel · v2 §4.4 输入区两行', () => {
  it('上行文本框、下行工具条 —— 顺序是文本框在前', () => {
    renderPanel()
    const area = screen.getByTestId('operator-input-area')
    const editor = screen.getByRole('textbox', {
      name: '描述画面，或把参考图挂进来…',
    })
    const toolbar = screen.getByTestId('operator-toolbar')

    expect(area).toContainElement(toolbar)
    // ⚠ DOCUMENT_POSITION_FOLLOWING = 工具条排在文本框**后面**。
    expect(
      editor.compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('下行四颗：+ · 上传 · 文本模型 chip ……… 发送', () => {
    renderPanel()
    const toolbar = within(screen.getByTestId('operator-toolbar'))
    expect(toolbar.getByTestId('operator-plus-toggle')).toBeTruthy()
    expect(toolbar.getByTestId('operator-attach-toggle')).toBeTruthy()
    expect(toolbar.getByTestId('operator-model-chip')).toBeTruthy()
    expect(toolbar.getByTestId('operator-send')).toBeTruthy()
  })

  it('上传按钮 = 开文件选择器，选完交回上传通道（⛔ 不是装饰）', () => {
    renderPanel()
    const input = screen.getByTestId(
      'operator-attach-file-input',
    ) as HTMLInputElement
    const openPicker = vi.spyOn(input, 'click')

    fireEvent.click(screen.getByTestId('operator-attach-toggle'))
    expect(openPicker).toHaveBeenCalledTimes(1)

    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(UPLOAD.uploadFiles).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('')
  })

  it('「+」展开三项菜单；⛔ 「先问我」开关零命中', () => {
    renderPanel()
    expect(screen.queryByTestId('operator-ask-first')).toBeNull()
    expect(screen.queryByTestId('operator-plus-menu')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-plus-toggle'))
    expect(screen.getByTestId('operator-plus-item-mention')).toBeTruthy()
    expect(screen.getByTestId('operator-plus-item-contextCard')).toBeTruthy()
    expect(screen.getByTestId('operator-plus-item-source')).toBeTruthy()
  })

  it('「提及素材」把 @ 插进输入框（唤出现有那颗选择器）', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('operator-plus-toggle'))
    fireEvent.click(screen.getByTestId('operator-plus-item-mention'))

    const editor = screen.getByRole('textbox', {
      name: '描述画面，或把参考图挂进来…',
    })
    expect(editor.textContent).toContain('@')
    expect(screen.queryByTestId('operator-plus-menu')).toBeNull()
  })
})

/**
 * 素材库按钮（切片 #7c，owner 2026-09-11「@ 那边取消，最好新做一个按钮」）。
 *
 * ⭐ 这份用例存在的理由与本文件其余部分同源：弹层自己绿着、chip 管线自己绿着，
 * 而「下行到底有没有这颗按钮、点了到底开不开弹层、挑完到底落不落 chip」只有把
 * 面板真的画出来才看得见。
 * ⚠ 挂进工作台的那一跳（chip → `apply.addReference`）钉在 `StudioOperatorDock`
 * 的用例里 —— 面板这一侧的责任到 `addChip` 为止（管线只有一条）。
 */
describe('素材库按钮（切片 #7c）', () => {
  it('下行有素材库按钮，点一下开弹层，首屏页大小是 10', () => {
    renderPanel()
    const toolbar = screen.getByTestId('operator-toolbar')
    const button = within(toolbar).getByTestId('operator-library-toggle')

    expect(screen.queryByTestId('asset-selector-dialog')).toBeNull()
    fireEvent.click(button)

    const dialog = screen.getByTestId('asset-selector-dialog')
    expect(dialog).toHaveAttribute('data-page-size', '10')
    expect(dialog).toHaveAttribute('data-media-type', 'image')
    expect(dialog).toHaveAttribute('data-multi', 'true')
  })

  it('挑两张：两张都落 chip 管线，正文里各留一个 @ 胶囊', () => {
    renderPanel()
    const editor = screen.getByRole('textbox', {
      name: '描述画面，或把参考图挂进来…',
    })
    fireEvent.click(screen.getByTestId('operator-library-toggle'))
    fireEvent.click(screen.getByTestId('asset-selector-confirm-many'))

    expect(store.getOperatorState().mentions.map((item) => item.id)).toEqual([
      'lib-1',
      'lib-2',
    ])
    // 宿主已经有 2 张可用参考图（第三张 disabled 也占位），新的两张顺次落在队尾。
    expect(editor.textContent).toContain('@Image4')
    expect(editor.textContent).toContain('@Image5')
  })

  it('已经在工作台上的那张跳过 —— ⛔ 不做「点了没反应」的重复挂载', () => {
    libraryPicks = [
      {
        id: 'dup',
        url: HOST_RESULTS[0].url,
        prompt: '已经挂着的那张',
        outputType: 'IMAGE',
      },
    ]
    renderPanel()
    fireEvent.click(screen.getByTestId('operator-library-toggle'))
    fireEvent.click(screen.getByTestId('asset-selector-confirm-many'))

    expect(store.getOperatorState().mentions).toEqual([])
  })
})

/**
 * `@` 选择器回到**只列当前工作台**（切片 #7c 取消了素材库那一段）。
 */
describe('@ 选择器只剩工作台一段（切片 #7c）', () => {
  /** 在 contenteditable 里打一个 `@`（jsdom 不会替我们动 selection）。 */
  function typeAt(editor: HTMLElement) {
    editor.textContent = '@'
    const range = document.createRange()
    range.setStart(editor.firstChild!, 1)
    range.collapse(true)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent.input(editor)
  }

  it('打 @ 只出工作台候选，没有素材库那一段，也不打搜索请求', () => {
    renderPanel()
    typeAt(screen.getByRole('textbox', { name: '描述画面，或把参考图挂进来…' }))

    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'image',
      'image',
    ])
    expect(document.querySelector('[data-mention-section]')).toBeNull()
    expect(fetchGalleryImages).not.toHaveBeenCalled()
  })
})
