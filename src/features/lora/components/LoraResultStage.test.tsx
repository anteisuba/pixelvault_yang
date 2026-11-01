import { fireEvent, render, screen } from '@testing-library/react'
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
    round: [
      { id: 'b', url: 'https://cdn.example/b.png' },
      { id: 'a', url: 'https://cdn.example/a.png' },
    ],
    generating: false,
    isCompleting: false,
    completionReleased: false,
    onEdgeRelease: vi.fn(),
    onCompleteAnimationDone: vi.fn(),
    elapsedSeconds: 0,
    stageLabel: '',
    failure: null,
    onOpen: vi.fn(),
    onAskAssistant: vi.fn(),
    templateSaveFor: () => undefined,
    hint: 'hint',
    eta: null,
    ...overrides,
  }
}

describe('LoraResultStage（摆法 B：这一轮正中，之前的缩成一条）', () => {
  it('puts the newest on stage and the rest in the strip; the stage opens the big view', () => {
    const onOpen = vi.fn()
    render(<LoraResultStage {...props({ onOpen })} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'generate.resultPreviewLabel' }),
    )
    expect(onOpen).toHaveBeenCalledWith('b')
  })

  it('swaps a strip thumbnail onto the stage', () => {
    const onOpen = vi.fn()
    render(<LoraResultStage {...props({ onOpen })} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'generate.resultShowLabel' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'generate.resultPreviewLabel' }),
    )
    expect(onOpen).toHaveBeenCalledWith('a')
  })

  it('a new result takes the stage back from a picked thumbnail', () => {
    const onOpen = vi.fn()
    const { rerender } = render(<LoraResultStage {...props({ onOpen })} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'generate.resultShowLabel' }),
    )
    rerender(
      <LoraResultStage
        {...props({
          onOpen,
          round: [
            { id: 'c', url: 'https://cdn.example/c.png' },
            { id: 'b', url: 'https://cdn.example/b.png' },
            { id: 'a', url: 'https://cdn.example/a.png' },
          ],
        })}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'generate.resultPreviewLabel' }),
    )
    expect(onOpen).toHaveBeenCalledWith('c')
  })

  it('hands the stage image to the assistant from its hover pill', () => {
    const onAskAssistant = vi.fn()
    render(<LoraResultStage {...props({ onAskAssistant })} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'generate.handToAssistant' }),
    )
    expect(onAskAssistant).toHaveBeenCalledWith('https://cdn.example/b.png')
  })

  it('puts the in-flight run on stage and all earlier results in the strip', () => {
    render(<LoraResultStage {...props({ generating: true })} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('finishes on the newest image itself instead of a separate tile', () => {
    render(
      <LoraResultStage {...props({ generating: true, isCompleting: true })} />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('says the one-line hint when nothing has been made yet', () => {
    render(<LoraResultStage {...props({ round: [] })} />)
    expect(screen.getByText('hint')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
