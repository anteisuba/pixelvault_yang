import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dispatch = vi.fn()
const mockState = {
  audioSfxDurationSeconds: 5,
  audioSfxLoop: false,
  audioSfxPromptInfluence: 0.3,
}

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: mockState, dispatch }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

import { StudioSfxParams } from './StudioSfxParams'

describe('StudioSfxParams', () => {
  beforeEach(() => dispatch.mockClear())

  it('renders duration, prompt influence, and loop controls', () => {
    render(<StudioSfxParams />)
    expect(screen.getByText('sfxDuration')).toBeInTheDocument()
    expect(screen.getByText('sfxPromptInfluence')).toBeInTheDocument()
    expect(screen.getByText('sfxLoop')).toBeInTheDocument()
  })

  it('toggling loop dispatches SET_AUDIO_SFX_LOOP', () => {
    render(<StudioSfxParams />)
    fireEvent.click(screen.getByRole('switch'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_AUDIO_SFX_LOOP',
      payload: true,
    })
  })
})
