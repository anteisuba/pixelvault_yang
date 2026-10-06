import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
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
const viewport = vi.hoisted(() => ({ phone: false }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.phone }))
vi.mock('@/components/business/studio-shared/chrome/StudioCanvas', () => ({
  StudioCanvas: () => <div data-testid="results" />,
}))
vi.mock('./StudioTagsPromptArea', () => ({
  StudioTagsPromptArea: ({
    onOpenPanel,
  }: {
    onOpenPanel: (panel: string) => void
  }) => <button onClick={() => onOpenPanel('catalog')}>openCatalog</button>,
}))
// 查资料自带头部：宿主只把「挂上就落焦点」的 ref 递给它。
vi.mock('./StudioDanbooruPanel', () => ({
  StudioDanbooruPanel: ({
    headingRef,
    onClose,
  }: {
    headingRef?: import('react').Ref<HTMLHeadingElement>
    onClose: () => void
  }) => (
    <section data-testid="catalog-panel">
      <h2 ref={headingRef} tabIndex={-1}>
        catalog
      </h2>
      <button onClick={onClose}>backToResults</button>
    </section>
  ),
}))
vi.mock('./NovelAiCharacterComposer', () => ({
  NovelAiCharacterComposer: () => null,
}))

import { StudioTagsStage, StudioTagsWorkbench } from './StudioTagsWorkbench'

const renderSlots = ({
  stage,
  composer,
}: {
  stage: ReactNode
  composer: ReactNode
}) => (
  <>
    {stage}
    {composer}
  </>
)

describe('标签台舞台面板', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  beforeEach(() => {
    vi.useFakeTimers()
    viewport.phone = false
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
  })
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
    rerender(<StudioTagsStage panel="composition" onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'composition' })).toHaveFocus()
  })

  /**
   * 手机上整页在滚：面板要整块顶到顶栏下（它的高度正好卡在顶栏与底部生成栏之间），
   * ⛔ 只把标题滚进来 —— 那样钉在面板底部的「加到哪 + 加入」会压在生成栏底下。
   */
  it('手机：打开查资料把整块面板滚到顶，桌面只在看不见时才动', () => {
    viewport.phone = true
    const { rerender } = render(
      <StudioTagsStage panel={null} onClose={vi.fn()} />,
    )
    rerender(<StudioTagsStage panel="catalog" onClose={vi.fn()} />)
    act(() => {
      vi.advanceTimersByTime(DURATION_MS.fast)
    })
    const scroll = vi.mocked(Element.prototype.scrollIntoView)
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
    expect(scroll.mock.contexts.at(-1)).toBe(
      screen.getByTestId('catalog-panel'),
    )
  })

  it('手机：资料入口在底部编辑框，关闭面板回到上方结果', () => {
    viewport.phone = true
    const onPanelChange = vi.fn()
    const { rerender } = render(
      <StudioTagsWorkbench
        panel={null}
        onPanelChange={onPanelChange}
        templates={null}
      >
        {renderSlots}
      </StudioTagsWorkbench>,
    )
    const stage = screen.getByTestId('results').closest('[tabindex="-1"]')
    fireEvent.click(screen.getByRole('button', { name: 'openCatalog' }))
    expect(onPanelChange).toHaveBeenCalledWith('catalog')
    expect(
      vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1),
    ).toBe(stage)
    rerender(
      <StudioTagsWorkbench
        panel="catalog"
        onPanelChange={onPanelChange}
        templates={null}
      >
        {renderSlots}
      </StudioTagsWorkbench>,
    )
    act(() => {
      vi.advanceTimersByTime(DURATION_MS.fast)
    })
    fireEvent.click(screen.getByRole('button', { name: 'backToResults' }))
    expect(onPanelChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByTestId('results').closest('[tabindex="-1"]')).toBe(stage)
    expect(stage).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'backToEditor' }),
    ).not.toBeInTheDocument()
    expect(
      screen
        .getByTestId('results')
        .compareDocumentPosition(
          screen.getByRole('button', { name: 'openCatalog' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
