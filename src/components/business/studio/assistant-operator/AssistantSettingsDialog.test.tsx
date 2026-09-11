// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`
//   （加包之前先翻已有依赖）。这几下都是单纯的点击与输入，两者等价。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_PLAN_MODE_IDS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_VERBOSITY_IDS,
} from '@/constants/assistant-persona'
import type { AssistantPersona } from '@/types/assistant-persona'

/**
 * 助手设置对话框（§8.1–8.2）的回归闸：**每一档控件都真的落进那一次保存**。
 *
 * ⚠ 这一颗最容易以「界面画出来了、保存的却是旧值」的方式坏掉 —— 草稿态与
 * 服务端那一份是两个对象，漏接一个 `patch` 编译期一个字都不红。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockSave = vi.fn()
const mockUploadAvatar = vi.fn()
const mockRemoveAvatar = vi.fn()
let personaState: AssistantPersona = {
  ...ASSISTANT_PERSONA_DEFAULTS,
  avatarUrl: null,
}
let isSavingState = false

vi.mock('@/hooks/use-assistant-persona', () => ({
  useAssistantPersona: () => ({
    persona: personaState,
    isLoading: false,
    isSaving: isSavingState,
    error: null,
    save: mockSave,
    uploadAvatar: mockUploadAvatar,
    removeAvatar: mockRemoveAvatar,
    reload: vi.fn(),
  }),
}))

/**
 * 规则页（§10 + v2 §9.3 的来源名单）—— 规则表与两条写腿都桩住：
 * 这一层要验的是「新增那一行发出去的是什么、列表怎么摆」，不是那条 fetch。
 */
const addRule = vi.hoisted(() => vi.fn(async () => true))
const removeRule = vi.hoisted(() => vi.fn(async () => true))
const rulesState = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('@/hooks/use-project-rules', () => ({
  useProjectRules: () => ({
    rules: rulesState.current,
    isLoading: false,
    error: null,
    add: addRule,
    remove: removeRule,
    reload: vi.fn(),
  }),
}))

/**
 * 上下文卡那一页（切片 Y）—— 桩住卡表，用例只验「列表画出来了、常挂开关落到
 * `setPinned`、新建按钮开出编辑器」。
 */
const setPinned = vi.hoisted(() => vi.fn())
const cardsState = vi.hoisted(() => ({
  current: [
    {
      id: 'card-1',
      kind: 'character',
      name: '阿岚',
      summary: '银发、金瞳',
      pinnedScopes: [] as string[],
    },
  ],
}))
/**
 * **待确认区**那一份（v2 §8.1）—— ⚠ 与卡表是**两次查询**：默认那次看不见待确认
 * 的卡（服务端只回已确认的），所以桩也按 `status` 分两份，⛔ 别让一份桩糊弄过去。
 */
const proposedState = vi.hoisted(() => ({
  current: [] as {
    id: string
    kind: string
    name: string
    summary: string
    pinnedScopes: string[]
  }[],
}))
const updateCard = vi.hoisted(() => vi.fn(async () => ({ id: 'card-2' })))
const removeCard = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/hooks/use-context-cards', () => ({
  useContextCards: (options?: { status?: string }) => ({
    cards:
      options?.status === 'proposed'
        ? proposedState.current
        : cardsState.current,
    isLoading: false,
    error: null,
    setPinned,
    update: updateCard,
    remove: removeCard,
    reload: vi.fn(),
  }),
}))

/** 编辑器本身有自己的用例 —— 这里只要知道「它开了」。 */
vi.mock(
  '@/components/business/studio/assistant-operator/ContextCardDialog',
  () => ({
    ContextCardDialog: ({ open }: { open: boolean }) =>
      open ? <div data-testid="context-card-dialog" /> : null,
  }),
)

import {
  ASSISTANT_SETTINGS_SECTIONS,
  AssistantSettingsDialog,
} from './AssistantSettingsDialog'

function renderDialog() {
  return render(<AssistantSettingsDialog open onOpenChange={vi.fn()} />)
}

/** 分段控件的每一格都是一颗按钮，文案 = i18n 键（上面的 mock 直接回键名）。 */
function clickOption(key: string) {
  fireEvent.click(screen.getByText(key))
}

