import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { InspirationRecord } from '@/types'

import { InspirationCard } from './InspirationCard'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/components/business/MediaDetailViewer', () => ({
  MediaDetailViewer: ({ description }: { description: string }) => (
    <div data-testid="detail-viewer">{description}</div>
  ),
  toMediaTransitionOrigin: () => null,
}))

function makeInspiration(
  overrides: Partial<InspirationRecord> = {},
): InspirationRecord {
  return {
    id: 'insp-1',
    source: 'community',
    rank: 1,
    prompt: 'a hyper detailed cathedral made of glass',
    author: 'https://example.com/author',
    authorName: 'mika',
    likes: 1200,
    views: 5400,
    imageUrl: 'https://cdn.example.com/insp.webp',
    modelHint: null,
    categories: ['Photography'],
    sourceUrl: 'https://example.com/post/1',
    rating: null,
    score: null,
    publishedAt: null,
    isPublic: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('InspirationCard', () => {
  it('keeps the prompt off the card preview — only the detail viewer gets it', () => {
    render(
      <InspirationCard
        inspiration={makeInspiration()}
        onClone={vi.fn().mockResolvedValue({ success: true })}
      />,
    )

    const article = document.querySelector('article')
    expect(article).not.toBeNull()
    expect(article?.textContent).not.toContain(
      'a hyper detailed cathedral made of glass',
    )
    // Prompt lives in the detail viewer (dialog), not the card itself.
    expect(screen.getByTestId('detail-viewer')).toHaveTextContent(
      'a hyper detailed cathedral made of glass',
    )
  })

  it('still shows author, categories and the clone action', async () => {
    const onClone = vi
      .fn()
      .mockResolvedValue({ success: true, recipe: { id: 'r1' } })
    render(
      <InspirationCard inspiration={makeInspiration()} onClone={onClone} />,
    )

    expect(screen.getByText('@mika')).toBeInTheDocument()
    expect(screen.getByText('Photography')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'inspirationClone' }))
    await waitFor(() => expect(onClone).toHaveBeenCalledWith('insp-1'))
  })
})
