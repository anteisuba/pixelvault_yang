import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AI_MODELS, getModelMessageKey } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { PromptAssistantMessage } from '@/types'

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

const sendMock = vi.fn()
const applyPresetMock = vi.fn()
let mockMessages: PromptAssistantMessage[] = []

vi.mock('@/hooks/kernel/use-prompt-assistant', () => ({
  STYLE_SHORTCUTS: {
    imageStyle: 'image-style-shortcut',
    detailed: 'detailed-shortcut',
    artistic: 'artistic-shortcut',
    photorealistic: 'photo-shortcut',
    anime: 'anime-shortcut',
    lora: 'lora-shortcut',
    tags: 'tags-shortcut',
  },
  usePromptAssistant: () => ({
    messages: mockMessages,
    isLoading: false,
    error: null,
    send: sendMock,
    applyPreset: applyPresetMock,
    clear: vi.fn(),
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))
vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn().mockResolvedValue({
    success: true,
    data: { generations: [] },
  }),
}))

import { PromptAssistantPanel } from './PromptAssistantPanel'

beforeEach(() => {
  mockMessages = []
  sendMock.mockClear()
  applyPresetMock.mockClear()
})

describe('PromptAssistantPanel', () => {
  it('uses the model route controlled by the shared assistant header', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        onUsePrompt={vi.fn()}
        assistantRoute={{
          optionId: 'gemini-key',
          apiKeyId: 'key-1',
          adapterType: AI_ADAPTER_TYPES.GEMINI,
        }}
      />,
    )

    fireEvent.click(screen.getByText('starterA'))
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(sendMock.mock.calls[0][1]).toMatchObject({ apiKeyId: 'key-1' })
  })

  it('keeps action presets and drops the style presets (decision 5②)', () => {
    render(<PromptAssistantPanel currentPrompt="" onUsePrompt={vi.fn()} />)

    for (const key of [
      'presetImageStyle',
      'presetDetailed',
      'presetLora',
      'presetTags',
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument()
    }
    for (const key of ['presetArtistic', 'presetPhoto', 'presetAnime']) {
      expect(screen.queryByText(key)).not.toBeInTheDocument()
    }
  })

  it('renders starter examples and prefills before sending', () => {
    render(<PromptAssistantPanel currentPrompt="" onUsePrompt={vi.fn()} />)

    expect(screen.getByText('starterA')).toBeInTheDocument()
    expect(screen.getByText('starterB')).toBeInTheDocument()
    expect(screen.getByText('starterC')).toBeInTheDocument()

    fireEvent.click(screen.getByText('starterA'))
    expect(sendMock).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('placeholder')).toHaveValue('starterA')
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    expect(sendMock).toHaveBeenCalledWith('starterA', expect.any(Object))
  })

  it('shows translated target model label instead of raw model id', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        modelId={AI_MODELS.OPENAI_GPT_IMAGE_2}
        onUsePrompt={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        `${getModelMessageKey(AI_MODELS.OPENAI_GPT_IMAGE_2)}.label`,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(AI_MODELS.OPENAI_GPT_IMAGE_2),
    ).not.toBeInTheDocument()
  })

  it('offers use / append / copy on assistant output', async () => {
    mockMessages = [{ role: 'assistant', content: 'a moody ivory hallway' }]
    const onUsePrompt = vi.fn()
    const onAppendPrompt = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    render(
      <PromptAssistantPanel
        currentPrompt="base prompt"
        onUsePrompt={onUsePrompt}
        onAppendPrompt={onAppendPrompt}
      />,
    )

    fireEvent.click(screen.getByText('usePrompt'))
    expect(onUsePrompt).toHaveBeenCalledWith('a moody ivory hallway')

    fireEvent.click(screen.getByText('appendPrompt'))
    expect(onAppendPrompt).toHaveBeenCalledWith('a moody ivory hallway')

    fireEvent.click(screen.getByText('copyPrompt'))
    expect(writeText).toHaveBeenCalledWith('a moody ivory hallway')
    expect(await screen.findByText('copied')).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('hides the append action when no handler is wired', () => {
    mockMessages = [{ role: 'assistant', content: 'output' }]
    render(<PromptAssistantPanel currentPrompt="" onUsePrompt={vi.fn()} />)

    expect(screen.getByText('usePrompt')).toBeInTheDocument()
    expect(screen.queryByText('appendPrompt')).not.toBeInTheDocument()
  })

  // ── D5/D4 composer 收敛（2026-07-07 dock 重设计）────────────────

  it('keeps research in the shared header instead of duplicating it in the composer', () => {
    render(<PromptAssistantPanel currentPrompt="" onUsePrompt={vi.fn()} />)

    expect(
      screen.queryByRole('button', { name: 'research' }),
    ).not.toBeInTheDocument()
  })

  it('sends the research flag with the message when enabled', () => {
    render(
      <PromptAssistantPanel
        currentPrompt=""
        onUsePrompt={vi.fn()}
        researchEnabled
      />,
    )
    fireEvent.click(screen.getByText('starterA'))
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][1]).toMatchObject({ research: true })
  })

  it('merges the two image buttons into a single popover trigger', () => {
    render(<PromptAssistantPanel currentPrompt="" onUsePrompt={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'addReference' }),
    ).toBeInTheDocument()
    // 旧的独立「选素材」按钮不再存在（selectAsset 只剩 Dialog 标题用途）
    expect(
      screen.queryByRole('button', { name: 'selectAsset' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'addImage' }),
    ).not.toBeInTheDocument()
  })

  it('fills the reference slot from an injected dock drop', () => {
    const { rerender } = render(
      <PromptAssistantPanel
        currentPrompt=""
        onUsePrompt={vi.fn()}
        injectedReference={undefined}
      />,
    )
    expect(screen.queryByAltText('referenceImageAlt')).not.toBeInTheDocument()

    rerender(
      <PromptAssistantPanel
        currentPrompt=""
        onUsePrompt={vi.fn()}
        injectedReference={{ url: 'https://cdn.example.com/ref.png', token: 1 }}
      />,
    )

    expect(screen.getByAltText('referenceImageAlt')).toBeInTheDocument()
  })
})
