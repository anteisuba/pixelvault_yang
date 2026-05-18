import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FishVoiceLibraryDialog } from './FishVoiceLibraryDialog'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string =>
      key,
}))

vi.mock('./VoiceSelector', () => ({
  VoiceSelector: ({
    className,
    onSelectComplete,
    selectedVoiceId,
    onSelectVoiceId,
  }: {
    className?: string
    onSelectComplete?: () => void
    selectedVoiceId?: string | null
    onSelectVoiceId?: (voiceId: string) => void
  }) => (
    <div data-testid="voice-selector" className={className}>
      <span>selected:{selectedVoiceId ?? 'none'}</span>
      <button type="button" onClick={onSelectComplete}>
        select-voice
      </button>
      <button
        type="button"
        onClick={() => onSelectVoiceId?.('voice-from-dialog')}
      >
        select-voice-id
      </button>
    </div>
  ),
}))

describe('FishVoiceLibraryDialog', () => {
  it('renders the reusable voice library dialog with optional settings panel', () => {
    render(
      <FishVoiceLibraryDialog
        open
        onOpenChange={vi.fn()}
        sidePanel={<div>audio-settings</div>}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('voiceLibraryTitle')).toBeInTheDocument()
    expect(screen.getByText('voiceLibraryDescription')).toBeInTheDocument()
    expect(screen.getByTestId('voice-selector')).toHaveClass('h-full')
    expect(screen.getByText('audio-settings')).toBeInTheDocument()
  })

  it('forwards close and voice selection callbacks', () => {
    const onOpenChange = vi.fn()
    const onVoiceSelectComplete = vi.fn()
    const onSelectVoiceId = vi.fn()
    render(
      <FishVoiceLibraryDialog
        open
        onOpenChange={onOpenChange}
        onVoiceSelectComplete={onVoiceSelectComplete}
        selectedVoiceId="speaker-a"
        onSelectVoiceId={onSelectVoiceId}
      />,
    )

    expect(screen.getByText('selected:speaker-a')).toBeInTheDocument()

    fireEvent.click(screen.getByText('select-voice-id'))
    expect(onSelectVoiceId).toHaveBeenCalledWith('voice-from-dialog')

    fireEvent.click(screen.getByText('select-voice'))
    expect(onVoiceSelectComplete).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'voiceLibraryClose' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