describe('AssistantSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    personaState = { ...ASSISTANT_PERSONA_DEFAULTS, avatarUrl: null }
    isSavingState = false
    mockSave.mockResolvedValue(true)
  })

  it('保存时把每一档控件的当前值发出去，且只发一次', async () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText('nameLabel'), {
      target: { value: 'Mika' },
    })
    clickOption(`tone.${ASSISTANT_PERSONA_TONE_IDS.friendly}`)
    clickOption(`verbosity.${ASSISTANT_PERSONA_VERBOSITY_IDS.detailed}`)
    clickOption(`planMode.${ASSISTANT_PERSONA_PLAN_MODE_IDS.always}`)
    clickOption('language.chinese')
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave).toHaveBeenCalledWith({
      name: 'Mika',
      avatarPreset: ASSISTANT_PERSONA_DEFAULTS.avatarPreset,
      tone: ASSISTANT_PERSONA_TONE_IDS.friendly,
      toneCustom: null,
      verbosity: ASSISTANT_PERSONA_VERBOSITY_IDS.detailed,
      planMode: ASSISTANT_PERSONA_PLAN_MODE_IDS.always,
      language: 'chinese',
      // ⚠ 设置里没有这一格的控件（模型选在输入区的 chip 上），但保存必须原样
      //   带上它 —— 不带的话在设置里点一次保存就把用户选的模型打回「自动」。
      routeModel: ASSISTANT_PERSONA_DEFAULTS.routeModel,
      // v2 §11.3 的三项 —— 没动过就是默认值，照样原样发出去。
      nextStepHint: ASSISTANT_PERSONA_DEFAULTS.nextStepHint,
      useMyWords: ASSISTANT_PERSONA_DEFAULTS.useMyWords,
      addressUserAs: ASSISTANT_PERSONA_DEFAULTS.addressUserAs,
    })
  })

  /**
   * v2 §11.3 的三项控件（commit #15）。⚠ 与上面那条的判据逐字同源：界面画出来
   * 了、保存的却是旧值，是这颗组件最容易坏的方式。
   */
  it('三项用户偏好：两个开关 + 称呼各自落进那一次保存', async () => {
    renderDialog()

    fireEvent.click(screen.getByTestId('assistant-next-step-hint'))
    fireEvent.click(screen.getByTestId('assistant-use-my-words'))
    fireEvent.change(screen.getByTestId('assistant-address-user-as'), {
      target: { value: '阿羊' },
    })
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      // 默认 false → 点一下变 true
      nextStepHint: true,
      // 默认 true → 点一下变 false
      useMyWords: false,
      addressUserAs: '阿羊',
    })
  })

  /** 称呼清空 = 回到「用账号名」，所以落的是 `null` ⛔ 不是空串。 */
  it('称呼清空时发 null', async () => {
    personaState = {
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      addressUserAs: '阿羊',
    }
    renderDialog()

    fireEvent.change(screen.getByTestId('assistant-address-user-as'), {
      target: { value: '  ' },
    })
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][0].addressUserAs).toBeNull()
  })

  it('三项的初始态读的是 persona 那一份', () => {
    personaState = {
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      nextStepHint: true,
      useMyWords: false,
      addressUserAs: '阿羊',
    }
    renderDialog()

    expect(
      screen.getByTestId('assistant-next-step-hint').getAttribute('data-state'),
    ).toBe('checked')
    expect(
      screen.getByTestId('assistant-use-my-words').getAttribute('data-state'),
    ).toBe('unchecked')
    expect(
      (screen.getByTestId('assistant-address-user-as') as HTMLInputElement)
        .value,
    ).toBe('阿羊')
  })

  it('换预设头像后保存带上新的 preset id', async () => {
    renderDialog()

    const second = ASSISTANT_AVATAR_PRESET_IDS[1]
    fireEvent.click(screen.getByLabelText(`avatarPreset.${second}`))
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][0].avatarPreset).toBe(second)
  })

  /** owner 2026-09-07：「只给一两张预设图」—— 两个，⛔ 不是六个。 */
  it('预设只有两款：品牌标 + 首字母', () => {
    renderDialog()

    expect(ASSISTANT_AVATAR_PRESET_IDS).toHaveLength(2)
    for (const presetId of ASSISTANT_AVATAR_PRESET_IDS) {
      expect(screen.getByLabelText(`avatarPreset.${presetId}`)).toBeTruthy()
    }
  })

  /**
   * 存量行里还留着收窄前的 id（`spark` 等）。⚠ 那种行**照样要能打开设置**：
   * 预览退回默认款，⛔ 不空圈、⛔ 不炸。
   */
  it('persona 上是悬空 preset id 时预览退回默认款', () => {
    personaState = {
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      // ⚠ 故意绕过词表：模拟库里存量的悬空 id（收窄前的 `spark`）。
      avatarPreset: 'spark' as AssistantPersona['avatarPreset'],
    }
    renderDialog()

    const preview = screen.getByTestId('assistant-avatar-preview')
    expect(
      preview
        .querySelector('[data-testid="assistant-avatar-glyph"]')
        ?.getAttribute('data-preset'),
    ).toBe(ASSISTANT_AVATAR_PRESET_IDS[0])
  })

  /** 选了自定义语气却没写那句话 —— 就地拦住，⛔ 不发一次注定被拒的请求。 */
  it('tone=custom 而那句话是空的时候不发保存', async () => {
    renderDialog()

    clickOption(`tone.${ASSISTANT_PERSONA_TONE_IDS.custom}`)
    fireEvent.click(screen.getByText('save'))

    await waitFor(() =>
      expect(screen.getByText('toneCustomRequired')).toBeInTheDocument(),
    )
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('写了自定义语气之后保存把那一句一起带上', async () => {
    renderDialog()

    clickOption(`tone.${ASSISTANT_PERSONA_TONE_IDS.custom}`)
    fireEvent.change(screen.getByPlaceholderText('toneCustomPlaceholder'), {
      target: { value: 'Talk like a film editor' },
    })
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      tone: ASSISTANT_PERSONA_TONE_IDS.custom,
      toneCustom: 'Talk like a film editor',
    })
  })

  /**
   * 头像那两条腿走的是另一条路由，⛔ 不跟着「保存」走 —— 攒着等保存会让「取消」
   * 变成一句谎话（R2 上的对象已经换掉了）。
   */
  it('有自定义头像时才画「去掉」，点它只调撤销那条腿', async () => {
    personaState = {
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: 'https://cdn.test/a.png',
    }
    renderDialog()

    fireEvent.click(screen.getByText('avatarRemove'))

    await waitFor(() => expect(mockRemoveAvatar).toHaveBeenCalledTimes(1))
    expect(mockSave).not.toHaveBeenCalled()
  })

  /**
   * **bug 1**（2026-09-06 真机）：`save()` 失败时旧版一个字都不说 —— 弹层不关、
   * 没有 toast、没有红字，用户只能反复点「保存」。失败必须**就地**说出来，
   * 而且草稿要留在原地（关掉就没了）。
   */
  it('保存失败时就地报错、⛔ 不关弹层', async () => {
    mockSave.mockResolvedValue(false)
    const onOpenChange = vi.fn()
    render(<AssistantSettingsDialog open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('save'))

    await waitFor(() =>
      expect(
        screen.getByTestId('assistant-persona-save-error'),
      ).toHaveTextContent('saveFailed'),
    )
    expect(screen.getByTestId('assistant-persona-save-error')).toHaveAttribute(
      'role',
      'alert',
    )
    // ⛔ 没有 `onOpenChange(false)`：关掉等于把用户刚填的几格连同错误一起吞掉。
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  /** 再动一格就把上一次那条红字收掉 —— 它说的是上一个草稿。 */
  it('改一格之后上一次的失败提示消失', async () => {
    mockSave.mockResolvedValue(false)
    renderDialog()

    fireEvent.click(screen.getByText('save'))
    await waitFor(() =>
      expect(
        screen.getByTestId('assistant-persona-save-error'),
      ).toHaveTextContent('saveFailed'),
    )

    clickOption(`tone.${ASSISTANT_PERSONA_TONE_IDS.friendly}`)
    // ⚠ 槽本身**留着**（live region 得常驻），空的是它的内容。
    expect(
      screen.getByTestId('assistant-persona-save-error'),
    ).toBeEmptyDOMElement()
  })

  /** 保存中按钮里那颗 spinner 有**常驻的槽**——宽度不跳（`ui-defaults.md §5`）。 */
  it('保存中按钮禁用并显示 spinner', () => {
    isSavingState = true
    renderDialog()

    const button = screen.getByText('save').closest('button')
    expect(button).toBeDisabled()
    expect(button?.querySelector('[role="status"]')).not.toBeNull()
  })
})

