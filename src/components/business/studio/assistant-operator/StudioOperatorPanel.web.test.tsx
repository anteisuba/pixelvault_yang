// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'

import { ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
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

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    return Object.assign(t, { has: () => true })
  },
  useFormatter: () => ({
    dateTime: () => '09-06 12:00',
    list: (items: string[]) => items.join('、'),
  }),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('motion/react', () => ({
  motion: { div: 'div', span: 'span', p: 'p', button: 'button' },
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

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: (props: {
    modelLabel: string
    adapterType: string
    onVerified?: (modelId: string, keyId: string) => void
  }) => (
    <div data-testid="quick-setup" data-adapter={props.adapterType}>
      {props.modelLabel}
      <button
        type="button"
        data-testid="quick-setup-verified"
        onClick={() => props.onVerified?.('model', 'key-1')}
      />
    </div>
  ),
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

/** `@` 菜单的素材库检索 / 参考位真名（§10b）—— 用例里不打真请求。 */
const searchAssistantMentionLibraryAPI = vi.hoisted(() => vi.fn())
const lookupAssistantMentionAssetsAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/assistant-mentions', () => ({
  searchAssistantMentionLibraryAPI,
  lookupAssistantMentionAssetsAPI,
}))

/** 角色库：菜单打开时才拉（`useCharacterLibraryCards`）。 */
const refreshCharacters = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/hooks/cards/use-character-library', () => ({
  useCharacterLibraryCards: () => ({ cards: [], refresh: refreshCharacters }),
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

const HOST_REFERENCE_NAMES = new Map<string, string>()
let hostReferenceOrder = [0, 1]

const HOST_RESULTS = [
  { id: 'gen-1', url: 'https://cdn.test/a.png', label: '第一张' },
  { id: 'gen-2', url: 'https://cdn.test/b.png', label: '第二张' },
]

/**
 * 这个宿主有没有生成旋钮（`generationControls`）—— 规格行能不能就地调看它（D12 B6）；
 * 有没有扳机（`trigger`）—— 自动生成开关画不画看它（D12 S-C）：工作台那颗生成键、
 * 画布卡自己那颗（`canvas_generate`，node-canvas-v2 §13.2.1），或者都没有。
 *
 * ⚠ 可变盒子：工作台两样都有、画布只有扳机、LoRA 装配台两样都没有 —— 几档都要
 * 能验，而 mock 工厂只跑一次。
 */
const HOST_SPEC = vi.hoisted(() => ({
  controls: null as null | {
    model: { id: string; label: string } | null
    models: { id: string; label: string }[]
    aspectRatio: string
    resolution: string | null
    count: number
    choicesByModel: Record<
      string,
      { aspectRatios: string[]; resolutions: string[]; counts: number[] }
    >
  },
  trigger: null as null | 'workbench' | 'canvas',
  /** 宿主声明附图挂参考位（画布那一档）。 */
  mountsReferences: false,
  /** 一个参考位都没挂（LoRA 台的常态）。 */
  noReferences: false,
}))

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: 'image' as const,
    workspace: 'image-natural' as const,
    /** 四张脸那一格（D7b ③）—— 面板读 `face` 而不是按 domain 取药丸表。 */
    face: {
      domainIcon: () => null,
      contextLine: () => 'Seedream 5.0 Pro · 1:1 · 4 张',
      emptyLine: '说你想要的画面，我来写提示词、挑模型、配参考。',
      starterPills: ['把这句写成好提示词', '换个模型看差别'],
      inputPlaceholder: '描述画面，或把参考图挂进来…',
    },
    ...(HOST_SPEC.controls ? { generationControls: HOST_SPEC.controls } : {}),
    ...(HOST_SPEC.mountsReferences ? { attachmentsMountReferences: true } : {}),
    buildSnapshot: () => ({
      prompt: '',
      availableModels: [],
      references: { items: HOST_RESULTS.map(({ url }) => ({ url })), limit: 4 },
    }),
    results: HOST_RESULTS,
    referenceLimit: 4,
    referenceImages: HOST_SPEC.noReferences
      ? []
      : [
          ...hostReferenceOrder.map((index) => ({
            url: HOST_RESULTS[index].url,
            name: HOST_REFERENCE_NAMES.get(HOST_RESULTS[index].url),
          })),
          {
            url: 'https://cdn.test/disabled.png',
            disabledReason: 'over_limit',
          },
        ],
    open: true,
    setOpen: vi.fn(),
    apply: {
      getState: () => ({ prompt: '原始提示词' }),
      dispatch: applyDispatch,
      ...(HOST_SPEC.trigger === 'workbench'
        ? { triggerGeneration: vi.fn() }
        : {}),
      ...(HOST_SPEC.trigger === 'canvas'
        ? { canvas: { generate: vi.fn() } }
        : {}),
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
const setGenerationKnob = vi.fn()

/**
 * ⚠ store 是**模块级单例**，用例之间必须换新的一份，而面板也要在同一次 reset
 * 之后 import —— 顶层 import 拿到的是同一份（照抄 store 用例的头注）。
 */
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  HOST_SPEC.controls = null
  HOST_SPEC.trigger = null
  HOST_SPEC.noReferences = false
  HOST_REFERENCE_NAMES.clear()
  hostReferenceOrder = [0, 1]
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
  // 「最近使用」存在本机（按工作台分）—— 用例之间不许串。
  window.localStorage.clear()
  searchAssistantMentionLibraryAPI.mockResolvedValue({
    success: true,
    data: { items: [], folders: [] },
  })
  lookupAssistantMentionAssetsAPI.mockResolvedValue({ success: true, data: [] })
  store = await import('@/hooks/use-studio-operator-store')
  Panel = (await import('./StudioOperatorPanel')).StudioOperatorPanel
  // ⚠ resetModules 之后第一次 import 面板是冷加载整棵依赖树，全量闸门高负载时
  // 会超过默认 10 秒 hookTimeout（2026-10-15 推送被它拦过两次），这里放宽到 60 秒。
}, 60_000)

/** 在 contenteditable 里写一段字、光标停在末尾（jsdom 不会替我们动 selection）。 */
function typeInto(editor: HTMLElement, text: string) {
  editor.focus()
  editor.textContent = text
  const range = document.createRange()
  range.selectNodeContents(editor)
  if (editor.firstChild) range.setStart(editor.firstChild, text.length)
  range.collapse(true)
  document.getSelection()?.removeAllRanges()
  document.getSelection()?.addRange(range)
  fireEvent.input(editor)
}

const editorName = '描述画面，或把参考图挂进来…'

const HISTORY = {
  sessions: [],
  currentSessionId: null,
  isHydrating: false,
  error: null,
  selectSession: vi.fn(),
  retrySave: vi.fn().mockResolvedValue(true),
  loadingSessionId: null,
  renamingSessionId: null,
  renameSession: vi.fn().mockResolvedValue(true),
  refreshSessions: vi.fn(),
  deletingSessionId: null,
  deleteSession: vi.fn().mockResolvedValue(true),
} satisfies UseStudioOperatorHistoryResult

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
const onSelectReasoningEffort = vi.fn().mockResolvedValue(true)

const send = vi.fn()
const regenerate = vi.fn()
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
          setGenerationKnob,
          newThread: vi.fn(),
          regenerate,
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
      onSelectReasoningEffort={onSelectReasoningEffort}
      onOpenProjectRules={onOpenProjectRules}
      onCollapse={vi.fn()}
      headerAvatar="slot"
    />
  )
}

/** 点开输入区左下那颗 ＋（P4 第 4 项）。 */
function openAddMenu() {
  fireEvent.click(screen.getByTestId('operator-add-toggle'))
}

function renderPanel() {
  render(<PanelHarness />)
}

