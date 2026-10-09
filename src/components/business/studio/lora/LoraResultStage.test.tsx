import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LoraResultStage } from './LoraResultStage'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/studio-shared', () => ({
  StudioGeneratingProgress: () => <div role="progressbar" />,
}))

function props(
  overrides: Partial<ComponentProps<typeof LoraResultStage>> = {},
): ComponentProps<typeof LoraResultStage> {
  return {
    resultUrl: 'https://cdn.example/a.png',
    resultRatio: 1,
    pendingRatio: 1,
    generating: false,
    isCompleting: false,
    completionReleased: false,
    onEdgeRelease: vi.fn(),
    onCompleteAnimationDone: vi.fn(),
    elapsedSeconds: 0,
    stageLabel: '',
    failure: null,
    onOpenPreview: vi.fn(),
    onAskAssistant: vi.fn(),
    hint: 'hint',
    round: [],
    selectedId: null,
    onSelect: vi.fn(),
    meta: null,
    eta: null,
    ...overrides,
  }
}

const image = (container: HTMLElement) =>
  container.querySelector('img[data-result-arrival]') as HTMLElement

describe('LoraResultStage — 新图由糊变清（RESULT_REVEAL）', () => {
  it('does not replay the reveal for the image that is already there on mount', () => {
    const { container } = render(<LoraResultStage {...props()} />)
    expect(image(container)).toHaveAttribute('data-result-arrival', 'none')
  })

  it('blurs a picked round image in instead of swapping it directly', () => {
    const { container, rerender } = render(<LoraResultStage {...props()} />)
    rerender(
      <LoraResultStage
        {...props({ resultUrl: 'https://cdn.example/b.png' })}
      />,
    )
    expect(image(container)).toHaveAttribute('data-result-arrival', 'swap')
    expect(image(container)).toHaveAttribute('src', 'https://cdn.example/b.png')
  })

  it('holds a freshly generated image under the veil until the line lets go', () => {
    const { container, rerender } = render(
      <LoraResultStage {...props({ generating: true })} />,
    )
    rerender(
      <LoraResultStage
        {...props({
          resultUrl: 'https://cdn.example/new.png',
          generating: true,
          isCompleting: true,
        })}
      />,
    )
    expect(image(container)).toHaveAttribute('data-result-arrival', 'hold')
  })
})
