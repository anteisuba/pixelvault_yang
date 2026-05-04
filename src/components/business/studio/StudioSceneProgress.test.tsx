import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VideoScriptSceneStatus } from '@/lib/generated/prisma/enums'
import type { SceneOrchestratorStatus } from '@/types/video-script'

import { StudioSceneProgress } from './StudioSceneProgress'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function makeStatus(
  overrides?: Partial<SceneOrchestratorStatus>,
): SceneOrchestratorStatus {
  return {
    scriptId: 'script-1',
    scriptStatus: 'GENERATING',
    progress: 50,
    scenes: [
      {
        index: 0,
        action: 'A character enters the workshop',
        status: VideoScriptSceneStatus.CLIP_READY,
        hasFrame: false,
        hasClip: true,
        retryCount: 0,
        errorMessage: null,
      },
      {
        index: 1,
        action: 'The camera follows the character',
        status: VideoScriptSceneStatus.PENDING,
        hasFrame: false,
        hasClip: false,
        retryCount: 0,
        errorMessage: null,
      },
    ],
    ...overrides,
  }
}

describe('StudioSceneProgress', () => {
  it('renders progress and scene statuses', () => {
    render(
      <StudioSceneProgress
        status={makeStatus()}
        onAdvance={vi.fn()}
        onRetryScene={vi.fn()}
      />,
    )

    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(
      screen.getByText('A character enters the workshop'),
    ).toBeInTheDocument()
    expect(screen.getByText('clipReady')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows retry for failed scenes and calls onRetryScene', () => {
    const onRetryScene = vi.fn()
    render(
      <StudioSceneProgress
        status={makeStatus({
          scenes: [
            {
              index: 2,
              action: 'The scene fails on provider side',
              status: VideoScriptSceneStatus.FAILED,
              hasFrame: false,
              hasClip: false,
              retryCount: 1,
              errorMessage: 'Provider failed',
            },
          ],
        })}
        onAdvance={vi.fn()}
        onRetryScene={onRetryScene}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(screen.getByText('Provider failed')).toBeInTheDocument()
    expect(onRetryScene).toHaveBeenCalledWith(2)
  })

  it('disables advance when all scenes are complete', () => {
    render(
      <StudioSceneProgress
        status={makeStatus({
          progress: 100,
          scriptStatus: 'COMPLETED',
          scenes: [
            {
              index: 0,
              action: 'Finished scene',
              status: VideoScriptSceneStatus.CLIP_READY,
              hasFrame: false,
              hasClip: true,
              retryCount: 0,
              errorMessage: null,
            },
          ],
        })}
        onAdvance={vi.fn()}
        onRetryScene={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /complete/i })).toBeDisabled()
  })
})
