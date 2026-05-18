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
  }: {
    className?: string
    onSelectComplete?: () => void
  }) => (
    <div data-testid="voice-selector" className={className}>
      <button type="button" onClick={onSelectComplete}>
        select-voice
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
    render(
      <FishVoiceLibraryDialog
        open
        onOpenChange={onOpenChange}
        onVoiceSelectComplete={onVoiceSelectComplete}
      />,
    )

    fireEvent.click(screen.getByText('select-voice'))
    expect(onVoiceSelectComplete).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'voiceLibraryClose' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
