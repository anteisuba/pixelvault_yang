import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  bench: {
    data: null as null | {
      characterCardId: string | null
      voiceCardId: string | null
      lines: { id: string; text: string; url: string }[]
    },
    error: null,
    loading: false,
    pending: [] as { key: string; text: string; status: string }[],
    speak: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
  },
  voice: {
    characterCardId: 'c1' as string | null,
    personaName: '晴',
    voiceCardId: 'v1',
    voiceName: 'Warm',
    bind: vi.fn(),
  },
  rewrite: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/lib/api-client', () => ({
  rewriteVoiceBenchTextAPI: state.rewrite,
}))
vi.mock('@/hooks/use-voice-bench', () => ({
  useVoiceBench: () => state.bench,
}))
vi.mock('@/hooks/use-persona-voice', () => ({
  usePersonaVoice: () => state.voice,
}))
vi.mock('@/hooks/use-assistant-persona', () => ({
  useAssistantPersona: () => ({ persona: { avatarUrl: null } }),
}))
vi.mock('@/hooks/use-operator-voice', () => ({
  useOperatorVoice: () => ({
    modelId: 'fish-audio-s2-pro-free',
    setModel: vi.fn(),
  }),
  usePlayingOperatorVoice: () => null,
  playOperatorVoice: vi.fn(),
  stopOperatorVoice: vi.fn(),
}))
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorAvatarSwitcher',
  () => ({
    AvatarDisc: ({ name }: { name: string }) => <span>{name}</span>,
    StudioOperatorAvatarSwitcher: ({ children }: { children: unknown }) =>
      children,
  }),
)
vi.mock('@/components/business/voices/VoicePickerDialog', () => ({
  VoicePickerDialog: () => null,
}))
vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: () => null,
}))

import { VoiceBench } from './VoiceBench'

beforeEach(() => {
  vi.clearAllMocks()
  state.voice.characterCardId = 'c1'
  state.bench.pending = []
  state.bench.data = {
    characterCardId: 'c1',
    voiceCardId: 'v1',
    lines: [
      {
        id: 'g1',
        text: '[whispering] 嘘，书会被吵醒的。',
        url: 'https://cdn.test/g1.mp3',
      },
    ],
  }
})

describe('VoiceBench（配音台 ③）', () => {
  it('一行一句：句首语气单独摆，▶ 和「放回输入框」各一颗；写一句按回车就念', () => {
    render(<VoiceBench />)
    const row = screen.getByTestId('voice-bench-line')
    expect(row).toHaveTextContent('[whispering]')
    expect(row).toHaveTextContent('嘘，书会被吵醒的。')
    const box = screen.getByRole('textbox', { name: 'placeholder' })
    fireEvent.click(screen.getByRole('button', { name: 'editLine' }))
    expect(box).toHaveValue('[whispering] 嘘，书会被吵醒的。')

    fireEvent.change(box, { target: { value: '欢迎来到图书馆。' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(state.bench.speak).toHaveBeenCalledWith(
      '欢迎来到图书馆。',
      undefined,
    )
  })

  it('按她说：改好的字回到输入框，⛔ 直接念', async () => {
    state.rewrite.mockResolvedValue({
      success: true,
      data: { text: '欢迎光临～这里是图书馆哦。' },
    })
    render(<VoiceBench />)
    const box = screen.getByRole('textbox', { name: 'placeholder' })
    fireEvent.change(box, { target: { value: '欢迎来到图书馆。' } })
    fireEvent.click(screen.getByTestId('voice-bench-rewrite'))
    expect(state.rewrite).toHaveBeenCalledWith({ text: '欢迎来到图书馆。' })
    await waitFor(() => expect(box).toHaveValue('欢迎光临～这里是图书馆哦。'))
    expect(state.bench.speak).not.toHaveBeenCalled()
  })

  it('默认助手：先换个角色，⛔ 输入框', () => {
    state.voice.characterCardId = null
    state.bench.data = { characterCardId: null, voiceCardId: null, lines: [] }
    render(<VoiceBench />)
    expect(screen.getByText('noPersonaTitle')).toBeInTheDocument()
    expect(screen.queryByTestId('voice-bench-composer')).toBeNull()
  })

  it('还在念 / 缺嗓子的那一句就地标出来', () => {
    state.bench.pending = [
      { key: 'p1', text: '在呢', status: 'pending' },
      { key: 'p2', text: '走吧', status: 'unbound' },
    ]
    render(<VoiceBench />)
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'pickVoice' }),
    ).toBeInTheDocument()
  })
})