describe('助手设置 · 上下文卡页（切片 Y）', () => {
  beforeEach(() => {
    proposedState.current = []
    updateCard.mockClear()
    removeCard.mockClear()
  })

  /** ⛔ 没有提议时整块不画：常年空着的区块只会把真正的卡表往下挤。 */
  it('没有提议时待确认区不渲染', () => {
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={vi.fn()}
        section={ASSISTANT_SETTINGS_SECTIONS.cards}
      />,
    )
    expect(screen.queryByTestId('assistant-context-cards-proposed')).toBeNull()
  })

  /** 待确认区在卡表**之上**，每条两颗：存下（翻面）/ 删掉（真删）。 */
  it('待确认区列出提议，存下翻面成 confirmed，删掉走 remove', () => {
    proposedState.current = [
      {
        id: 'card-2',
        kind: 'style',
        name: '黄昏逆光',
        summary: '暖色压低，轮廓留一圈光',
        pinnedScopes: [],
      },
    ]
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={vi.fn()}
        section={ASSISTANT_SETTINGS_SECTIONS.cards}
      />,
    )
    const region = screen.getByTestId('assistant-context-cards-proposed')
    expect(region).toHaveTextContent('黄昏逆光')
    expect(
      screen.getAllByTestId('assistant-context-card-proposed-item'),
    ).toHaveLength(1)

    fireEvent.click(screen.getByTestId('assistant-context-card-confirm'))
    expect(updateCard).toHaveBeenCalledWith('card-2', { status: 'confirmed' })

    fireEvent.click(screen.getByTestId('assistant-context-card-reject'))
    expect(removeCard).toHaveBeenCalledWith('card-2')
  })

  it('列出卡、常挂开关落到 setPinned、新建开出编辑器', () => {
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={vi.fn()}
        section={ASSISTANT_SETTINGS_SECTIONS.cards}
        scope="image"
      />,
    )
    expect(screen.getAllByTestId('assistant-context-card-item')).toHaveLength(1)

    fireEvent.click(screen.getByTestId('assistant-context-card-pin'))
    expect(setPinned).toHaveBeenCalledWith('card-1', 'image', true)

    expect(screen.queryByTestId('context-card-dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('assistant-context-card-new'))
    expect(screen.getByTestId('context-card-dialog')).toBeInTheDocument()
  })

  it('⛔ 没有 scope 时不画常挂开关（没有「这里」可挂）', () => {
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={vi.fn()}
        section={ASSISTANT_SETTINGS_SECTIONS.cards}
      />,
    )
    expect(screen.queryByTestId('assistant-context-card-pin')).toBeNull()
  })
})

