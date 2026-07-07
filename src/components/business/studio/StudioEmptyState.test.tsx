import type { ReactNode } from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_GUIDE_SEEN_STORAGE_KEY } from '@/constants/studio'
import type { GenerationRecord } from '@/types'

import { StudioEmptyState } from './StudioEmptyState'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const dispatchMock = vi.fn()
let historyMock: GenerationRecord[] = []

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { audioKind: 'speech' },
    dispatch: dispatchMock,
  }),
  useStudioData: () => ({ projects: { history: historyMock } }),
}))

const focusMock = vi.fn()
vi.mock('@/lib/focus-studio-prompt', () => ({
  focusStudioPrompt: () => focusMock(),
}))

vi.mock('@/components/business/studio-shared/XiaoheiGuideCarousel', () => ({
  XiaoheiGuideCarousel: ({ guideId }: { guideId: string }) => (
    <div data-testid="guide-carousel" data-guide={guideId} />
  ),
}))

vi.mock('@/components/ui/optimized-image', () => ({
  OptimizedImage: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/components/ui/responsive-dialog', () => ({
  ResponsiveDialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
  }) =>
    open ? (
      <div data-testid="guide-dialog">
        <button
          type="button"
          data-testid="guide-dialog-close"
          onClick={() => onOpenChange(false)}
        />
        {children}
      </div>
    ) : null,
  ResponsiveDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  ),
}))

function makeGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    id: 'gen-1',
    outputType: 'IMAGE',
    url: 'https://cdn.example.com/gen-1.webp',
    prompt: 'a prompt',
    ...overrides,
  } as GenerationRecord
}

beforeEach(() => {
  vi.clearAllMocks()
  historyMock = []
  localStorage.clear()
})

describe('StudioEmptyState', () => {
  it('renders the hint and fills prompt + focuses on example chip click', () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    render(<StudioEmptyState mode="image" />)

    expect(screen.getByText('hint.image')).toBeInTheDocument()
    expect(screen.getByText('modeLabel.image')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'examples.image.e1.label' }),
    )
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_PROMPT',
      payload: 'examples.image.e1.prompt',
    })
    expect(focusMock).toHaveBeenCalled()
  })

  it('shows recent tiles filtered by mode, capped at 6, remixing on click', () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    const onRemix = vi.fn()
    historyMock = [
      makeGeneration({ id: 'img-1' }),
      makeGeneration({ id: 'vid-1', outputType: 'VIDEO' }),
      ...Array.from({ length: 7 }, (_, i) =>
        makeGeneration({ id: `img-${i + 2}` }),
      ),
    ]
    render(<StudioEmptyState mode="image" onRemix={onRemix} />)

    const tiles = screen.getAllByRole('button', { name: /recentRemixHint/ })
    expect(tiles).toHaveLength(6)

    fireEvent.click(tiles[0])
    expect(onRemix).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'img-1' }),
    )
  })

  it('hides the recent row when no history matches the mode', () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    historyMock = [makeGeneration({ id: 'vid-1', outputType: 'VIDEO' })]
    render(<StudioEmptyState mode="image" />)

    expect(screen.queryByText('recentLabel')).not.toBeInTheDocument()
  })

  it('auto-opens the guide on first visit; closing records the seen flag', () => {
    render(<StudioEmptyState mode="image" />)

    expect(screen.getByTestId('guide-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('guide-carousel')).toHaveAttribute(
      'data-guide',
      'image',
    )
    // 标记在用户关闭教程时才写，避免"弹过但没看"的用户永远错过。
    expect(localStorage.getItem(STUDIO_GUIDE_SEEN_STORAGE_KEY)).toBeNull()

    fireEvent.click(screen.getByTestId('guide-dialog-close'))
    expect(screen.queryByTestId('guide-dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(STUDIO_GUIDE_SEEN_STORAGE_KEY)).toBe('1')
  })

  it('does not auto-open once seen; the manual entry still opens it', () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    render(<StudioEmptyState mode="image" />)

    expect(screen.queryByTestId('guide-dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /guideButton/ }))
    expect(screen.getByTestId('guide-dialog')).toBeInTheDocument()
  })
})
