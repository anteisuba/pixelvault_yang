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

/** 规则页在本文件里只是「另一页」，拉不拉规则跟这几条断言无关。 */
vi.mock('@/hooks/use-project-rules', () => ({
  useProjectRules: () => ({
    rules: [],
    isLoading: false,
    error: null,
    remove: vi.fn(),
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
vi.mock('@/hooks/use-context-cards', () => ({
  useContextCards: () => ({
    cards: cardsState.current,
    isLoading: false,
    error: null,
    setPinned,
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
  return render(
    <AssistantSettingsDialog
      open
      onOpenChange={vi.fn()}
      fallbackInitial="图"
    />,
  )
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
    })
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
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={onOpenChange}
        fallbackInitial="图"
      />,
    )

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
  it('列出卡、常挂开关落到 setPinned、新建开出编辑器', () => {
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={vi.fn()}
        section={ASSISTANT_SETTINGS_SECTIONS.cards}
        scope="image"
        fallbackInitial="图"
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
        fallbackInitial="图"
      />,
    )
    expect(screen.queryByTestId('assistant-context-card-pin')).toBeNull()
  })
})