/**
 * 来源白 / 黑名单在**设置弹层**这一侧（v2 §9.3）：新增时能选类型，列表上同类
 * 相邻且每条印着自己的类型。
 */
describe('助手设置 · 项目规则页的来源名单（v2 §9.3）', () => {
  beforeEach(() => {
    rulesState.current = []
    addRule.mockClear()
    removeRule.mockClear()
  })

  it('新增一条来源白名单：类型随着那一次 add 一起发出去', async () => {
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={vi.fn()}
        section={ASSISTANT_SETTINGS_SECTIONS.rules}
      />,
    )

    fireEvent.click(screen.getByTestId('assistant-rule-kind-sourceAllow'))
    fireEvent.change(screen.getByTestId('assistant-rule-input'), {
      target: { value: 'danbooru.donmai.us' },
    })
    fireEvent.click(screen.getByTestId('assistant-rule-add-submit'))

    await waitFor(() => expect(addRule).toHaveBeenCalledTimes(1))
    expect(addRule).toHaveBeenCalledWith({
      text: 'danbooru.donmai.us',
      kind: 'sourceAllow',
    })
  })

  /** 乱序混成一列时用户看不出自己设了多硬的闸 —— 普通规则排第一。 */
  it('列表同类相邻，每条带自己的类型', () => {
    rulesState.current = [
      {
        id: 'rule-deny',
        scope: null,
        text: 'pinterest.com',
        kind: 'sourceDeny',
        source: 'creator',
        createdAt: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'rule-note',
        scope: null,
        text: '画面里不要出现文字',
        kind: 'note',
        source: 'assistant',
        createdAt: '2026-09-09T00:00:00.000Z',
      },
    ]
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={vi.fn()}
        section={ASSISTANT_SETTINGS_SECTIONS.rules}
      />,
    )

    const kinds = screen
      .getAllByTestId('assistant-rule-item')
      .map((item) => item.getAttribute('data-rule-kind'))
    expect(kinds).toEqual(['note', 'sourceDeny'])
  })
})
