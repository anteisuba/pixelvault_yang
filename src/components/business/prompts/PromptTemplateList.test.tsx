import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest'

import {
  PromptTemplateList,
  type PromptTemplateListItem,
} from './PromptTemplateList'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

const deleteRecipeMock = vi.fn()
vi.mock('@/lib/api-client/recipes', () => ({
  deleteRecipeAPI: (...args: unknown[]) => deleteRecipeMock(...args),
  getRecipeAPI: vi.fn().mockResolvedValue({ success: true, data: null }),
  listRecipeGenerationsAPI: vi
    .fn()
    .mockResolvedValue({ success: true, data: [] }),
  updateRecipeAPI: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalScrollIntoView = Element.prototype.scrollIntoView

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Element.prototype.scrollIntoView = vi.fn()
})

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView
  vi.unstubAllGlobals()
})

beforeEach(() => {
  deleteRecipeMock.mockReset()
})

function makeItem(
  overrides: Partial<PromptTemplateListItem> = {},
): PromptTemplateListItem {
  return {
    id: 'recipe-1',
    outputType: 'IMAGE',
    outputTypeLabel: 'Image',
    name: 'Sunset portrait',
    compiledPrompt: 'a cinematic sunset portrait',
    modelId: 'flux-2-pro',
    version: 1,
    createdAt: '2026-06-14T00:00:00.000Z',
    ...overrides,
  }
}

describe('PromptTemplateList', () => {
  it('renders the cover image plus title when a template has one', () => {
    render(
      <PromptTemplateList
        locale="en"
        recipes={[
          makeItem({
            coverThumbnailUrl: 'https://cdn.example.com/cover.webp',
          }),
        ]}
      />,
    )

    const cover = document.querySelector(
      'img[src="https://cdn.example.com/cover.webp"]',
    )
    expect(cover).not.toBeNull()
    expect(cover).toHaveClass('object-cover')
    expect(screen.getByText('Sunset portrait')).toBeInTheDocument()
  })

  it('falls back to the prompt text when there is no cover', () => {
    render(
      <PromptTemplateList
        locale="en"
        recipes={[
          makeItem({
            coverThumbnailUrl: null,
            compiledPrompt: 'fallback prompt body',
          }),
        ]}
      />,
    )

    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('fallback prompt body')).toBeInTheDocument()
  })

  it('deletes a template after confirmation and removes its card', async () => {
    deleteRecipeMock.mockResolvedValue({ success: true })
    render(
      <PromptTemplateList
        locale="en"
        recipes={[
          makeItem({ id: 'keep', name: 'Keep me' }),
          makeItem({ id: 'drop', name: 'Delete me' }),
        ]}
      />,
    )

    const triggers = screen.getAllByRole('button', { name: 'deleteAction' })
    expect(triggers).toHaveLength(2)
    fireEvent.click(triggers[1])

    fireEvent.click(
      await screen.findByRole('button', { name: 'deleteConfirmAction' }),
    )

    await waitFor(() => expect(deleteRecipeMock).toHaveBeenCalledWith('drop'))
    await waitFor(() =>
      expect(screen.queryByText('Delete me')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Keep me')).toBeInTheDocument()
  })
})
