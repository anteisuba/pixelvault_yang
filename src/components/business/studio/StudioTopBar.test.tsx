import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioTopBar } from './StudioTopBar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      outputType: 'image',
    },
  }),
}))

vi.mock('@/hooks/use-usage-summary', () => ({
  useUsageSummary: () => ({
    summary: {
      freeGenerationLimit: 10,
      freeGenerationsToday: 2,
    },
  }),
}))

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({
    toggleSidebar: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({
    selectedModel: null,
  }),
}))

vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: () => ({
    selectedModel: null,
  }),
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({
    healthMap: {},
  }),
}))

vi.mock('./StudioAdvancedDrawer', () => ({
  StudioAdvancedDrawer: ({
    open,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => (open ? <div role="dialog">advanced drawer</div> : null),
}))

describe('StudioTopBar', () => {
  it('removes the old image/video/audio and quick/card tablists', () => {
    render(<StudioTopBar />)

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByText('modeImage')).not.toBeInTheDocument()
    expect(screen.queryByText('modeVideo')).not.toBeInTheDocument()
    expect(screen.queryByText('modeAudio')).not.toBeInTheDocument()
  })

  it('opens the advanced drawer from the advanced button', () => {
    render(<StudioTopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'openAriaLabel' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('advanced drawer')
  })
})
