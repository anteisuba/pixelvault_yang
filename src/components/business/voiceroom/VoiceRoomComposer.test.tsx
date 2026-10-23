import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { VoiceRoomCastMember } from '@/types/voiceroom'

import { VoiceRoomComposer } from './VoiceRoomComposer'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))
vi.mock('@/hooks/use-model-channel-gate', () => ({
  useModelChannelGate: () => ({ blocked: false, requestPick: vi.fn() }),
}))
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorModelChip',
  () => ({
    StudioOperatorModelChip: ({ value }: { value: string }) => (
      <span data-testid="llm-chip">{value}</span>
    ),
  }),
)
vi.mock('./VoiceRoomDelivery', () => ({ VoiceRoomDelivery: () => null }))

const CAST: VoiceRoomCastMember[] = [
  { id: 'voice-1', kind: 'voice', name: '爱弥斯', coverImage: null },
  { id: 'voice-2', kind: 'voice', name: '晴', coverImage: null },
  { id: 'builtin:sfx', kind: 'sfx', name: '音效', coverImage: null },
]

function setup(selectedId: string, mode: 'chat' | 'read' = 'chat') {
  const props = {
    onSelect: vi.fn(),
    onRemove: vi.fn(),
  }
  render(
    <VoiceRoomComposer
      cast={CAST}
      selectedId={selectedId}
      sending={false}
      delivery={{ pace: 'normal', expressiveness: 'auto', modelId: null }}
      onDeliveryChange={vi.fn()}
      mode={mode}
      onModeChange={vi.fn()}
      llmModel="auto"
      onLlmModelChange={vi.fn()}
      onOpenCasting={vi.fn()}
      onSubmit={vi.fn(async () => true)}
      {...props}
    />,
  )
  return props
}

describe('VoiceRoomComposer (owner 10-23)', () => {
  it('removes the selected voice from the room through its menu', async () => {
    const { onRemove, onSelect } = setup('voice-1')

    // 点没选中的那位只是换人，不弹菜单。
    fireEvent.click(screen.getByRole('button', { name: '晴' }))
    expect(onSelect).toHaveBeenCalledWith('voice-2')

    fireEvent.pointerDown(screen.getByRole('button', { name: '爱弥斯' }), {
      button: 0,
      pointerType: 'mouse',
    })
    const item = await waitFor(() =>
      screen.getByRole('menuitem', { name: 'VoiceRoom:removeFromRoom' }),
    )
    fireEvent.click(item)
    expect(onRemove).toHaveBeenCalledWith('voice-1')
  })

  it('shows the writing-model picker only while chatting with a voice', () => {
    setup('voice-1')
    expect(screen.getByTestId('llm-chip')).toHaveTextContent('auto')
  })

  it('hides the writing-model picker for the sound-effects speaker', () => {
    setup('builtin:sfx')
    expect(screen.queryByTestId('llm-chip')).toBeNull()
  })
})
