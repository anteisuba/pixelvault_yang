import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord, RunItem } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/optimized-image', () => ({
  OptimizedImage: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="tile-image" src={src} alt={alt} />
  ),
}))

vi.mock('@/components/business/studio-shared', () => ({
  StudioGeneratingProgress: () => <div data-testid="progress" />,
}))

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn().mockResolvedValue({ success: true }),
}))

// §3.0b 第 4 条的注入口。用桩件断言「动作栏带的是被聚焦那格的 URL」——
// 真实实现要 StudioProvider，而这里要验的是接线不是 reducer。
const askAssistantMock = vi.fn()
vi.mock('@/hooks/use-ask-assistant-about-image', () => ({
  useAskAssistantAboutImage: () => askAssistantMock,
}))

import { CompareGrid } from './CompareGrid'

function makeGeneration(id: string, url: string): GenerationRecord {
  return {
    id,
    url,
    prompt: 'a cat',
    width: 1024,
    height: 1024,
    model: 'flux-dev',
    mimeType: 'image/png',
  } as GenerationRecord
}

function makeItem(overrides: Partial<RunItem>): RunItem {
  return {
    id: 'item-1',
    modelId: 'flux-dev',
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
    modelId: 'flux-dev',
    status: 'completed',
    generation: makeGeneration('gen-a1', 'https://cdn.example.com/a1.png'),
  }),
  makeItem({
    id: 'a2',
    modelId: 'flux-dev',
    status: 'completed',
    generation: makeGeneration('gen-a2', 'https://cdn.example.com/a2.png'),
  }),
  makeItem({
    id: 'b1',
    modelId: 'seedream-4',
    status: 'completed',
    generation: makeGeneration('gen-b1', 'https://cdn.example.com/b1.png'),
  }),
  makeItem({
    id: 'b2',
    modelId: 'seedream-4',
    status: 'completed',
    generation: makeGeneration('gen-b2', 'https://cdn.example.com/b2.png'),
  }),
]

function renderGrid(props: Partial<Parameters<typeof CompareGrid>[0]> = {}) {
  return render(
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

beforeEach(() => {
  askAssistantMock.mockClear()
})

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
      screen.queryByRole('button', { name: /toolAskAssistant/ }),
    ).not.toBeInTheDocument()
  })
})

describe('CompareGrid — 聚焦与定为最佳是两步', () => {
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
    expect(screen.getByText(/takeLabel/)).toBeInTheDocument()
  })

  it('selects the winner only from the action bar', () => {
    const onSelect = vi.fn()
    renderGrid({ onSelect })

    fireEvent.click(screen.getAllByRole('option')[2])
    fireEvent.click(screen.getByRole('button', { name: /variantSelectWinner/ }))

    expect(onSelect).toHaveBeenCalledWith('gen-b1')
  })

  it('routes action-bar actions to the focused tile', () => {
    const onUseAsReference = vi.fn()
    renderGrid({ onUseAsReference })

    fireEvent.click(screen.getAllByRole('option')[3])
    fireEvent.click(screen.getByRole('button', { name: /toolAskAssistant/ }))
    fireEvent.click(screen.getByRole('button', { name: /useAsReference/ }))

    expect(askAssistantMock).toHaveBeenCalledWith(
      'https://cdn.example.com/b2.png',
    )
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
      screen.getByRole('button', { name: /toolAskAssistant/ }),
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
      screen.queryByRole('button', { name: /toolAskAssistant/ }),
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
    render(
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
      screen.queryByRole('button', { name: /toolAskAssistant/ }),
    ).not.toBeInTheDocument()
  })
})
