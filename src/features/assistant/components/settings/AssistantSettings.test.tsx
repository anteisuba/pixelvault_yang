// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import type { AssistantPersona } from '@/types/assistant-persona'

/**
 * 助手设置 B（owner 2026-09-26）的回归闸：**改了就存**，每一下存的都是对的那几格。
 */

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}|${Object.values(values).join(',')}` : key,
  useFormatter: () => ({ dateTime: () => 'date' }),
  useLocale: () => 'en',
}))

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

/**
 * 真的人设 / 角色卡 / 记忆 / 来源名单 hook 全挂上；只假它们背后的接口。
 */
const api = vi.hoisted(() => ({
  getAssistantPersonaAPI: vi.fn(),
  updateAssistantPersonaAPI: vi.fn(),
  uploadAssistantAvatarAPI: vi.fn(),
  listCharacterCardsAPI: vi.fn(),
  listAssistantMemoriesAPI: vi.fn(),
  listProjectRulesAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  ...api,
}))

const DENIA = {
  id: 'card_denia',
  name: 'Denia',
  looks: [
    {
      id: 'denia-main',
      isDefault: true,
      tags: [],
      referenceSlots: [
        {
          id: 'slot-1',
          role: 'identity',
          url: 'https://cdn.test/denia.png',
          isPrimary: true,
        },
      ],
    },
  ],
  persona: { speech: '' },
}
/** 每例都从「接口回来的」那一份起步：角色卡只有 Denia，记忆与名单都是空的。 */
function stubLists() {
  window.localStorage.clear()
  api.listCharacterCardsAPI.mockResolvedValue({ success: true, data: [DENIA] })
  api.listAssistantMemoriesAPI.mockResolvedValue({ success: true, data: [] })
  api.listProjectRulesAPI.mockResolvedValue({ success: true, data: [] })
}

import { AssistantSettingsDialog } from '@/features/assistant/components/operator/AssistantSettingsDialog'
import { AssistantSettings } from './AssistantSettings'

// jsdom 没有 scrollIntoView（展开「高级」时会平滑滚一下）。
Element.prototype.scrollIntoView = vi.fn()

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
    stubLists()
    api.updateAssistantPersonaAPI.mockImplementation(
      async (input: Record<string, unknown>) => ({
        success: true,
        data: { ...PERSONA, ...input },
      }),
    )
  })

  it('三档人设已删：设置页上没有那一排', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')
    expect(screen.queryByTestId('assistant-archetypes')).toBeNull()
  })

  it('换语气当场存', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')
    openAdvanced()

    fireEvent.click(screen.getByRole('radio', { name: 'tone.professional' }))

    await waitFor(() =>
      expect(lastSaved()).toMatchObject({
        tone: 'professional',
        toneFromCharacter: false,
      }),
    )
  })

  it('改回复长度当场存', async () => {
    renderSettings()
    await screen.findByDisplayValue('达妮娅')
    openAdvanced()

    fireEvent.click(screen.getByRole('radio', { name: 'length.detailed' }))

    await waitFor(() =>
      expect(lastSaved()).toMatchObject({ verbosity: 'detailed' }),
    )
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

  it('头像菜单只留一个默认预设，选中后保留角色和上传图片', async () => {
    renderSettings({
      ...PERSONA,
      characterCardId: DENIA.id,
      character: {
        id: DENIA.id,
        name: DENIA.name,
        faceUrl: 'https://cdn.test/denia.png',
        hasSpeech: false,
        hasProfile: false,
      },
      avatarChoice: 'character',
      avatarUrl: 'https://cdn.test/denia.png',
      uploadedAvatarUrl: 'https://cdn.test/upload.png',
    })
    await screen.findByDisplayValue('达妮娅')

    fireEvent.pointerDown(screen.getByTestId('assistant-avatar-button'), {
      button: 0,
      ctrlKey: false,
    })
    const defaultAvatar = await screen.findByRole('menuitemradio', {
      name: 'avatar.mark',
    })
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    expect(
      screen.getByRole('menuitemradio', { name: 'avatar.character|Denia' }),
    ).toBeChecked()
    expect(
      screen.getByRole('menuitemradio', { name: 'avatar.upload' }),
    ).toBeInTheDocument()
    expect(defaultAvatar.querySelector('img')).toHaveAttribute(
      'src',
      '/icon.png',
    )
    expect(screen.queryByTestId('assistant-avatar-choice-monogram')).toBeNull()

    fireEvent.click(defaultAvatar)
    await waitFor(() =>
      expect(lastSaved()).toMatchObject({
        avatarChoice: 'mark',
        characterCardId: DENIA.id,
      }),
    )
    expect(lastSaved()).not.toHaveProperty('avatarUrl')
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
        hasProfile: false,
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
    ).toHaveAttribute('aria-disabled', 'true')
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

    openAdvanced()
    fireEvent.click(screen.getByRole('radio', { name: 'length.concise' }))
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
    expect(lastSaved()).toMatchObject({ verbosity: 'concise' })
  })
})

describe('AssistantSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLists()
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

    expect(
      await screen.findByTestId('assistant-memory-new'),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'tabs.memory' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
