import type { ReactNode } from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PromptTemplateListItem } from './PromptTemplateList'
import { PromptLibraryDesk } from './PromptLibraryDesk'

/** 提示词库桌面（ui-spec §9）：左栏全部 / 收藏、切换条、收藏落库。 */

vi.mock('next-intl', () => {
  const t = Object.assign(
    (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    { rich: (key: string) => key },
  )
  return { useTranslations: () => t }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/prompt-tag-search', () => ({ searchPromptTags: () => [] }))
vi.mock('@/lib/api-client/novelai-tags', () => ({
  getNovelAiTagSuggestionsAPI: vi.fn(),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const mockSetFavorite = vi.fn()
vi.mock('@/lib/api-client/recipes', () => ({
  setRecipeFavoriteAPI: (...args: unknown[]) => mockSetFavorite(...args),
  markRecipeUsedAPI: vi.fn(),
  createRecipeAPI: vi.fn(),
}))

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

beforeEach(() => {
  vi.clearAllMocks()
  mockSetFavorite.mockResolvedValue({ success: true })
})

function item(
  overrides: Partial<PromptTemplateListItem>,
): PromptTemplateListItem {
  return {
    id: 'r1',
    outputType: 'IMAGE',
    name: '海边堤岸',
    compiledPrompt: 'a seaside embankment at dusk',
    modelId: 'flux-2-pro',
    version: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    templateKind: 'IMAGE',
    tagSource: null,
    lora: null,
    lastUsedAt: null,
    isFavorite: false,
    ...overrides,
  }
}

const RECIPES = [
  item({ id: 'r1', name: '海边堤岸', isFavorite: true }),
  item({
    id: 'r2',
    name: '三视图',
    compiledPrompt: '1girl, standing, white background',
    templateKind: 'TAGS',
    tagSource: 'tags',
  }),
  item({
    id: 'r3',
    name: '雨夜推镜',
    outputType: 'VIDEO',
    templateKind: 'VIDEO',
  }),
]

describe('PromptLibraryDesk', () => {
  it('shows the rail counts and every template on 全部', () => {
    render(<PromptLibraryDesk locale="zh" recipes={RECIPES} />)
    const rail = screen.getByRole('navigation', { name: 'pageTitle' })
    expect(
      within(rail).getByRole('button', { name: /typeFilterAll/ }),
    ).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('海边堤岸')).toBeInTheDocument()
    expect(screen.getByText('三视图')).toBeInTheDocument()
    expect(screen.getByText('library.metaTags:{"count":3}')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'library.new' }),
    ).toBeInTheDocument()
  })

  it('only lists favorites on 收藏', () => {
    render(<PromptLibraryDesk locale="zh" recipes={RECIPES} />)
    const rail = screen.getByRole('navigation', { name: 'pageTitle' })
    fireEvent.click(
      within(rail).getByRole('button', { name: /library\.favorites/ }),
    )
    expect(screen.getByText('海边堤岸')).toBeInTheDocument()
    expect(screen.queryByText('三视图')).not.toBeInTheDocument()
  })

  it('saves a favorite through the API', async () => {
    render(<PromptLibraryDesk locale="zh" recipes={RECIPES} />)
    fireEvent.click(
      screen.getAllByRole('button', { name: 'library.favorite' })[0],
    )
    await waitFor(() =>
      expect(mockSetFavorite).toHaveBeenCalledWith('r2', true),
    )
  })
})
