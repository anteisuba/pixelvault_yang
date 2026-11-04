import { fireEvent, screen, within } from '@testing-library/react'
import { useLayoutEffect, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  clearOperatorMentions,
  getOperatorState,
} from '@/hooks/use-studio-operator-store'
import { renderWithApp } from '@/test/app-harness'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { generationFixture } from '@/test/generation-fixture'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  StudioProviders,
  type StudioHandle,
} from '@/test/studio-harness'
import { useStudioContext } from '@/contexts/studio-context'
import type { GenerationRecord, RunItem } from '@/types'

import { CompareGrid } from './CompareGrid'

/**
 * 对比网格（items 是宿主给的 prop），全程真的：真文案、真进度层、真大图、真工作台
 * （「问助手」走真管线进助手 store、开助手面板）；只假网络。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-grid' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioV3.${key}`, values)
const FLUX = AI_MODELS.SEEDREAM_50_PRO
const SEEDREAM = AI_MODELS.OPENAI_GPT_IMAGE_2

const studioRef = { current: null as unknown as StudioHandle }
function Capture() {
  const ctx = useStudioContext()
  useLayoutEffect(() => {
    studioRef.current = ctx
  })
  return null
}

beforeEach(() => {
  stubBrowserLayout()
  clearOperatorMentions()
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

/** 真工作台里渲染；`rerender` 换 props 时树不变（捕获节点一直在）。 */
function renderInStudio(ui: ReactElement) {
  const view = renderWithApp(
    <>
      <Capture />
      {ui}
    </>,
    { inner: StudioProviders },
  )
  return {
    ...view,
    rerender: (next: ReactElement) =>
      view.rerender(
        <>
          <Capture />
          {next}
        </>,
      ),
  }
}

/** 某格里的图（真 `OptimizedImage`）。 */
const tileImages = () =>
  screen
    .getAllByRole('option')
    .flatMap((tile) => Array.from(tile.querySelectorAll('img')))
    .filter((img) => img.getAttribute('src'))

function makeGeneration(id: string, url: string): GenerationRecord {
  return generationFixture({ id, url, prompt: 'a cat', model: FLUX })
}

function makeItem(overrides: Partial<RunItem>): RunItem {
  return {
    id: 'item-1',
    modelId: FLUX,
    status: 'generating',
    generation: null,
    error: null,
    ...overrides,
  } as RunItem
}

/** 2 模型 × 2 张 —— `generateCompare` 摊平后同模型的两张是连续的。 */
const matrixItems: RunItem[] = [
  makeItem({
    id: 'a1',
    modelId: FLUX,
    status: 'completed',
    generation: makeGeneration('gen-a1', 'https://cdn.example.com/a1.png'),
  }),
  makeItem({
    id: 'a2',
    modelId: FLUX,
    status: 'completed',
    generation: makeGeneration('gen-a2', 'https://cdn.example.com/a2.png'),
  }),
  makeItem({
    id: 'b1',
    modelId: SEEDREAM,
    status: 'completed',
    generation: makeGeneration('gen-b1', 'https://cdn.example.com/b1.png'),
  }),
  makeItem({
    id: 'b2',
    modelId: SEEDREAM,
    status: 'completed',
    generation: makeGeneration('gen-b2', 'https://cdn.example.com/b2.png'),
  }),
]

function renderGrid(props: Partial<Parameters<typeof CompareGrid>[0]> = {}) {
  return renderInStudio(
    <CompareGrid
      items={matrixItems}
      selectedItemId={null}
      onSelect={vi.fn()}
      elapsedSeconds={3}
      onEdit={vi.fn()}
      onUseAsReference={vi.fn()}
      {...props}
    />,
  )
}

describe('CompareGrid — 图上零按钮', () => {
  // 真机探针实测：旧版「下载」36×36 的正中心点下去命中的是「问助手」28×28。
  // 根因是每格同时叠了三颗按钮。修法不是挪位置，是让格子里一颗都没有。
  it('renders no buttons inside the tiles', () => {
    renderGrid()
    for (const tile of screen.getAllByRole('option')) {
      expect(within(tile).queryAllByRole('button')).toHaveLength(0)
    }
  })

  it('shows no action bar until a tile is focused', () => {
    renderGrid()
    expect(
      screen.queryByRole('button', { name: T('toolAskAssistant') }),
    ).not.toBeInTheDocument()
  })
})

