import { act, render, screen } from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { DURATION_MS } from '@/constants/motion'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('motion/react', () => ({ useReducedMotion: () => false }))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: { prompt: '1girl, solo' } }),
  useStudioGen: () => ({ isGenerating: false }),
}))
vi.mock('@/hooks/use-novelai-characters', () => ({
  useNovelAiCharacters: () => ({ mode: null }),
}))
vi.mock('@/components/business/studio-shared/chrome/StudioCanvas', () => ({
  StudioCanvas: () => <div data-testid="results" />,
}))
vi.mock(
  '@/components/business/studio-shared/chrome/StudioWorkbenchLayout',
  () => ({
    StudioWorkbenchLayout: () => null,
  }),
)
vi.mock('./StudioTagsPromptArea', () => ({ StudioTagsPromptArea: () => null }))
vi.mock('./StudioDanbooruPanel', () => ({ StudioDanbooruPanel: () => null }))
vi.mock('./StudioTagBlocks', () => ({ StudioTagBlocks: () => null }))
vi.mock('./NovelAiCharacterComposer', () => ({
  NovelAiCharacterComposer: () => null,
}))

import { StudioTagsStage } from './StudioTagsWorkbench'

describe('标签台舞台面板', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /**
   * 换场是「结果先淡出一拍，面板再上来」：标题要在**挂上时**落焦点，⛔ 在
   * `panel` 一变就去找（那一拍它还没挂上，焦点就留在触发键上了）。
   */
  it('面板晚一拍挂上，标题照样拿到焦点', () => {
    const { rerender } = render(
      <StudioTagsStage panel={null} onClose={vi.fn()} />,
    )
    rerender(<StudioTagsStage panel="catalog" onClose={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: 'catalog' })).toBeNull()
    act(() => {
      vi.advanceTimersByTime(DURATION_MS.fast)
    })
    expect(screen.getByRole('heading', { name: 'catalog' })).toHaveFocus()

    // 面板之间直接切：新那块的标题接过焦点。
    rerender(<StudioTagsStage panel="blocks" onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'blocks' })).toHaveFocus()
  })
})
