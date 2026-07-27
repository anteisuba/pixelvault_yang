import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type { RecipeRecord } from '@/types'

import { GenerateComposerTemplatePicker } from './GenerateComposerTemplatePicker'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}))

// This component imports FALLBACK_*_CLASSES from PromptTemplateList.tsx
// (§5.5 零重造 — same no-cover fallback as /prompts), which transitively
// imports PromptTemplateDetailDialog → @/i18n/navigation. Vitest's ESM
// resolver can't load next-intl's real navigation submodule in jsdom
// ("Cannot find module .../next/navigation"), so it needs the same mock
// PromptTemplateList.test.tsx already uses for exactly this import chain.
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/lib/api-client/recipes', () => ({
  deleteRecipeAPI: vi.fn(),
  getRecipeAPI: vi.fn().mockResolvedValue({ success: true, data: null }),
  listRecipeGenerationsAPI: vi
    .fn()
    .mockResolvedValue({ success: true, data: [] }),
  updateRecipeAPI: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

// Radix Popover's portal + pointer-events choreography isn't reliable in
// jsdom (same workaround CanvasAppearancePanel.test.tsx uses for
// ResponsivePopover) — always render trigger + content so the test exercises
// this component's own filtering/apply logic, not Radix's open/close.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

// PromptTemplateDetailDialog (also pulled in transitively) mounts a Radix
// dialog that calls these even while closed — same stub as
// PromptTemplateList.test.tsx.
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

const recipesState: { recipes: RecipeRecord[]; isLoading: boolean } = {
  recipes: [],
  isLoading: false,
}
vi.mock('@/hooks/prompts/use-recipes', () => ({
  useRecipes: () => recipesState,
}))

function makeRecipe(overrides: Partial<RecipeRecord> = {}): RecipeRecord {
  return {
    id: 'recipe-1',
    userId: 'user-1',
    outputType: 'IMAGE',
    name: 'Sunset portrait',
    compiledPrompt: 'a cinematic sunset portrait',
    negativePrompt: null,
    modelId: 'flux-2-pro',
    provider: 'fal',
    parentGenerationId: null,
    coverThumbnailUrl: null,
    version: 1,
    isDeleted: false,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
    usageCount: 0,
    lastUsedAt: null,
    tags: [],
    ...overrides,
  }
}

beforeEach(() => {
  recipesState.recipes = []
  recipesState.isLoading = false
})

describe('GenerateComposerTemplatePicker', () => {
  it('only lists recipes matching the given outputType (§5.5 预筛)', () => {
    recipesState.recipes = [
      makeRecipe({ id: 'img', outputType: 'IMAGE', name: 'Image one' }),
      makeRecipe({ id: 'vid', outputType: 'VIDEO', name: 'Video one' }),
    ]
    render(
      <GenerateComposerTemplatePicker
        outputType="IMAGE"
        promptDraft=""
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText('Image one')).toBeInTheDocument()
    expect(screen.queryByText('Video one')).not.toBeInTheDocument()
  })

  it('filters by search text across name and prompt body', () => {
    recipesState.recipes = [
      makeRecipe({
        id: 'a',
        name: 'Sunset portrait',
        compiledPrompt: 'golden hour',
      }),
      makeRecipe({
        id: 'b',
        name: 'Cyberpunk city',
        compiledPrompt: 'neon rain',
      }),
    ]
    render(
      <GenerateComposerTemplatePicker
        outputType="IMAGE"
        promptDraft=""
        onApply={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('templateSearchPlaceholder'), {
      target: { value: 'cyberpunk' },
    })

    expect(screen.queryByText('Sunset portrait')).not.toBeInTheDocument()
    expect(screen.getByText('Cyberpunk city')).toBeInTheDocument()
  })

  it('"用得最多" filter only shows used recipes, sorted by usageCount desc', () => {
    recipesState.recipes = [
      makeRecipe({ id: 'zero', name: 'Never used', usageCount: 0 }),
      makeRecipe({ id: 'low', name: 'Used a bit', usageCount: 2 }),
      makeRecipe({ id: 'high', name: 'Used a lot', usageCount: 9 }),
    ]
    render(
      <GenerateComposerTemplatePicker
        outputType="IMAGE"
        promptDraft=""
        onApply={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'templateFilterLabel.mostUsed' }),
    )

    expect(screen.queryByText('Never used')).not.toBeInTheDocument()
    expect(screen.getByText('Used a bit')).toBeInTheDocument()
    expect(screen.getByText('Used a lot')).toBeInTheDocument()
  })

  it('applying a template replaces the draft with compiledPrompt text only', () => {
    recipesState.recipes = [
      makeRecipe({
        id: 'a',
        name: 'Sunset portrait',
        compiledPrompt: 'golden hour skyline',
        modelId: 'flux-2-pro',
      }),
    ]
    const onApply = vi.fn()
    render(
      <GenerateComposerTemplatePicker
        outputType="IMAGE"
        promptDraft="old draft text"
        onApply={onApply}
      />,
    )

    fireEvent.click(screen.getByTitle('Sunset portrait'))

    // §5.5 只取 compiledPrompt——不是 recipe 对象、不是 modelId/params。
    expect(onApply).toHaveBeenCalledWith('golden hour skyline')
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('falls back to the modality icon (no <img>) when there is no cover', () => {
    recipesState.recipes = [
      makeRecipe({ id: 'a', name: 'No cover here', coverThumbnailUrl: null }),
    ]
    render(
      <GenerateComposerTemplatePicker
        outputType="IMAGE"
        promptDraft=""
        onApply={vi.fn()}
      />,
    )

    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('No cover here')).toBeInTheDocument()
  })
})
