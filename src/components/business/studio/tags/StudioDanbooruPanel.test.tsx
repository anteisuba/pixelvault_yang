import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { DanbooruCatalog } from '@/types/danbooru-catalog'
const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  setLayout: vi.fn(),
  update: vi.fn(),
  retry: vi.fn(),
  data: undefined as DanbooruCatalog | undefined,
  error: false,
  loading: false,
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { tagPromptBlocks: [] },
    dispatch: mocks.dispatch,
  }),
  useStudioGen: () => ({ isGenerating: false }),
}))
vi.mock('@/hooks/use-novelai-characters', () => ({
  useNovelAiCharacters: () => ({
    mode: 'free',
    max: 22,
    characters: [],
    setLayout: mocks.setLayout,
    update: mocks.update,
  }),
}))
vi.mock('@/hooks/use-danbooru-catalog', () => ({
  useDanbooruCatalog: () => mocks,
}))
import { StudioDanbooruPanel } from './StudioDanbooruPanel'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.error = false
  mocks.loading = false
  mocks.data = undefined
})
describe('Danbooru selection', () => {
  it('does not apply tags until explicitly selected and confirmed', () => {
    mocks.data = {
      candidates: [],
      detail: {
        tag: 'denia_(wuthering_waves)',
        aliases: ['达妮娅'],
        sampleSize: 2,
        traits: [{ tag: 'pink_hair', count: 2 }],
        images: [],
      },
    }
    render(<StudioDanbooruPanel />)
    expect(screen.getByRole('button', { name: 'applySelected' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /pink hair/ }))
    fireEvent.click(screen.getByRole('button', { name: 'applySelected' }))
    expect(mocks.setLayout).toHaveBeenCalledWith({
      positioning: 'auto',
      characters: [
        {
          prompt: 'pink hair',
          negativePrompt: '',
          position: { x: 0.5, y: 0.5 },
        },
      ],
    })
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it('reports an unavailable source separately from an empty search and offers retry', () => {
    mocks.error = true
    render(<StudioDanbooruPanel />)
    expect(screen.getByRole('alert')).toHaveTextContent('error')
    expect(screen.queryByText('empty')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(mocks.retry).toHaveBeenCalledOnce()
  })
  it('clears selected tags when the search changes', () => {
    mocks.data = {
      candidates: [],
      detail: {
        tag: 'denia',
        aliases: [],
        sampleSize: 0,
        traits: [],
        images: [],
      },
    }
    render(<StudioDanbooruPanel />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'denia' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'search' }), {
      target: { value: 'another' },
    })
    expect(screen.getByRole('button', { name: 'applySelected' })).toBeDisabled()
  })
})
