// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_PERSONA_ARCHETYPE_PRESETS,
  ASSISTANT_PERSONA_DEFAULTS,
} from '@/constants/assistant-persona'
import type { AssistantPersona } from '@/types/assistant-persona'

/**
 * 助手设置 B（owner 2026-09-26）的回归闸：**改了就存**，每一下存的都是对的那几格。
 */

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}|${Object.values(values).join(',')}` : key,
  useFormatter: () => ({ dateTime: () => 'date' }),
}))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const api = vi.hoisted(() => ({
  getAssistantPersonaAPI: vi.fn(),
  updateAssistantPersonaAPI: vi.fn(),
  uploadAssistantAvatarAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', () => api)

const DENIA = {
  id: 'card_denia',
  name: 'Denia',
  sourceImageUrl: 'https://cdn.test/denia.png',
  persona: { speech: '' },
  variants: [],
}
vi.mock('@/hooks/cards', () => ({
  useCharacterCards: () => ({ cards: [DENIA] }),
}))

vi.mock('@/hooks/use-assistant-memories', () => ({
  useAssistantMemories: () => ({
    memories: [],
    isLoading: false,
    error: null,
    update: vi.fn(),
    remove: vi.fn(),
    clearAll: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-project-rules', () => ({
  useProjectRules: () => ({
    rules: [],
    isLoading: false,
    error: null,
    add: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-local-preference', () => ({
  useLocalPreference: () => [null, vi.fn()],
}))

import { AssistantSettingsDialog } from '@/components/business/studio/assistant-operator/AssistantSettingsDialog'
import { AssistantSettings } from './AssistantSettings'

// jsdom 没有 scrollIntoView（展开「高级」时会平滑滚一下）。
Element.prototype.scrollIntoView = vi.fn()

const BALANCED = ASSISTANT_PERSONA_ARCHETYPE_PRESETS.balanced
const PERSONA: AssistantPersona = {
  ...ASSISTANT_PERSONA_DEFAULTS,
  name: '达妮娅',
  addressUserAs: 'JIAN',
  tone: 'terse',
}

function renderSettings(persona: AssistantPersona = PERSONA) {
  api.getAssistantPersonaAPI.mockResolvedValue({ success: true, data: persona })
  return render(
    <AssistantSettings
      variant="page"
      section="persona"
      onSectionChange={vi.fn()}
    />,
  )
}

function lastSaved() {
  const calls = api.updateAssistantPersonaAPI.mock.calls
  return calls[calls.length - 1]?.[0] as Record<string, unknown>
}

function openAdvanced() {
  fireEvent.click(screen.getByTestId('assistant-advanced-toggle'))
}

describe('AssistantSettings · 人设', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.updateAssistantPersonaAPI.mockImplementation(
      async (input: Record<string, unknown>) => ({
        success: true,
        data: { ...PERSONA, ...input },
      }),
    )
  })

  it('选一档当场存，只填四格，⛔ 不动语气', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')

    fireEvent.click(
      screen.getByRole('radio', { name: /archetype\.cautious\.name/ }),
    )

    await waitFor(() =>
      expect(api.updateAssistantPersonaAPI).toHaveBeenCalled(),
    )
    expect(lastSaved()).toMatchObject({
      ...ASSISTANT_PERSONA_ARCHETYPE_PRESETS.cautious,
      tone: 'terse',
    })
  })

  it('换语气不会让档位跳成「自定义」', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')
    openAdvanced()

    fireEvent.click(screen.getByRole('radio', { name: 'tone.professional' }))

    await waitFor(() =>
      expect(lastSaved()).toMatchObject({
        tone: 'professional',
        toneFromCharacter: false,
        verbosity: BALANCED.verbosity,
      }),
    )
    expect(screen.queryByTestId('assistant-archetype-custom')).toBeNull()
    expect(
      screen.getByRole('radio', { name: /archetype\.balanced\.name/ }),
    ).toBeChecked()
  })

  it('改回复长度 → 多出「自定义」那一档并选中', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')
    openAdvanced()

    fireEvent.click(screen.getByRole('radio', { name: 'length.detailed' }))

    await waitFor(() =>
      expect(lastSaved()).toMatchObject({ verbosity: 'detailed' }),
    )
    expect(
      screen.getByRole('radio', { name: /archetype\.custom\.name/ }),
    ).toBeChecked()
  })

  it('名字：打字不存，失焦才存', async () => {
    renderSettings()
    const input = await screen.findByDisplayValue('达妮娅')

    fireEvent.change(input, { target: { value: 'Mika' } })
    expect(api.updateAssistantPersonaAPI).not.toHaveBeenCalled()

    fireEvent.blur(input)
    await waitFor(() =>
      expect(lastSaved()).toMatchObject({
        name: 'Mika',
        nameFromCharacter: false,
      }),
    )
  })

  it('用角色：一次存好角色那几格', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')

    fireEvent.pointerDown(screen.getByTestId('assistant-character-select'), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByText('Denia'))

    await waitFor(() =>
      expect(lastSaved()).toMatchObject({
        characterCardId: DENIA.id,
        nameFromCharacter: true,
        toneFromCharacter: true,
        avatarChoice: 'character',
      }),
    )
  })

  it('角色还没写说话方式：那一格灰着，旁边给「去写」', async () => {
    renderSettings({
      ...PERSONA,
      characterCardId: DENIA.id,
      character: {
        id: DENIA.id,
        name: 'Denia',
        faceUrl: null,
        hasSpeech: false,
      },
      nameFromCharacter: true,
      toneFromCharacter: true,
      name: 'Denia',
      avatarChoice: 'character',
    })
    await screen.findByDisplayValue('Denia')
    openAdvanced()

    expect(
      screen.getByRole('radio', { name: 'tone.character|Denia' }),
    ).toBeDisabled()
    expect(
      screen.getByText(/tone\.characterMissing\|Denia/),
    ).toBeInTheDocument()
    // 没写说话方式时仍按自己那档语气说话。
    expect(screen.getByRole('radio', { name: 'tone.terse' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('自定义语气没写那一句时先不存，写完失焦才存', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')
    openAdvanced()

    fireEvent.click(screen.getByRole('radio', { name: 'tone.custom' }))
    expect(api.updateAssistantPersonaAPI).not.toHaveBeenCalled()
    expect(screen.getByText('tone.customRequired')).toBeInTheDocument()

    const input = screen.getByTestId('assistant-tone-custom')
    fireEvent.change(input, { target: { value: '像剪辑师那样说话' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(lastSaved()).toMatchObject({
        tone: 'custom',
        toneCustom: '像剪辑师那样说话',
        toneFromCharacter: false,
      }),
    )
  })

  it('没保存上：右上角变成「没保存上 · 重试」，重试发的是控件上那一份', async () => {
    api.updateAssistantPersonaAPI.mockResolvedValueOnce({
      success: false,
      error: 'boom',
    })
    renderSettings()
    await screen.findByDisplayValue('达妮娅')

    fireEvent.click(
      screen.getByRole('radio', { name: /archetype\.handsOff\.name/ }),
    )
    const retry = await screen.findByRole('button', { name: 'status.retry' })
    expect(screen.getByTestId('assistant-save-status')).toHaveAttribute(
      'data-status',
      'failed',
    )

    fireEvent.click(retry)
    await waitFor(() =>
      expect(screen.getByTestId('assistant-save-status')).toHaveAttribute(
        'data-status',
        'saved',
      ),
    )
    expect(lastSaved()).toMatchObject(
      ASSISTANT_PERSONA_ARCHETYPE_PRESETS.handsOff,
    )
  })
})

describe('AssistantSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getAssistantPersonaAPI.mockResolvedValue({
      success: true,
      data: PERSONA,
    })
  })

  it('「查看规则」直接落到记忆页；右上角那颗关闭把弹窗关掉', async () => {
    const onOpenChange = vi.fn()
    render(
      <AssistantSettingsDialog
        open
        onOpenChange={onOpenChange}
        section="memory"
      />,
    )

    expect(await screen.findByTestId('assistant-rules')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'tabs.memory' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
