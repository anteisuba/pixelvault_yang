import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CanvasTopBar } from './CanvasTopBar'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}))

describe('CanvasTopBar', () => {
  it('does not expose a global default-video-model control', () => {
    render(
      <CanvasTopBar
        nodeCount={3}
        projectName="Storyboard"
        projects={[]}
        currentProjectId=""
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onSwitchProject={vi.fn()}
      />,
    )

    expect(screen.queryByText('topbar.defaultModel')).not.toBeInTheDocument()
  })
})
