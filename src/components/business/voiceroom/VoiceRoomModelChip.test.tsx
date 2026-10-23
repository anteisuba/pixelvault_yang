import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VoiceRoomModelChip } from './VoiceRoomModelChip'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptionsFor: () => ({
    modelOptions: [
      { optionId: 'workspace:fish-audio-s2-pro', modelId: 'fish-audio-s2-pro' },
      { optionId: 'key:k1', modelId: 'fish-audio-s2-pro-free' },
    ],
  }),
}))
vi.mock('@/components/business/studio-shared/pickers', () => ({
  ModelPickerPopover: ({ value }: { value: string | null }) => (
    <span data-testid="picker">{value}</span>
  ),
}))

describe('VoiceRoomModelChip (10-23)', () => {
  it('maps the saved model id onto the picker option', () => {
    render(
      <VoiceRoomModelChip value="fish-audio-s2-pro-free" onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('picker')).toHaveTextContent('key:k1')
  })

  it('shows the first option when nothing is picked yet', () => {
    render(<VoiceRoomModelChip value={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('picker')).toHaveTextContent(
      'workspace:fish-audio-s2-pro',
    )
  })
})