describe('CompareGrid — 聚焦与定为最佳是两步', () => {
  it('moves a single Tab stop through completed results without committing a winner', () => {
    const onSelect = vi.fn()
    renderGrid({
      onSelect,
      items: [
        matrixItems[0],
        makeItem({ id: 'pending' }),
        makeItem({ id: 'failed', status: 'failed' }),
        matrixItems[3],
      ],
    })
    const tiles = screen.getAllByRole('option')
    expect(tiles.map((tile) => tile.tabIndex)).toEqual([0, -1, -1, -1])
    fireEvent.keyDown(tiles[0], { key: 'ArrowRight' })
    expect(tiles[3]).toHaveFocus()
    expect(tiles[3]).toHaveAttribute('aria-selected', 'true')
    expect(tiles.map((tile) => tile.tabIndex)).toEqual([-1, -1, -1, 0])
    fireEvent.keyDown(tiles[3], { key: 'Home' })
    expect(tiles[0]).toHaveFocus()
    fireEvent.keyDown(tiles[0], { key: 'End' })
    expect(tiles[3]).toHaveFocus()
    fireEvent.keyDown(tiles[3], { key: 'ArrowUp' })
    expect(tiles[0]).toHaveFocus()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('restores a Tab entry when the selected result leaves the run', () => {
    const { rerender } = renderGrid()
    fireEvent.click(screen.getAllByRole('option')[3])
    rerender(
      <CompareGrid
        items={[matrixItems[0]]}
        selectedItemId={null}
        onSelect={vi.fn()}
        elapsedSeconds={3}
        onEdit={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    )
    expect(screen.getByRole('option')).toHaveAttribute('tabindex', '0')
  })
  // `selectWinner` 是服务端写入。旧版「点哪格就落库哪格」让浏览的代价
  // 等于提交的代价 —— 想看第二张就顺手改了最佳。
  it('focuses a tile on click without selecting a winner', () => {
    const onSelect = vi.fn()
    renderGrid({ onSelect })

    fireEvent.click(screen.getAllByRole('option')[2])

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getAllByRole('option')[2]).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  // ⭐ owner 2026-08-24 实拍「生成的图片没有选中的感觉」。根因：这套 2px 内描边
  // 是参考轨 44×44 缩略图用的，占它宽度 4.5%；搬到 190px+ 的结果大图上只占 1%，
  // 还压在满幅彩图的边缘像素里。改成画在**图外侧**的 ring + offset。
  it('⭐ 聚焦的格子把标识画在图外侧，不跟图片内容抢像素', () => {
    renderGrid()

    const tiles = screen.getAllByRole('option')
    fireEvent.click(tiles[2])

    expect(tiles[2].className).toMatch(/ring-2/)
    expect(tiles[2].className).toMatch(/ring-offset-2/)
    // 未聚焦的保持一条极淡的内描边，不喧宾夺主
    expect(tiles[0].className).not.toMatch(/ring-2/)
    expect(tiles[0].className).toMatch(/outline-1/)
  })

  it('⭐ 动作栏说清在操作哪一张 —— 同模型多张时印序号', () => {
    renderGrid()

    fireEvent.click(screen.getAllByRole('option')[1])

    // 缺了它，同一个模型两张的动作栏（模型名 + 同样的尺寸）长得一模一样
    expect(screen.getByText(T('takeLabel', { index: 2 }))).toBeInTheDocument()
  })

  it('selects the winner only from the action bar', () => {
    const onSelect = vi.fn()
    renderGrid({ onSelect })

    fireEvent.click(screen.getAllByRole('option')[2])
    fireEvent.click(
      screen.getByRole('button', { name: T('variantSelectWinner') }),
    )

    expect(onSelect).toHaveBeenCalledWith('gen-b1')
  })

  it('routes action-bar actions to the focused tile', () => {
    const onUseAsReference = vi.fn()
    renderGrid({ onUseAsReference })

    fireEvent.click(screen.getAllByRole('option')[3])
    fireEvent.click(screen.getByRole('button', { name: T('toolAskAssistant') }))
    fireEvent.click(screen.getByRole('button', { name: T('useAsReference') }))

    expect(JSON.stringify(getOperatorState().mentions)).toContain(
      'https://cdn.example.com/b2.png',
    )
    expect(studioRef.current.state.panels.enhance).toBe(true)
    expect(onUseAsReference).toHaveBeenCalledWith(
      'https://cdn.example.com/b2.png',
    )
  })

  // 重新生成一轮后旧的聚焦项已经不在 items 里。动作栏若还留着，按钮操作的
  // 是一张已经不在屏上的图。
  it('drops the action bar when the focused item leaves the run', () => {
    const { rerender } = renderGrid()
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(
      screen.getByRole('button', { name: T('toolAskAssistant') }),
    ).toBeInTheDocument()

    rerender(
      <CompareGrid
        items={[matrixItems[2], matrixItems[3]]}
        selectedItemId={null}
        onSelect={vi.fn()}
        elapsedSeconds={3}
        onEdit={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: T('toolAskAssistant') }),
    ).not.toBeInTheDocument()
  })
})

describe('CompareGrid — 矩阵按模型分行', () => {
  // 旧版列数只看总格数（4 格 → 3 列），于是「2 模型 × 2 张」排成 3 + 1，
  // 同一个模型的两张被拆到两行。
  it('groups consecutive takes of the same model into one row', () => {
    renderGrid()
    const rows = screen.getAllByRole('listbox')[0].children
    expect(rows).toHaveLength(2)
    expect(within(rows[0] as HTMLElement).getAllByRole('option')).toHaveLength(
      2,
    )
    expect(within(rows[1] as HTMLElement).getAllByRole('option')).toHaveLength(
      2,
    )
  })

  it('keeps unfinished tiles unfocusable', () => {
    renderInStudio(
      <CompareGrid
        items={[
          makeItem({ id: 'a', status: 'generating' }),
          makeItem({ id: 'b', status: 'failed', error: 'boom' }),
        ]}
        selectedItemId={null}
        onSelect={vi.fn()}
        elapsedSeconds={3}
        onEdit={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    )

    for (const tile of screen.getAllByRole('option')) {
      fireEvent.click(tile)
      expect(tile).toHaveAttribute('aria-selected', 'false')
    }
    expect(
      screen.queryByRole('button', { name: T('toolAskAssistant') }),
    ).not.toBeInTheDocument()
  })
})

it('renders a localized generation reason instead of the provider log', () => {
  renderGrid({
    items: [makeItem({ status: 'failed', error: 'ETIMEDOUT after 120000ms' })],
  })
  expect(screen.getByRole('alert')).toHaveTextContent(
    text('Errors.generation.provider_timeout'),
  )
  expect(screen.queryByText('ETIMEDOUT after 120000ms')).not.toBeInTheDocument()
})

/**
 * 加载态 A：格子自己的边就是进度，失败就地说原因 +「重试」（只重来这一格）。
 */
describe('CompareGrid — 加载态 A', () => {
  it('失败的格子就地给「重试」，点下去只重来这一格', () => {
    const onRetry = vi.fn()
    renderGrid({
      items: [
        makeItem({
          id: 'ok',
          status: 'completed',
          generation: makeGeneration(
            'gen-ok',
            'https://cdn.example.com/ok.png',
          ),
        }),
        makeItem({
          id: 'bad',
          status: 'failed',
          error: 'ETIMEDOUT after 120000ms',
        }),
      ],
      onRetry,
    })
    fireEvent.click(screen.getByRole('button', { name: T('retry') }))
    expect(onRetry).toHaveBeenCalledWith('bad')
  })

  it('没接逐格重试时失败格只说原因，不画按不动的键', () => {
    renderGrid({
      items: [makeItem({ status: 'failed', error: 'boom' })],
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: T('retry') })).toBeNull()
  })

  it('生成中 / 失败的格子把边交给进度线（⛔ 线旁边再一圈细边、⛔ 流光）', () => {
    const { container } = renderGrid({
      items: [
        makeItem({ id: 'run', status: 'generating' }),
        makeItem({ id: 'bad', status: 'failed', error: 'boom' }),
        makeItem({
          id: 'ok',
          status: 'completed',
          generation: makeGeneration(
            'gen-ok',
            'https://cdn.example.com/ok.png',
          ),
        }),
      ],
    })
    const [running, failed, done] = screen.getAllByRole('option')
    expect(running).toHaveClass('outline-transparent')
    expect(failed).toHaveClass('outline-transparent')
    expect(done).toHaveClass('outline-border/60')
    expect(container.querySelector('.studio-reveal-shimmer')).toBeNull()
  })

  it('刚出图的那一格：进度层多留一拍（线合拢再淡掉），⛔ 一完成就抽走', () => {
    const { rerender } = renderGrid({
      items: [makeItem({ id: 'x', status: 'generating' })],
    })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    rerender(
      <CompareGrid
        items={[
          makeItem({
            id: 'x',
            status: 'completed',
            generation: makeGeneration(
              'gen-x',
              'https://cdn.example.com/x.png',
            ),
          }),
        ]}
        selectedItemId={null}
        onSelect={vi.fn()}
        elapsedSeconds={3}
        onEdit={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    )
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(tileImages().map((img) => img.getAttribute('src'))).toContainEqual(
      expect.stringContaining('x.png'),
    )
  })
})

describe('CompareGrid — 工作台出图动效（owner 2026-10-07 工作台原型）', () => {
  it('跑着时舞台顶上有一颗进度胶囊，全部出完就收掉', () => {
    const running = [
      matrixItems[0],
      makeItem({ id: 'a2', modelId: FLUX, status: 'generating' }),
    ]
    const { rerender } = renderGrid({ items: running })
    expect(screen.getByTestId('compare-grid-progress')).toHaveTextContent(
      text('StudioOperator.result.generating', { done: 1, total: 2 }),
    )

    rerender(
      <CompareGrid
        items={matrixItems}
        selectedItemId={null}
        onSelect={vi.fn()}
        elapsedSeconds={3}
        onEdit={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('compare-grid-progress')).toBeNull()
  })

  it('⭐ 定为最佳的勾只在这一次定下时弹出；挂载时就定好的那张不补播', () => {
    const { container, rerender } = renderGrid({ selectedItemId: 'gen-a1' })
    const badgeAt = () =>
      container.querySelector('[role="option"] .rounded-full.bg-foreground')
    expect(badgeAt()).not.toHaveClass('studio-winner-badge-in')

    rerender(
      <CompareGrid
        items={matrixItems}
        selectedItemId="gen-a2"
        onSelect={vi.fn()}
        elapsedSeconds={3}
        onEdit={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    )
    expect(badgeAt()).toHaveClass('studio-winner-badge-in')
  })
})
