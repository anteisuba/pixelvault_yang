import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dispatch = vi.fn()
let mockState: { audioKind: string } = { audioKind: 'speech' }

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

import { StudioAudioKindSwitcher } from './StudioAudioKindSwitcher'

describe('StudioAudioKindSwitcher', () => {
  beforeEach(() => {
    dispatch.mockClear()
    mockState = { audioKind: 'speech' }
  })

  it('renders voice and sound-fx options', () => {
    render(<StudioAudioKindSwitcher />)
    expect(screen.getByText('kindSpeech')).toBeInTheDocument()
    expect(screen.getByText('kindSfx')).toBeInTheDocument()
  })

  it('switching to sfx dispatches the kind and a matching model option', () => {
    render(<StudioAudioKindSwitcher />)
    fireEvent.click(screen.getByText('kindSfx'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_AUDIO_KIND',
      payload: 'sfx',
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_OPTION_ID',
      payload: 'workspace:eleven-sfx-v2',
    })
  })
})
