import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { ROUTES } from '@/constants/routes'
import type { GenerationRecord, InspirationRecord, RecipeRecord } from '@/types'

import { PromptTemplatePicker } from './PromptTemplatePicker'

const createRecipeMock = vi.hoisted(() => vi.fn())
const pushMock = vi.hoisted(() => vi.fn())
const recipeState = vi.hoisted(() => ({
  recipes: [] as RecipeRecord[],
}))
const inspirationState = vi.hoisted(() => ({
  items: [] as InspirationRecord[],
  setQuery: vi.fn(),
}))
const studioGenState = vi.hoisted(() => ({
  lastGeneration: null as GenerationRecord | null,
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/lib/api-client/recipes', () => ({
  createRecipeAPI: createRecipeMock,
}))

vi.mock('@/hooks/prompts/use-recipes', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    useRecipes: () => {
      const [recipes, setRecipes] = React.useState(recipeState.recipes)
      return {
        recipes,
        isLoading: false,
        addRecipe: (recipe: RecipeRecord) => {
          setRecipes((current) => [
            recipe,
            ...current.filter((item) => item.id !== recipe.id),
          ])
        },
      }
    },
  }
})

vi.mock('@/hooks/prompts/use-inspirations', () => ({
  useInspirations: () => ({
    items: inspirationState.items,
    total: inspirationState.items.length,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    filters: { category: null, query: '', sortBy: 'rank' },
    hasMore: false,
    setCategory: vi.fn(),
    setQuery: inspirationState.setQuery,
    setSortBy: vi.fn(),
    resetFilters: vi.fn(),
    loadMore: vi.fn(),
    cloneInspiration: vi.fn(),
  }),
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioGen: () => ({ lastGeneration: studioGenState.lastGeneration }),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalScrollIntoView = Element.prototype.scrollIntoView

function makeRecipe(overrides: Partial<RecipeRecord> = {}): RecipeRecord {
  return {
    id: 'recipe-1',
    userId: 'user-1',
    outputType: 'IMAGE',
    name: 'Existing template',
    compiledPrompt: 'existing prompt',
    negativePrompt: null,
    modelId: 'model-a',
    provider: 'provider-a',
    params: {},
    referenceAssets: null,
    seed: null,
    parentGenerationId: null,
    version: 1,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    id: 'generation-1',
    createdAt: new Date('2026-06-13T00:00:00.000Z'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: 'https://cdn.example.com/generation.webp',
    storageKey: 'generations/generation-1.webp',
    mimeType: 'image/webp',
    width: 1024,
    height: 1024,
    prompt: 'recent prompt',
    model: 'model-a',
    provider: 'provider-a',
    requestCount: 1,
    isPublic: false,
    isPromptPublic: false,
    ...overrides,
  }
}

function makeInspiration(
  overrides: Partial<InspirationRecord> = {},
): InspirationRecord {
  return {
    id: 'inspiration-1',
    source: 'test',
    rank: 1,
    prompt: 'Long shared prompt with cinematic lighting and a careful subject',
    author: 'author-1',
    authorName: 'Mina',
    likes: 10,
    views: 20,
    imageUrl: '',
    modelHint: null,
    categories: ['portrait'],
    sourceUrl: 'https://example.com/prompt',
    rating: null,
    score: null,
    publishedAt: null,
    isPublic: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Element.prototype.scrollIntoView = vi.fn()
})

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView
  vi.unstubAllGlobals()
})

beforeEach(() => {
  createRecipeMock.mockReset()
  pushMock.mockReset()
  inspirationState.setQuery.mockReset()
  recipeState.recipes = []
  inspirationState.items = []
  studioGenState.lastGeneration = null
})

describe('PromptTemplatePicker', () => {
  it('saves without closing and inserts the new recipe at the top of recent', async () => {
    const existing = makeRecipe({
      id: 'old',
      name: 'Older template',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const saved = makeRecipe({
      id: 'new',
      name: 'Fresh saved template',
      compiledPrompt: 'fresh prompt',
      createdAt: '2026-06-13T00:00:00.000Z',
    })
    recipeState.recipes = [existing]
    createRecipeMock.mockResolvedValue({ success: true, data: saved })

    render(
      <PromptTemplatePicker
        currentModelId="model-a"
        currentProvider="provider-a"
        currentPrompt="fresh prompt"
        onApply={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'templatePicker' }))

    const saveButton = await screen.findByRole('button', {
      name: 'saveCurrentPrompt',
    })
    expect(screen.getByRole('dialog')).toHaveClass('rounded-2xl')
    expect(saveButton).toHaveClass(
      'min-h-11',
      'bg-muted/65',
      'border-border/40',
      'rounded-full',
    )

    fireEvent.click(saveButton)

    await waitFor(() => expect(createRecipeMock).toHaveBeenCalledTimes(1))
    expect(
      screen.getByRole('heading', { name: 'templatePickerTitle' }),
    ).toBeInTheDocument()

    const fresh = await screen.findByText('Fresh saved template')
    const old = screen.getByText('Older template')
    expect(
      fresh.compareDocumentPosition(old) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('links the most recent generation as the cover source when saving', async () => {
    studioGenState.lastGeneration = makeGeneration({
      id: 'gen-recent',
      thumbnailUrl: 'https://cdn.example.com/gen-recent.thumb.webp',
    })
    createRecipeMock.mockResolvedValue({
      success: true,
      data: makeRecipe({
        id: 'saved',
        name: 'Saved from generation',
        parentGenerationId: 'gen-recent',
      }),
    })

    render(
      <PromptTemplatePicker
        currentModelId="model-a"
        currentProvider="provider-a"
        currentPrompt="fresh prompt"
        onApply={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'templatePicker' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'saveCurrentPrompt' }),
    )

    await waitFor(() => expect(createRecipeMock).toHaveBeenCalledTimes(1))
    expect(createRecipeMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentGenerationId: 'gen-recent' }),
    )
    // Optimistically-inserted row shows the linked generation's cover at once,
    // without waiting for a listRecipes refetch.
    await screen.findByText('Saved from generation')
    expect(
      document.querySelector(
        'img[src="https://cdn.example.com/gen-recent.thumb.webp"]',
      ),
    ).not.toBeNull()
  })

  it('omits parentGenerationId when there is no recent generation', async () => {
    studioGenState.lastGeneration = null
    createRecipeMock.mockResolvedValue({
      success: true,
      data: makeRecipe({ id: 'saved' }),
    })

    render(
      <PromptTemplatePicker
        currentModelId="model-a"
        currentProvider="provider-a"
        currentPrompt="fresh prompt"
        onApply={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'templatePicker' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'saveCurrentPrompt' }),
    )

    await waitFor(() => expect(createRecipeMock).toHaveBeenCalledTimes(1))
    expect(createRecipeMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ parentGenerationId: expect.any(String) }),
    )
  })

  it('routes to the prompt library from the footer action', () => {
    render(<PromptTemplatePicker onApply={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'templatePicker' }))
    fireEvent.click(screen.getByRole('button', { name: 'manageInPrompts' }))

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PROMPTS)
  })

  it('renders recipe covers and keeps the FileText fallback for text-only templates', async () => {
    recipeState.recipes = [
      makeRecipe({
        id: 'with-cover',
        name: 'Image-backed template',
        modelId: 'flux-2-pro',
        parentGenerationId: 'gen-1',
        coverThumbnailUrl: 'https://cdn.example.com/gen.thumbnail.webp',
        createdAt: '2026-06-13T00:00:00.000Z',
      }),
      makeRecipe({
        id: 'without-cover',
        name: 'Text-only template',
        modelId: 'custom-model',
        coverThumbnailUrl: null,
        createdAt: '2026-06-12T00:00:00.000Z',
      }),
    ]

    render(<PromptTemplatePicker onApply={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'templatePicker' }))

    await screen.findByText('Image-backed template')
    const cover = document.querySelector(
      'img[src="https://cdn.example.com/gen.thumbnail.webp"]',
    )
    expect(cover).toHaveClass('size-9', 'rounded-md', 'object-cover')
    // Hover-lift + motion-token polish (canon: duration-fast / ease-standard).
    expect(cover).toHaveClass(
      'ring-1',
      'ring-inset',
      'duration-fast',
      'ease-standard',
      'group-hover:brightness-110',
    )
    expect(screen.getByText('flux2Pro.label')).toBeInTheDocument()

    const textOnlyRow = screen
      .getByText('Text-only template')
      .closest('[cmdk-item]')
    expect(textOnlyRow?.querySelector('img')).toBeNull()
    const fallbackIcon = textOnlyRow?.querySelector('.lucide-file-text')
    expect(fallbackIcon).not.toBeNull()
    // Fallback shares the rounded-md image-driven shape (not the old circle).
    expect(fallbackIcon?.parentElement).toHaveClass(
      'size-9',
      'rounded-md',
      'ring-1',
    )
    expect(screen.getByText('custom-model')).toBeInTheDocument()
  })

  it('keeps inspiration prompts clamped and removes the external link affordance', async () => {
    inspirationState.items = [makeInspiration()]

    const { container } = render(
      <PromptTemplatePicker onApply={vi.fn()} onApplyInspiration={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'templatePicker' }))
    const inspirationTab = await screen.findByRole('tab', {
      name: /tabInspiration/,
    })
    await act(async () => {
      inspirationTab.focus()
      fireEvent.keyDown(inspirationTab, { key: 'Enter', code: 'Enter' })
      fireEvent.click(inspirationTab)
    })
    await waitFor(() =>
      expect(inspirationTab).toHaveAttribute('aria-selected', 'true'),
    )

    expect(
      await screen.findByText(
        'Long shared prompt with cinematic lighting and a careful subject',
      ),
    ).toHaveClass('line-clamp-2')
    expect(container.querySelector('.lucide-external-link')).toBeNull()
  })
})