describe('StudioOperatorPanel 接线（切片 3a）', () => {
  it('⭐ 聊天会话：每条对白能改能删，她最后那段能重新生成、左右切；工作会话没有这些', () => {
    store.loadOperatorThread({
      sessionId: 'conv-1',
      sessionSurface: 'IMAGE_STUDIO',
      chatCharacter: {
        id: '11111111-1111-4111-8111-111111111111',
        name: '莉莉',
      },
      history: [
        { kind: 'message', id: 'message-1', text: '你来了。' },
        { kind: 'user', id: 'user-1', text: '今天去哪？', attachments: [] },
        {
          kind: 'message',
          id: 'message-2',
          text: '去海边吧。',
          versions: ['去山上吧。', '去海边吧。'],
          versionIndex: 1,
        },
      ],
    })
    renderPanel()
    // 三条对白各一排动作；只有最后那段有「重新生成」。
    expect(screen.getAllByTestId('operator-chat-line-actions')).toHaveLength(3)
    expect(screen.getAllByTestId('operator-chat-regenerate')).toHaveLength(1)
    expect(screen.getByTestId('operator-chat-line-version')).toHaveTextContent(
      'versionOf',
    )
    fireEvent.click(screen.getByTestId('operator-chat-regenerate'))
    expect(regenerate).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'previousVersion' }))
    expect(screen.getByText('去山上吧。')).toBeTruthy()
    expect(store.getOperatorState().historyRevision).toBe(1)

    // 改你说的那句：保存后下一轮的对白就是改过的。
    fireEvent.click(screen.getAllByTestId('operator-chat-line-edit')[1]!)
    const editor = screen.getByRole('textbox', { name: 'editLabel' })
    fireEvent.change(editor, { target: { value: '今天去哪玩？' } })
    fireEvent.click(screen.getByTestId('operator-chat-line-save'))
    expect(store.getOperatorState().history[1]).toMatchObject({
      text: '今天去哪玩？',
    })

    // 删要再点一下确认。
    fireEvent.click(screen.getAllByTestId('operator-chat-line-delete')[0]!)
    expect(store.getOperatorState().history).toHaveLength(3)
    fireEvent.click(screen.getByTestId('operator-chat-line-delete-confirm'))
    expect(store.getOperatorState().history).toHaveLength(2)
  })

  it('工作会话的对白不带改 / 删 / 重新生成', () => {
    store.loadOperatorThread({
      sessionId: 'conv-2',
      sessionSurface: 'IMAGE_STUDIO',
      history: [
        { kind: 'user', id: 'user-1', text: '出一张图', attachments: [] },
        { kind: 'message', id: 'message-1', text: '好的' },
      ],
    })
    renderPanel()
    expect(screen.queryByTestId('operator-chat-line-actions')).toBeNull()
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
      // ⭐ 正文没写到名字的图也排进气泡上方那一排（2026-10-09 owner：发出去缩略图就没了）。
      expect(
        screen.getByRole('img', { name: 'reference image 1' }),
      ).toHaveAttribute('src', 'https://cdn.test/thumb.png')
      expect(
        within(screen.getByTestId('operator-user-text')).queryByRole('img', {
          name: 'reference image 1',
        }),
      ).toBeNull()
      expect(
        screen.getAllByRole('img', { name: 'reference image 2' })[0],
      ).toHaveAttribute('src', 'https://cdn.test/ref2.png')
      expect(screen.queryByRole('img', { name: 'voice sample' })).toBeNull()
      expect(screen.getByText('voice sample')).toBeTruthy()
      /* P4 第 3 项（owner 2026-10-16）：图一律排在气泡上方，同一张只一格；字里只留名字。 */
      const body = within(screen.getByTestId('operator-user-text'))
      expect(body.queryAllByRole('img')).toHaveLength(0)
      expect(screen.getByTestId('operator-user-text')).toHaveTextContent(
        'reference image 2',
      )
      const thumbs = within(screen.getByTestId('operator-user-thumbs'))
      expect(
        thumbs.getAllByRole('img', { name: 'reference image 2' }),
      ).toHaveLength(1)
      expect(
        thumbs.queryByRole('img', { name: 'reference image 4' }),
      ).toBeNull()
      expect(screen.getByTestId('operator-user-text')).toHaveTextContent(
        'reference image 4',
      )
      /* 用户消息靠右 —— 实时与历史回放同一套对齐；D12 A：气泡不带头像名字。 */
      const userRow = screen
        .getByTestId('operator-user-text')
        .closest('[data-testid="operator-timeline-row"]')
      expect(userRow).not.toBeNull()
      expect((userRow as HTMLElement).dataset.align).toBe('end')
      expect(
        within(userRow as HTMLElement).queryByTestId(
          'operator-timeline-avatar',
        ),
      ).toBeNull()
    },
  )

  it('@ 菜单贴在输入框上方（⛔ 不 portal），combobox ARIA 齐全；选中后按 id 发出', () => {
    renderPanel()
    const editor = screen.getByRole('combobox', { name: editorName })
    expect(editor).toHaveAttribute('aria-expanded', 'false')
    typeInto(editor, '采用@')
    /**
     * ⭐ 菜单住在输入区里（§10b「候选贴在输入框上方，键盘弹出不关闭」）：手机上它
     * 跟着输入框一起被键盘顶上去。⛔ 别再 portal 到 body。
     */
    const listbox = screen.getByRole('listbox')
    expect(screen.getByTestId('operator-input-area')).toContainElement(listbox)
    expect(editor).toHaveAttribute('aria-expanded', 'true')
    expect(editor).toHaveAttribute('aria-controls', listbox.id)
    // 参考位两张 + 本次对话的生成两张，各成一组。
    expect(within(listbox).getAllByRole('group')).toHaveLength(2)
    expect(within(listbox).getAllByRole('option')).toHaveLength(4)
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    const active = within(listbox).getAllByRole('option')[1]!
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(editor).toHaveAttribute('aria-activedescendant', active.id)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(editor.querySelector('img')).toHaveAttribute(
      'src',
      HOST_RESULTS[1].url,
    )
    fireEvent.keyDown(editor, { key: 'Enter' })
    // ⭐ 未命名参考图按界面上的名字发（真 i18n 下是「图2」；这里的 t 桩回的是键名）；
    //   引用随第三个参数走（按 id，§10b），⛔ 不再塞进附件。
    expect(send).toHaveBeenCalledWith('采用「image」', [], {
      mentions: [
        expect.objectContaining({
          kind: 'image',
          scope: 'reference',
          url: HOST_RESULTS[1].url,
          label: 'image',
        }),
      ],
    })
    expect(editor.textContent).toBe('')
  })

  it.each(['unchanged', 'reordered', 'removed'])(
    'keeps the selected canvas image binding when references are %s',
    (change) => {
      HOST_REFERENCE_NAMES.set(HOST_RESULTS[1].url, '生成图3')
      const view = render(<PanelHarness />)
      const editor = screen.getByRole('combobox', { name: editorName })
      typeInto(editor, '采用@')
      fireEvent.click(screen.getByRole('option', { name: /生成图3/ }))
      expect(editor.textContent).toContain('生成图3')
      expect(editor.querySelector('img')).toHaveAttribute(
        'src',
        HOST_RESULTS[1].url,
      )
      if (change !== 'unchanged') {
        hostReferenceOrder = change === 'removed' ? [0] : [1, 0]
        view.rerender(<PanelHarness />)
      }
      if (change === 'removed') {
        // ⭐ 指的东西没了：胶囊变灰「已删除」，整条拦下（§10b），⛔ 不悄悄少带一张。
        expect(editor.querySelector('[data-missing="true"]')).not.toBeNull()
        fireEvent.keyDown(editor, { key: 'Enter' })
        expect(send).not.toHaveBeenCalled()
        return
      }
      fireEvent.keyDown(editor, { key: 'Enter' })
      // ⭐ 换了顺序也还是那一张：按 id 指，⛔ 不按「图N」位置。
      expect(send).toHaveBeenCalledWith('采用「生成图3」', [], {
        mentions: [
          expect.objectContaining({
            url: HOST_RESULTS[1].url,
            label: '生成图3',
            kind: 'image',
          }),
        ],
      })
    },
  )

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
      const editor = screen.getByRole('combobox', { name: editorName })
      typeInto(editor, '参考@')
      // 参考位两张 · 这条消息的附件一条 · 本次对话的生成两张。
      expect(screen.getAllByRole('option')).toHaveLength(5)
      fireEvent.click(
        screen.getByRole('option', { name: new RegExp(attachment.label) }),
      )
      expect(send).not.toHaveBeenCalled()
      expect(editor.textContent).toContain(attachment.label)
      expect(editor.querySelector('img')).toBeNull()
      fireEvent.keyDown(editor, { key: 'Enter' })
      expect(send).toHaveBeenCalledWith(
        `参考「${attachment.label}」`,
        [attachment],
        {
          mentions: [
            expect.objectContaining({
              kind,
              id: attachment.id,
              scope: 'attachment',
            }),
          ],
        },
      )
    },
  )

  it('IME 选字回车不发送，过一会儿再回车才发送', () => {
    const now = vi.spyOn(performance, 'now')
    renderPanel()
    const editor = screen.getByRole('combobox', {
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
    expect(send).toHaveBeenCalledWith('改成夜景', [], { mentions: [] })
    now.mockRestore()
  })

  it('⭐ 缺 key 的错误条带「配置 Key」，点开就地配 Gemini（免费档）', () => {
    renderPanel()
    act(() =>
      store.setOperatorStatus(
        'error',
        'missing key text',
        null,
        'MISSING_API_KEY',
      ),
    )
    fireEvent.click(screen.getByTestId('operator-error-action-addKey'))
    expect(screen.getByTestId('quick-setup')).toHaveTextContent('Gemini')
  })

  /** owner 2026-10-15：选定的模型缺 key 不换别家 —— 配它那一家的 key，配好接着跑刚才那句。 */
  it('⭐ 选定的模型缺 key：错误条「配置 Claude 的 key」就地配那一家，验证过就接着跑', () => {
    renderPanel()
    act(() =>
      store.setOperatorStatus(
        'error',
        'model key missing text',
        null,
        ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
        {
          adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
          modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
        },
      ),
    )
    const addKey = screen.getByTestId('operator-error-action-addKey')
    expect(addKey).toHaveTextContent('error.addProviderKey')
    // ⛔ 这一种不给「重试」：没有 key，重试只会再撞一次。
    expect(screen.queryByTestId('operator-error-action-retry')).toBeNull()
    fireEvent.click(addKey)
    const setup = screen.getByTestId('quick-setup')
    expect(setup).toHaveTextContent('Claude Sonnet 5.5')
    expect(setup).toHaveAttribute('data-adapter', AI_ADAPTER_TYPES.ANTHROPIC)
    expect(send).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('quick-setup-verified'))
    expect(send).toHaveBeenCalledWith('error.retryPrompt')
  })

  it('⭐ 其他错误给「重试」：发一句接着做完，⛔ 不原样重放上一条', () => {
    renderPanel()
    act(() => store.setOperatorStatus('error', 'boom', null, 'INTERNAL'))
    const retry = screen.getByTestId('operator-error-action-retry')
    expect(retry).toHaveTextContent('error.retry')
    fireEvent.click(retry)
    expect(send).toHaveBeenCalledWith('error.retryPrompt')
  })

  it('⭐ 错误条带「换个模型」：点下去打开输入框底下那颗模型 chip 的选单（§9.1）', () => {
    renderPanel()
    act(() => store.setOperatorStatus('error', 'boom', null, 'INTERNAL'))
    expect(screen.getByTestId('operator-model-chip')).not.toHaveAttribute(
      'data-open',
    )
    fireEvent.click(screen.getByTestId('operator-error-action-switchModel'))
    expect(screen.getByTestId('operator-model-chip')).toHaveAttribute(
      'data-open',
      'true',
    )
  })

  it('⭐ 默认宿主：输入框里的图跟这条消息一起发出去，发完清空', () => {
    initialAttachments = [
      {
        id: 'result',
        kind: 'image',
        url: 'https://cdn.test/result.png',
        label: '图_012',
      },
      {
        id: 'audio',
        kind: 'audio',
        url: 'https://cdn.test/audio.mp3',
        label: 'audio',
      },
    ]
    renderPanel()
    const editor = screen.getByRole('combobox', {
      name: '描述画面，或把参考图挂进来…',
    })
    editor.textContent = '眼睛有点糊'
    fireEvent.input(editor)
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(send).toHaveBeenCalledWith('眼睛有点糊', initialAttachments, {
      mentions: [],
    })
    expect(changeAttachments).toHaveBeenCalledWith([])
  })

  // 2026-10-09 owner 真机：LoRA 台带着刚出的图写「@Image1 比如这张」被拦成「引用的图片不可用」。
  it('⭐ 一个参考位都没挂：@Image1 指的是这条消息自己带的第一张图', () => {
    HOST_SPEC.noReferences = true
    initialAttachments = [
      {
        id: 'result',
        kind: 'image',
        url: 'https://cdn.test/result.png',
        label: '图_894',
      },
    ]
    renderPanel()
    const editor = screen.getByRole('combobox', {
      name: '描述画面，或把参考图挂进来…',
    })
    editor.textContent = '画风不对 @Image1 比如这张'
    fireEvent.input(editor)
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(send).toHaveBeenCalledWith(
      '画风不对 「图_894」 比如这张',
      initialAttachments,
      {
        mentions: [
          expect.objectContaining({ id: 'result', scope: 'attachment' }),
        ],
      },
    )
  })

  it('一个参考位都没挂、也没带图：@Image1 照旧拦下', () => {
    HOST_SPEC.noReferences = true
    renderPanel()
    const editor = screen.getByRole('combobox', {
      name: '描述画面，或把参考图挂进来…',
    })
    editor.textContent = '看看 @Image1'
    fireEvent.input(editor)
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(send).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    '挂参考位的宿主：只发送正文 @ 的图片，保留共享参考图（有引用：%s）',
    (hasMention) => {
      HOST_SPEC.mountsReferences = true
      onTestFinished(() => {
        HOST_SPEC.mountsReferences = false
      })
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
      const editor = screen.getByRole('combobox', {
        name: '描述画面，或把参考图挂进来…',
      })
      editor.textContent = hasMention ? '一起参考@Image2' : '一起参考'
      fireEvent.input(editor)
      fireEvent.click(screen.getByRole('button', { name: 'send' }))
      expect(send).toHaveBeenCalledWith(
        hasMention ? '一起参考「image」' : '一起参考',
        [expect.objectContaining({ kind: 'audio' })],
        {
          mentions: hasMention
            ? [
                expect.objectContaining({
                  url: HOST_RESULTS[1].url,
                  label: 'image',
                  scope: 'reference',
                }),
              ]
            : [],
        },
      )
      expect(changeAttachments).toHaveBeenCalledWith(
        initialAttachments.slice(0, 3),
      )
    },
  )

  it('⭐ 历史里顺利跑完的一轮只剩回复，过程不画（owner 2026-09-30）', () => {
    store.loadOperatorThread({
      sessionId: null,
      sessionSurface: null,
      history: [
        {
          kind: 'step',
          id: 'search',
          tool: 'search_web',
          title: '检索资料',
          status: 'done',
          undone: false,
        },
        { kind: 'message', id: 'answer', text: '已核实的最终结论' },
      ],
    })
    renderPanel()
    expect(screen.queryByTestId('operator-tool-group')).toBeNull()
    expect(screen.queryByText('检索资料')).toBeNull()
    expect(screen.getByText('已核实的最终结论')).toBeVisible()
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
    // 同一轮以失败收尾：这一轮的两组过程都留着查，默认折叠。
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

  it('⭐ 答题回执留在数据里、时间线不画（owner 2026-09-24：小字没有用处）', () => {
    store.appendOperatorEntry({
      kind: 'system',
      id: 'sys-question-1',
      code: 'questionAnswered',
      subject: '校服款式 · 西式学院制服',
    })
    store.appendOperatorEntry({
      kind: 'plan',
      id: 'plan-untracked',
      steps: ['看参考图', '改提示词'],
    })
    renderPanel()

    expect(screen.queryByTestId('operator-system-line')).toBeNull()
    expect(screen.queryByTestId('operator-plan')).toBeNull()
    // 数据照存：答复还在线程条目里，下一轮照样进对话。
    expect(
      store
        .getOperatorState()
        .entries.some(
          (entry) =>
            entry.kind === 'system' && entry.code === 'questionAnswered',
        ),
    ).toBe(true)
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
    HOST_SPEC.trigger = 'workbench'
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
    const primary = screen.getByTestId('operator-confirm-primary')
    expect(primary).toBeEnabled()
    fireEvent.click(primary)
    expect(confirmGeneration).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(cancelGeneration).toHaveBeenCalledTimes(1)
  })

  it.each(['workbench', 'canvas'] as const)(
    '%s 生成入口缺席时禁用确认，仍可取消',
    (target) => {
      store.setOperatorConfirm({
        id: 'confirm-unavailable',
        kind: 'generate',
        request: {
          model: { id: 'seedream-4', label: 'Seedream 4' },
          count: 2,
          specs: {
            aspectRatio: '3:4',
            resolution: '2K',
            durationSeconds: null,
          },
          ...(target === 'canvas'
            ? { canvasNode: { id: 'shot-1', name: '主角正面' } }
            : {}),
        },
        status: 'idle',
      })
      renderPanel()

      const primary = screen.getByTestId('operator-confirm-primary')
      expect(primary).toBeDisabled()
      fireEvent.click(primary)
      expect(confirmGeneration).not.toHaveBeenCalled()
      expect(store.getOperatorState().confirm?.status).toBe('idle')
      const secondary = screen.getByTestId('operator-confirm-secondary')
      expect(secondary).toBeEnabled()
      fireEvent.click(secondary)
      expect(cancelGeneration).toHaveBeenCalledTimes(1)
    },
  )

  it('③ 问题卡的缩略图那一支：画出缩略图，点一张走 `answerQuestion`（素材由 hook 从卡上取）', () => {
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
    expect(grid[1]?.querySelector('img')?.getAttribute('src')).toContain(
      'b.png',
    )
    expect(answerQuestion).toHaveBeenCalledTimes(1)
    // ⭐ 面板只交 id（2026-10-14）：缩略图 → @chip 由 hook 从选项上取。
    expect(answerQuestion.mock.calls[0]?.[0]).toEqual({
      questionId: 'q2',
      optionIds: ['gen-2'],
    })
  })

  it('⭐ 问题块开着时打字作答：已勾的选项一起带上（「选 A + 补一句」并存）', () => {
    store.setOperatorQuestion({
      id: 'ask-multi',
      questions: [
        {
          id: 'who',
          header: '出场',
          question: '这一镜谁出场？',
          multiSelect: true,
          allowOther: true,
          options: [
            { id: 'harry', label: '哈利', description: '主角' },
            { id: 'ron', label: '罗恩', description: '朋友' },
          ],
        },
      ],
      answers: [],
    })
    renderPanel()
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    expect(store.getOperatorState().question?.checked).toEqual(['ron'])
    const editor = screen.getByRole('combobox', {
      name: '描述画面，或把参考图挂进来…',
    })
    editor.textContent = '罗恩站在后面'
    fireEvent.input(editor)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
    expect(answerQuestion).toHaveBeenCalledWith(
      { questionId: 'who', optionIds: ['ron'], otherText: '罗恩站在后面' },
      { attachments: [] },
    )
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
  it('时间线容器是 role=log、aria-live=off；播报只走隐藏的 role=status（§9.1）', () => {
    renderPanel()
    const thread = screen.getByTestId('operator-thread')
    expect(thread).toHaveAttribute('role', 'log')
    expect(thread).toHaveAttribute('aria-live', 'off')
    const live = screen.getByTestId('operator-live-status')
    expect(live).toHaveAttribute('role', 'status')
    expect(live).toHaveTextContent('')
    act(() => store.setOperatorStatus('working'))
    expect(live).toHaveTextContent('start')
    act(() => store.setOperatorStatus('error', 'boom', null, 'INTERNAL'))
    expect(live).toHaveTextContent('failed')
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

/** D12 S9：在跑的计划画成一张清单，逐项打勾。 */
describe('StudioOperatorPanel · 多步计划清单', () => {
  it('⭐ 有进度的计划逐项显示状态，⛔ 不再折成「计划 · N 步」', () => {
    store.appendOperatorEntry({
      kind: 'plan',
      id: 'plan-s9',
      steps: ['水手服', '西装校服', '运动校服'],
      progress: ['done', 'failed', 'pending'],
    })
    store.setOperatorStatus('working')
    renderPanel()
    const items = screen.getAllByTestId('operator-plan-item')
    // 跑着时第一项还没到的就是「正在做」。
    expect(items.map((item) => item.getAttribute('data-state'))).toEqual([
      'done',
      'failed',
      'active',
    ])
    expect(items[0]?.textContent).toContain('✓')
    expect(screen.queryByText('planFold')).toBeNull()
  })

  it('⭐ 这一轮收尾后清单收走 —— 它是过程（owner 2026-09-30）', () => {
    store.appendOperatorEntry({
      kind: 'plan',
      id: 'plan-done',
      steps: ['写提示词', '改比例'],
      progress: ['done', 'done'],
    })
    renderPanel()
    expect(screen.queryByTestId('operator-plan')).toBeNull()
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
    // 跑完只留结果：看参考图那一步与其它步一样不画（owner 2026-09-30）。
    expect(screen.queryByTestId('operator-tool-group')).toBeNull()
  })

  /** 一条跑完的步 —— `upsertOperatorStep` 收的形状。 */
  function pushStep(runKey: string, step: Record<string, unknown>): void {
    store.upsertOperatorStep(
      step as unknown as Parameters<typeof store.upsertOperatorStep>[0],
      runKey,
    )
  }

  it('⭐ §9.1：跑着的那一步写人话动词（翻自己的库 =「查素材」），⛔ 不读模型起的标题', () => {
    store.setOperatorStatus('working')
    pushStep('run-live', {
      id: 'step-1',
      title: '模型自己起的一句很长的标题',
      tool: 'search_assets',
      verb: 'research',
      status: 'running',
      payload: { query: '夜景' },
      inverse: {},
    })
    renderPanel()
    const running = screen.getByTestId('operator-tool-group-running')
    expect(running).toHaveTextContent('running.library')
    expect(running).not.toHaveTextContent('模型自己起的')
    // 运行中自动展开。
    expect(screen.getByTestId('operator-tool-group').dataset.open).toBe('true')
  })

  it('⭐ 跳过的重复步不进过程：展开也读不到「刚才做过了」（2026-09-24）', () => {
    pushStep('run-skip', {
      id: 'step-1',
      title: '写提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'done',
      payload: { value: '夜景', mode: 'replace' },
      inverse: { value: '' },
    })
    pushStep('run-skip', {
      id: 'step-2',
      title: '再写一遍提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'error',
      error: { reason: 'repeatedStep' },
    })
    renderPanel()
    // 跳过不算失败 —— 这一轮没有失败要读，过程整条不画。
    expect(screen.queryByTestId('operator-tool-group')).toBeNull()
    const titles = screen
      .queryAllByTestId('operator-log-title')
      .map((node) => node.textContent)
    expect(titles.some((text) => text?.includes('再写一遍提示词'))).toBe(false)
    expect(screen.queryByText(/toolGroup\.skipped/)).toBeNull()
  })

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
    // 跑完调查行也收走 —— 查到的东西长在回答底下（owner 2026-09-30）。
    expect(screen.queryByTestId('operator-research-progress')).toBeNull()
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
    // 失败后来修好了 = 这一轮没有失败要读，过程整条不画（owner 2026-09-30）。
    expect(screen.queryAllByTestId('operator-tool-group')).toHaveLength(0)
  })

  it('NAI 标签核对换了写法 / 没查到时，过程行上方一句灰字（拆分与反推 X1）', () => {
    pushStep('run-1', {
      id: 'tags',
      title: '写标签',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'done',
      payload: {
        value: '1girl, cherry blossoms, sakura tree',
        mode: 'replace',
        tagCheck: {
          fixes: [{ from: 'cherry blossom', to: 'cherry blossoms' }],
          unknown: ['sakura tree'],
        },
      },
      inverse: { value: '' },
    })
    renderPanel()
    const note = screen.getByTestId('operator-prompt-note')
    expect(note).toHaveTextContent('toolGroup.tagFixed')
    expect(note).toHaveTextContent('toolGroup.tagUnknown')
  })

  it('⭐ 刷新后从历史里照样画出那句灰字', () => {
    store.loadOperatorThread({
      sessionId: null,
      sessionSurface: null,
      history: [
        {
          kind: 'step',
          id: 'tags',
          tool: 'set_prompt',
          title: '写标签',
          status: 'done',
          undone: false,
          tagCheck: {
            fixes: [{ from: 'cherry blossom', to: 'cherry blossoms' }],
            unknown: [],
          },
        },
      ],
    })
    renderPanel()
    expect(screen.getByTestId('operator-prompt-note')).toHaveTextContent(
      'toolGroup.tagFixed',
    )
  })

  it('没换过写法就没有那句灰字', () => {
    pushStep('run-1', {
      id: 'tags',
      title: '写标签',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'done',
      payload: { value: '1girl', mode: 'replace' },
      inverse: { value: '' },
    })
    renderPanel()
    expect(screen.queryByTestId('operator-prompt-note')).toBeNull()
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
    // D12 C11：说人话 —— `error.detail` 是写给模型的原文，只在展开的那一步里。
    expect(screen.getByTestId('operator-tool-group-blocker')).toHaveTextContent(
      'reject.promptConflict',
    )
    expect(
      screen.getByTestId('operator-tool-group-blocker'),
    ).not.toHaveTextContent('仍缺少保持身材的要求')
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

    // 两个工具块（正文把它们劈开了）——过程不画，⛔ checkpoint 只归最后那一个。
    expect(screen.queryAllByTestId('operator-tool-group')).toHaveLength(0)
    expect(screen.getAllByTestId('operator-checkpoint')).toHaveLength(1)
  })

  it('⭐ 撤回只有一个入口：每轮过程行上一颗「撤销」（owner 2026-09-24）', () => {
    pushStep('run-old', {
      id: 'step-1',
      title: '写提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'done',
      payload: { value: '夜景' },
      inverse: { tool: 'set_prompt', payload: { value: '' } },
    })
    store.appendOperatorEntry({ kind: 'message', id: 'msg-old', text: '好。' })
    pushStep('run-new', {
      id: 'step-1',
      title: '改规格',
      tool: 'set_specs',
      verb: 'apply',
      status: 'done',
      payload: { aspectRatio: '16:9', resolution: '2K' },
      inverse: { aspectRatio: '1:1', resolution: '1K' },
    })
    renderPanel()
    for (const toggle of screen.queryAllByTestId('operator-tool-group-toggle'))
      fireEvent.click(toggle)

    expect(screen.getAllByTestId('operator-checkpoint-undo')).toHaveLength(2)
    // ⛔ 其余四套都不在：字段还原 / 全部还原 / 逐步撤销 / 恢复到这一步。
    expect(screen.queryByTestId('operator-change-rail')).toBeNull()
    expect(screen.queryByTestId('operator-log-undo')).toBeNull()
    expect(screen.queryByText('checkpoint.restoreStep')).toBeNull()
  })

  it('成功的画布修改只显示一条改动记录，步骤收在里面', () => {
    pushStep('run-canvas', {
      id: 'canvas-step',
      title: '创建图片节点',
      tool: 'canvas_apply',
      verb: 'apply',
      status: 'done',
      payload: { op: 'add_node', kind: 'image', subtype: 'shot' },
      inverse: { op: 'delete', nodeRef: 'add_node' },
    })
    renderPanel()

    const checkpoint = screen.getByTestId('operator-checkpoint')
    expect(screen.queryByTestId('operator-tool-group')).toBeNull()
    // 步骤不再收在里面 —— 只留撤销（owner 2026-09-30）。
    expect(checkpoint.querySelector('details')).toBeNull()
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
    // ⭐ 选项 id 就是 choice：hook 认出它走 `confirmations`（见 hook 测试）。
    expect(answerQuestion.mock.calls[0]?.[0]).toEqual({
      questionId: 'overwrite-prompt',
      optionIds: [choice],
    })
  },
)

/**
 * ⭐ **会话区是唯一会裁剪 / 滚动的那一层**（owner 2026-09-20 真机第二轮）。
 *
 * 判据不是「现在高度够」而是「挤的时候谁让步」：时间线 `min-h-0 flex-1
 * overflow-y-auto` 会收缩并自己滚，它下面那三样（建议 chip · 规格行 · 输入区）
 * 一律 `shrink-0` 且排在它**后面**。⛔ 少了 `min-h-0`，时间线就不再收缩，内容会
 * 直接把 chip 行和输入框顶下去 —— 横屏手机 / 小屏 / 字号放大都会再把它挤回来。
 */
/**
 * **找到的图是答案的一部分**（搜索期切片 1，附录 I §四，2026-10-15）：网格摆在回答
 * 正文底下，⛔ 不再折进步骤组；还在搜画灰块；没等到回答的那几块就地留着。
 */
describe('StudioOperatorPanel · 找到的图（搜索期切片 1）', () => {
  const IMAGES = [
    {
      imageUrl: 'https://cdn.example.com/a.jpg',
      thumbnailUrl: 'https://tbn.example.com/a.jpg',
      pageUrl: 'https://example.com/a',
      domain: 'example.com',
      usableAsInput: true,
      sourceVerdict: 'allowed',
    },
    {
      imageUrl: 'https://cdn.other.com/b.jpg',
      domain: 'other.com',
      usableAsInput: true,
      sourceVerdict: 'unknownLicense',
    },
  ]

  function pushWebImages(
    runKey: string,
    status: 'running' | 'done',
    images: unknown[] = IMAGES,
  ): void {
    store.upsertOperatorStep(
      {
        id: 'step-web',
        title: '找官方立绘',
        tool: 'search_web_images',
        verb: 'research',
        status,
        payload: { query: '初音未来 官方立绘', limit: 8 },
        result:
          status === 'done' ? { totalFound: images.length, images } : null,
      } as unknown as Parameters<typeof store.upsertOperatorStep>[0],
      runKey,
    )
  }

  it('还在搜：过程行写「正在搜索图片」，灰块画在折叠组**外面**', () => {
    store.setOperatorStatus('working')
    pushWebImages('run-web', 'running')
    renderPanel()
    expect(screen.getByTestId('operator-tool-group-running')).toHaveTextContent(
      'running.webImages',
    )
    const grid = screen.getByTestId('operator-web-candidates')
    expect(grid.dataset.state).toBe('loading')
    expect(
      screen.getAllByTestId('operator-web-candidate-skeleton'),
    ).toHaveLength(8)
    expect(
      within(screen.getByTestId('operator-tool-group')).queryByTestId(
        'operator-web-candidates',
      ),
    ).toBeNull()
  })

  it('⭐ 回答说完：网格摆在回答正文底下，一轮收尾后照样在；⛔ 不在过程行里', () => {
    pushWebImages('run-web', 'done')
    store.appendOperatorEntry({
      kind: 'message',
      id: 'answer',
      text: '找到两张官方立绘。',
    })
    renderPanel()
    // 跑完只留结果：过程行收走了，图还在 —— 在回答那一格里。
    expect(screen.queryByTestId('operator-tool-group')).toBeNull()
    expect(screen.getAllByTestId('operator-web-candidates')).toHaveLength(1)
    const answerRow = screen
      .getByTestId('operator-message-text')
      .closest('[data-testid="operator-timeline-row"]') as HTMLElement
    const underAnswer = within(answerRow).getByTestId(
      'operator-answer-web-finds',
    )
    expect(
      within(underAnswer).getAllByTestId('operator-web-candidate'),
    ).toHaveLength(2)
    expect(screen.queryByTestId('operator-web-finds-pending')).toBeNull()
    // 选上再挂上，照旧走宿主的 hook，认的是线程里那一条的 id。
    fireEvent.click(
      within(underAnswer).getAllByTestId('operator-web-candidate-use')[0]!,
    )
    fireEvent.click(within(underAnswer).getByTestId('operator-web-use-all'))
    expect(WEB_IMPORT.toggleCandidate).toHaveBeenCalledWith(
      'run-web:step-web',
      expect.objectContaining({ imageUrl: 'https://cdn.example.com/a.jpg' }),
    )
  })

  it('回答还在写：网格先就地留在那一块，⛔ 不跟着正文一起跳', () => {
    store.setOperatorStatus('working')
    pushWebImages('run-web', 'done')
    store.appendOperatorEntry({
      kind: 'message',
      id: 'answer',
      text: '找到两张',
      streaming: true,
    })
    renderPanel()
    expect(screen.queryByTestId('operator-answer-web-finds')).toBeNull()
    expect(
      within(screen.getByTestId('operator-web-finds-pending')).getAllByTestId(
        'operator-web-candidate',
      ),
    ).toHaveLength(2)
  })

  it('⛔ 这一轮没等到回答就停了：过程行收走，找到的图照样在', () => {
    pushWebImages('run-web', 'done')
    renderPanel()
    expect(screen.queryByTestId('operator-tool-group')).toBeNull()
    expect(
      within(screen.getByTestId('operator-web-finds-pending')).getAllByTestId(
        'operator-web-candidate',
      ),
    ).toHaveLength(2)
  })

  it('一张都没找到：不画空网格', () => {
    pushWebImages('run-web', 'done', [])
    store.appendOperatorEntry({
      kind: 'message',
      id: 'answer',
      text: '没找到合适的图。',
    })
    renderPanel()
    expect(screen.queryByTestId('operator-web-candidates')).toBeNull()
    // ⛔ 也不留一块空的「还没挂上」行。
    expect(screen.queryByTestId('operator-web-finds-pending')).toBeNull()
  })

  /** 搜索期第二片：找到的视频走同一条路，摆在图的网格**下面**。 */
  const VIDEOS = [
    {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Miku PV',
      platform: 'youtube',
      domain: 'youtube.com',
      durationSeconds: 209,
    },
  ]

  function pushWebVideos(
    runKey: string,
    status: 'running' | 'done',
    videos: unknown[] = VIDEOS,
  ): void {
    store.upsertOperatorStep(
      {
        id: 'step-videos',
        title: '找 PV',
        tool: 'search_web_videos',
        verb: 'research',
        status,
        payload: { query: '初音未来 PV', limit: 8, bilibili: true },
        result:
          status === 'done' ? { totalFound: videos.length, videos } : null,
      } as unknown as Parameters<typeof store.upsertOperatorStep>[0],
      runKey,
    )
  }

  it('找视频还在搜：过程行写「正在搜索视频」，灰卡画在折叠组外面', () => {
    store.setOperatorStatus('working')
    pushWebVideos('run-web', 'running')
    renderPanel()
    expect(screen.getByTestId('operator-tool-group-running')).toHaveTextContent(
      'running.webVideos',
    )
    expect(screen.getByTestId('operator-web-videos').dataset.state).toBe(
      'loading',
    )
    expect(
      within(screen.getByTestId('operator-tool-group')).queryByTestId(
        'operator-web-videos',
      ),
    ).toBeNull()
  })

  it('⭐ 回答说完：视频那一排摆在回答底下、图的网格下面；点开在面板里播', () => {
    // 先找视频、后找图：摆的时候照样图在上、视频在下。
    pushWebVideos('run-web', 'done')
    pushWebImages('run-web', 'done')
    store.appendOperatorEntry({
      kind: 'message',
      id: 'answer',
      text: '找到两张图和一支 PV。',
    })
    renderPanel()
    const underAnswer = screen.getByTestId('operator-answer-web-finds')
    const blocks = Array.from(underAnswer.children).map((child) =>
      child.getAttribute('data-testid'),
    )
    expect(blocks).toEqual(['operator-web-candidates', 'operator-web-videos'])
    fireEvent.click(within(underAnswer).getByTestId('operator-web-video-card'))
    expect(
      within(underAnswer)
        .getByTestId('operator-web-video-iframe')
        .getAttribute('src'),
    ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })
})

describe('StudioOperatorPanel · 会话区裁剪', () => {
  it('⭐ 时间线可收缩且自己滚；chip · 规格行 · 输入区都 `shrink-0` 且排在它后面', () => {
    renderPanel()
    const thread = screen.getByTestId('operator-thread')
    expect(thread.className).toContain('min-h-0')
    expect(thread.className).toContain('flex-1')
    expect(thread.className).toContain('overflow-y-auto')

    // 装着这四样的那一层必须是**能收缩的 flex 列**，否则 `flex-1` 无从谈起。
    const column = thread.parentElement as HTMLElement
    expect(column.className).toContain('flex')
    expect(column.className).toContain('min-h-0')
    expect(column.className).toContain('flex-col')

    for (const id of ['operator-suggestion-row', 'operator-input-area']) {
      const node = screen.getByTestId(id)
      expect(node.className).toContain('shrink-0')
      // DOCUMENT_POSITION_FOLLOWING = 它排在时间线**后面**（所以被顶的是它们
      // 上面那一格，而那一格会滚）。
      expect(
        thread.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })
})

/**
 * 建议 chip（D7c ④ · 画板 `DesignD7cFlow`「空态 · 改后」）。
 *
 * 钉三件事：
 *  ① ⭐ **只在空态出现**（与旧实现相反）——线程一开始它们就退场；
 *  ② 长在**规格行上方**（自上而下：chip → 规格行 → 输入框 → 控件行）；
 *  ③ 点一颗 = 直接把那句话发出去（拍板 15），⛔ 不是填进输入框；
 *     入场逐颗错开 `STUDIO_OPERATOR_SHELL.pillStaggerMs`。
 */
describe('StudioOperatorPanel · D7c 建议 chip', () => {
  it('⭐ 空态才画；点一颗直接发送，且逐颗错开入场', () => {
    renderPanel()
    const chips = screen.getAllByTestId('operator-suggestion')
    expect(chips.map((chip) => chip.textContent)).toEqual([
      '把这句写成好提示词',
      '换个模型看差别',
    ])
    expect(chips[1]!.style.animationDelay).toBe(
      `${STUDIO_OPERATOR_SHELL.pillStaggerMs}ms`,
    )

    // 自上而下：chip → 输入框（规格行在空态让位给 chip，P7）。
    expect(
      screen
        .getByTestId('operator-suggestion-row')
        .compareDocumentPosition(screen.getByTestId('operator-input-area')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(chips[0]!)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toContain('把这句写成好提示词')
  })

  it('⭐ 线程一开始就退场（⛔ 别的地方不再出现）', () => {
    store.appendOperatorEntry({
      kind: 'user',
      id: 'first-message',
      text: '照这张参考图来',
      attachments: [],
    })
    renderPanel()
    expect(screen.queryByTestId('operator-suggestion-row')).toBeNull()
    expect(screen.queryAllByTestId('operator-suggestion')).toHaveLength(0)
  })
})

/**
 * 规格行（D12 A 定稿 · P1 / B6）。
 *
 * 钉三件事：
 *  ① 那一句在**输入框上方**，⛔ 不在头部；
 *  ② 宿主有生成旋钮时它是一颗 button，点它**就地**弹出模型 / 比例 / 张数，
 *     点一项走 `setGenerationKnob`（⛔ 不是去点参数栏那一颗）；
 *  ③ 没有旋钮时渲染成非交互的一句读数 —— ⛔ 不做「点了没反应」。
 */
describe('StudioOperatorPanel · 规格行', () => {
  afterEach(() => {
    HOST_SPEC.controls = null
  })

  it('⭐ 那一句长在输入框上方，点开就地调，点一项写回工作台', () => {
    HOST_SPEC.controls = {
      model: { id: 'seedream', label: 'Seedream 5.0 Pro' },
      models: [
        { id: 'seedream', label: 'Seedream 5.0 Pro' },
        { id: 'nano', label: 'Nano Banana Pro' },
      ],
      aspectRatio: '1:1',
      resolution: null,
      count: 4,
      choicesByModel: {
        seedream: {
          aspectRatios: ['1:1', '3:4'],
          resolutions: [],
          counts: [1, 4],
        },
      },
    }
    store.appendOperatorEntry({
      kind: 'user',
      id: 'first',
      text: '换个模型',
      attachments: [],
    })
    renderPanel()

    const line = screen.getByTestId('operator-spec-line')
    expect(line.textContent).toContain('Seedream 5.0 Pro · 1:1 · 4 张')
    expect(line.tagName).toBe('BUTTON')
    expect(
      line.compareDocumentPosition(screen.getByTestId('operator-input-area')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(line)
    const menu = screen.getByTestId('operator-spec-menu')
    fireEvent.click(
      within(menu)
        .getAllByTestId('operator-spec-option')
        .find((node) => node.dataset.value === '3:4')!,
    )
    expect(setGenerationKnob).toHaveBeenCalledWith('aspect', '3:4')
  })

  it('⭐ 宿主没有生成旋钮时它不是按钮（⛔ 不做「点了没反应」）', () => {
    store.appendOperatorEntry({
      kind: 'user',
      id: 'first',
      text: '换个模型',
      attachments: [],
    })
    renderPanel()
    const line = screen.getByTestId('operator-spec-line')
    expect(line.tagName).not.toBe('BUTTON')
    expect(line.textContent).toContain('Seedream 5.0 Pro · 1:1 · 4 张')
  })

  it('⭐ 空态时起手 chip 占它的位置（P7），⛔ 不叠两排', () => {
    renderPanel()
    expect(screen.getByTestId('operator-suggestion-row')).toBeTruthy()
    expect(screen.queryByTestId('operator-spec-line')).toBeNull()
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
    const editor = screen.getByRole('combobox', {
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

  it('工具行：＋ · 文本模型 ……… 发送；上传 / 素材库 / @ 收进 ＋（P4 第 4 项）', () => {
    renderPanel()
    const toolbar = within(screen.getByTestId('operator-toolbar'))
    expect(toolbar.getByTestId('operator-add-toggle')).toBeTruthy()
    expect(toolbar.getByTestId('operator-model-chip')).toBeTruthy()
    expect(toolbar.getByTestId('operator-send')).toBeTruthy()
    for (const id of [
      'operator-attach-toggle',
      'operator-library-toggle',
      'operator-mention-button',
    ])
      expect(screen.queryByTestId(id)).toBeNull()
    openAddMenu()
    const menu = within(screen.getByTestId('operator-add-menu'))
    expect(menu.getByTestId('operator-add-library')).toBeTruthy()
    expect(menu.getByTestId('operator-add-upload')).toBeTruthy()
    expect(menu.getByTestId('operator-add-mention')).toBeTruthy()
  })

  /**
   * D12 T-A：裸图标 + 一个边框。两颗图标不带框（只有 hover 底），发送是**唯一**
   * 的实底 —— 圆形。⛔ 不许哪一颗又穿回一身白底细边。
   */
  it('⭐ T-A：图标无框，发送是圆形实底', () => {
    renderPanel()
    const toolbar = within(screen.getByTestId('operator-toolbar'))
    for (const id of ['operator-add-toggle']) {
      const className = toolbar.getByTestId(id).className
      expect(className).toContain('size-8')
      expect(className).not.toContain('border')
      expect(className).not.toContain('bg-card')
    }
    const send = toolbar.getByTestId('operator-send').className
    expect(send).toContain('rounded-full')
    expect(send).toContain('bg-foreground')
    expect(toolbar.getByTestId('operator-model-chip').className).not.toContain(
      'border',
    )
  })

  it('S-C：有生成键时发送键左边有自动生成开关，拨一下只改会话里那一格', () => {
    HOST_SPEC.controls = {
      model: null,
      models: [],
      aspectRatio: '1:1',
      resolution: null,
      count: 1,
      choicesByModel: {},
    }
    HOST_SPEC.trigger = 'workbench'
    renderPanel()
    const toggle = screen.getByTestId('operator-auto-generate')
    expect(
      toggle.compareDocumentPosition(screen.getByTestId('operator-send')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(store.getOperatorState().autoGenerate).toBe(false)
    fireEvent.click(toggle)
    expect(store.getOperatorState().autoGenerate).toBe(true)
    HOST_SPEC.controls = null
    HOST_SPEC.trigger = null
  })

  it('S-C：画布没有生成旋钮，但画布卡有自己的生成键 → 同样画自动生成开关', () => {
    HOST_SPEC.trigger = 'canvas'
    renderPanel()
    expect(screen.getByTestId('operator-auto-generate')).toBeInTheDocument()
    HOST_SPEC.trigger = null
  })

  it('没有生成键的宿主（装配台 / 角色页）不画自动生成开关', () => {
    renderPanel()
    expect(screen.queryByTestId('operator-auto-generate')).toBeNull()
  })

  it('上传按钮 = 开文件选择器，选完交回上传通道（⛔ 不是装饰）', () => {
    renderPanel()
    const input = screen.getByTestId(
      'operator-attach-file-input',
    ) as HTMLInputElement
    const openPicker = vi.spyOn(input, 'click')

    openAddMenu()
    fireEvent.click(screen.getByTestId('operator-add-upload'))
    expect(openPicker).toHaveBeenCalledTimes(1)

    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(UPLOAD.uploadFiles).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('')
  })

  it('「先问我」开关零命中', () => {
    renderPanel()
    expect(screen.queryByTestId('operator-ask-first')).toBeNull()
  })
})

/**
 * 素材库按钮（切片 #7c，owner 2026-09-11「@ 那边取消，最好新做一个按钮」）。
 *
 * ⭐ 这份用例存在的理由与本文件其余部分同源：弹层自己绿着、引用管线自己绿着，
 * 而「下行到底有没有这颗按钮、点了到底开不开弹层、挑完到底落不落胶囊」只有把
 * 面板真的画出来才看得见。
 * ⚠ 挑中的图只进这条消息（§10b：正文里一枚 `library` 胶囊），⛔ 不挂工作台参考位。
 */
describe('素材库按钮（切片 #7c）', () => {
  it('下行有素材库按钮，点一下开弹层，首屏页大小是 10', () => {
    renderPanel()
    expect(screen.queryByTestId('asset-selector-dialog')).toBeNull()
    openAddMenu()
    fireEvent.click(screen.getByTestId('operator-add-library'))

    const dialog = screen.getByTestId('asset-selector-dialog')
    expect(dialog).toHaveAttribute('data-page-size', '10')
    expect(dialog).toHaveAttribute('data-media-type', 'image')
    expect(dialog).toHaveAttribute('data-multi', 'true')
  })

  it('挑两张：正文里各留一枚 @ 胶囊（按 id 指，⛔ 不再按「图N」编号）', () => {
    renderPanel()
    const editor = screen.getByRole('combobox', { name: editorName })
    openAddMenu()
    fireEvent.click(screen.getByTestId('operator-add-library'))
    fireEvent.click(screen.getByTestId('asset-selector-confirm-many'))

    expect(
      store.getOperatorState().mentions.map((item) => [item.id, item.scope]),
    ).toEqual([
      ['lib-1', 'library'],
      ['lib-2', 'library'],
    ])
    const chips = editor.querySelectorAll('[data-mention]')
    expect([...chips].map((chip) => chip.getAttribute('data-mention'))).toEqual(
      ['<@image:lib-1>', '<@image:lib-2>'],
    )
    expect(editor.textContent).not.toContain('@Image')
  })

  it('＋ 里最近那一行：开着才取，点一张直接成 @ 胶囊', async () => {
    searchAssistantMentionLibraryAPI.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'lib-9',
            kind: 'image',
            label: '图_009·海边',
            url: 'https://cdn.test/lib-9.png',
            seq: 9,
            folders: [],
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        folders: [],
      },
    })
    renderPanel()
    expect(searchAssistantMentionLibraryAPI).not.toHaveBeenCalled()
    openAddMenu()
    const recent = await screen.findByTestId('operator-add-recent-item')
    expect(recent).toHaveAttribute('title', '图_009·海边')
    fireEvent.click(recent)
    await vi.waitFor(() =>
      expect(store.getOperatorState().mentions.map((item) => item.id)).toEqual([
        'lib-9',
      ]),
    )
    const editor = screen.getByRole('combobox', { name: editorName })
    expect(editor.querySelectorAll('[data-mention]')).toHaveLength(1)
  })

  it('已经在正文里的那张跳过 —— ⛔ 同一件不插第二枚', () => {
    libraryPicks = [
      {
        id: 'lib-1',
        url: 'https://cdn.test/lib-1.png',
        prompt: '库里那张海报',
        outputType: 'IMAGE',
      },
      {
        id: 'lib-1',
        url: 'https://cdn.test/lib-1.png',
        prompt: '库里那张海报',
        outputType: 'IMAGE',
      },
    ]
    renderPanel()
    const editor = screen.getByRole('combobox', { name: editorName })
    openAddMenu()
    fireEvent.click(screen.getByTestId('operator-add-library'))
    fireEvent.click(screen.getByTestId('asset-selector-confirm-many'))
    expect(editor.querySelectorAll('[data-mention]')).toHaveLength(1)
  })
})

/**
 * `@` 菜单（设计方案 §10b）：分组 + 最近使用 + 素材库服务端检索 + 下钻 + 搜索排序；
 * 胶囊小卡片；气泡里的胶囊可点；触屏 `@` 按钮。
 */
describe('@ 菜单（§10b）', () => {
  it('空查询按分组列；素材库那一组走服务端检索（菜单开着才问）', async () => {
    searchAssistantMentionLibraryAPI.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'lib-9',
            kind: 'image',
            label: '图_009·海边',
            url: 'https://cdn.test/lib-9.png',
            seq: 9,
            folders: ['夏天'],
            prompt: '海边日落',
            model: 'seedream',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        folders: [{ id: 'f1', name: '夏天', parentId: null }],
      },
    })
    renderPanel()
    expect(searchAssistantMentionLibraryAPI).not.toHaveBeenCalled()
    typeInto(screen.getByRole('combobox', { name: editorName }), '@')
    const library = await screen.findByRole('option', { name: /图_009·海边/ })
    expect(library).toHaveTextContent('#9')
    expect(searchAssistantMentionLibraryAPI).toHaveBeenCalledWith(
      expect.objectContaining({ q: '' }),
      expect.anything(),
    )
    const groups = within(screen.getByRole('listbox')).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'groups.references',
      'groups.results',
      'groups.library',
    ])
    // 文件夹可以下钻：点进去就按文件夹再问一次。
    fireEvent.click(screen.getByRole('option', { name: /openFolder/ }))
    await vi.waitFor(() =>
      expect(searchAssistantMentionLibraryAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ folderId: 'f1' }),
        expect.anything(),
      ),
    )
    expect(screen.getByRole('option', { name: /back/ })).toBeTruthy()
  })

  it('搜索：多词都要命中，名字前缀排在子串前面；一条都没中时放掉这个 @', async () => {
    renderPanel()
    const editor = screen.getByRole('combobox', { name: editorName })
    typeInto(editor, '@第二')
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.getAttribute('data-mention-key')),
    ).toEqual(['image:gen-2'])
    // 接着写一句话（多词查询一条都没中）：菜单自己收掉，回车就是发送。
    typeInto(editor, '@第二 张再来一版')
    await vi.waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(editor).toHaveAttribute('aria-expanded', 'false')
  })

  it('触屏入口：＋ 里的「@ 角色或素材」在光标处写一个 @ 并打开菜单', async () => {
    renderPanel()
    openAddMenu()
    fireEvent.click(screen.getByTestId('operator-add-mention'))
    const editor = screen.getByRole('combobox', { name: editorName })
    await vi.waitFor(() => expect(editor.textContent).toBe('@'))
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(editor).toHaveAttribute('aria-expanded', 'true')
  })

  it('选中的东西进「最近使用」，下次空查询排最上面', () => {
    renderPanel()
    const editor = screen.getByRole('combobox', { name: editorName })
    typeInto(editor, '@')
    fireEvent.click(screen.getByRole('option', { name: /第二张/ }))
    // 删掉那枚胶囊，再打一次 @：刚用过的那条在「最近使用」组里。
    act(() => {
      editor.textContent = ''
      fireEvent.input(editor)
    })
    typeInto(editor, '@')
    const groups = within(screen.getByRole('listbox')).getAllByRole('group')
    expect(groups[0]).toHaveAttribute('aria-label', 'groups.recent')
    expect(within(groups[0]!).getByRole('option')).toHaveAttribute(
      'data-mention-key',
      'image:gen-2',
    )
  })

  it('点胶囊弹小卡片：移除就从正文里摘掉那一枚', () => {
    renderPanel()
    const editor = screen.getByRole('combobox', { name: editorName })
    typeInto(editor, '看@')
    fireEvent.click(screen.getByRole('option', { name: /第一张/ }))
    const chip = editor.querySelector('[data-mention]') as HTMLElement
    expect(chip).not.toBeNull()
    fireEvent.click(chip)
    const card = screen.getByTestId('operator-mention-card')
    expect(within(card).getByText('第一张')).toBeTruthy()
    fireEvent.click(within(card).getByTestId('operator-mention-card-remove'))
    expect(screen.queryByTestId('operator-mention-card')).toBeNull()
    expect(editor.querySelector('[data-mention]')).toBeNull()
  })

  it('外面递进来的（问助手 / 拖图）落成正文末尾的一枚胶囊，⛔ 没有第二排', () => {
    renderPanel()
    const editor = screen.getByRole('combobox', { name: editorName })
    act(() =>
      store.addOperatorMention({
        id: 'gen-1',
        kind: 'image',
        url: HOST_RESULTS[0].url,
        label: '第一张',
      }),
    )
    expect(editor.querySelector('[data-mention]')).toHaveAttribute(
      'data-mention',
      '<@image:gen-1>',
    )
    expect(screen.queryByTestId('operator-mention-chip')).toBeNull()
    // 再递一次同一张：正文里还是一枚。
    act(() =>
      store.addOperatorMention({
        id: 'gen-1',
        kind: 'image',
        url: HOST_RESULTS[0].url,
        label: '第一张',
      }),
    )
    expect(editor.querySelectorAll('[data-mention]')).toHaveLength(1)
    expect(screen.getByTestId('operator-mention-count')).toHaveTextContent(
      'mention.count',
    )
  })

  it('气泡里的 @ 胶囊可点：有地址的图开大图', () => {
    store.appendOperatorEntry({
      kind: 'user',
      id: 'with-mention',
      text: '看看「第一张」',
      attachments: [],
      mentions: [
        {
          kind: 'image',
          id: 'gen-1',
          label: '第一张',
          scope: 'result',
          generationId: 'gen-1',
          url: HOST_RESULTS[0].url,
          thumb: HOST_RESULTS[0].url,
        },
      ],
    })
    renderPanel()
    const chip = within(screen.getByTestId('operator-user-text')).getByTestId(
      'operator-user-mention',
    )
    expect(chip.tagName).toBe('BUTTON')
    expect(chip).toHaveTextContent('第一张')
    expect(screen.getByTestId('operator-user-text')).not.toHaveTextContent('「')
  })
})

/** D12 S12：步数用完那一轮之后，末尾给「继续 / 先到这里」。 */
describe('StudioOperatorPanel · 步数用完', () => {
  it('停在步数上限时出两颗 chip：继续 = 发一句「继续」，先到这里 = 收起', () => {
    store.appendOperatorEntry({
      kind: 'user',
      id: 'first',
      text: '做成四套换装',
      attachments: [],
    })
    store.setOperatorOutOfSteps(true)
    renderPanel()
    fireEvent.click(screen.getByTestId('operator-out-of-steps-continue'))
    expect(send.mock.calls[0]?.[0]).toContain('outOfSteps.continuePrompt')
  })

  it('「先到这里」只收起 chip，⛔ 不发请求', () => {
    store.setOperatorOutOfSteps(true)
    renderPanel()
    fireEvent.click(screen.getByTestId('operator-out-of-steps-stop'))
    expect(screen.queryByTestId('operator-out-of-steps')).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })
})
