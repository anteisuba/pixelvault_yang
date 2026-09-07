// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  STUDIO_OPERATOR_RESULT_STAGGER,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'
import { buildGenerationTag } from '@/lib/generation-name'

import {
  StudioOperatorResultRow,
  resultOrdinal,
} from './StudioOperatorResultRow'

/**
 * 结果行卡的回归闸（§3.1 ⑱–⑲ / §4.2 / §11.4）。
 *
 * 钉五件事：
 *  ① 2 列 → 宽档 4 列，门槛与 `STUDIO_OPERATOR_SHELL.wideAtPx` 是**同一个数**
 *    （类名里那个 700 与常量分家的话，改一处另一处静默过期）；
 *  ② 点一格 = 选中，**再点一次交出 `null`**（取消选中）——「点了取消不掉」是
 *    这类网格最常见的死角；
 *  ③ 选中态是 `border-primary` + 内描边，⛔ 不是底色块（§11.3 的层级纪律）；
 *  ④ 「问助手」「放大」「按这张继续」三颗各自把**那一格**交出去；
 *  ⑤ 没选中时**不渲染**「按这张继续」，⛔ 不做禁用占位（§4.3）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('motion/react', () => ({
  motion: { div: 'div' },
  useReducedMotion: () => true,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const items = [
  {
    id: 'g1',
    url: 'https://cdn.test/1.png',
    thumbnailUrl: 'https://cdn.test/1t.png',
  },
  { id: 'g2', url: 'https://cdn.test/2.png', label: '夜景版' },
]

function renderRow(selectedId: string | null = null) {
  const handlers = {
    onSelect: vi.fn(),
    onAsk: vi.fn(),
    onZoom: vi.fn(),
    onContinue: vi.fn(),
  }
  const view = render(
    <StudioOperatorResultRow
      items={items}
      selectedId={selectedId}
      {...handlers}
    />,
  )
  return { ...handlers, view }
}

describe('StudioOperatorResultRow', () => {
  it('2 列起步，宽档门槛用的是 wideAtPx（容器查询，⛔ 不是视口断点）', () => {
    renderRow()
    const grid = screen
      .getByTestId('operator-result-row')
      .querySelector('.grid')
    expect(grid?.className).toContain('grid-cols-2')
    expect(grid?.className).toContain(
      `@min-[${STUDIO_OPERATOR_SHELL.wideAtPx}px]:grid-cols-4`,
    )
    // 容器查询的锚点在卡自己身上 —— 少了它宽档永远不会触发。
    expect(screen.getByTestId('operator-result-row').className).toContain(
      '@container',
    )
  })

  it('点一格选中，再点同一格交出 null', () => {
    const first = renderRow()
    fireEvent.click(screen.getAllByTestId('operator-result-select')[0]!)
    expect(first.onSelect).toHaveBeenCalledWith('g1')
    first.view.unmount()

    // ⭐ 已经选中的那一格再点一次 —— 调用方收到 `null`（取消选中）。
    const again = renderRow('g1')
    fireEvent.click(screen.getAllByTestId('operator-result-select')[0]!)
    expect(again.onSelect).toHaveBeenCalledWith(null)
  })

  it('选中态走 border-primary + 内描边，⛔ 不是底色块', () => {
    renderRow('g2')
    const tiles = screen.getAllByTestId('operator-result-tile')
    expect(tiles[1]?.dataset.selected).toBe('true')
    const selected = screen.getAllByTestId('operator-result-select')[1]!
    expect(selected.className).toContain('border-primary')
    expect(selected.className).toContain('ring-inset')
    expect(selected.className).not.toContain('bg-primary')
  })

  it('三颗动作各自交出那一格；没选中时不渲染「按这张继续」', () => {
    const handlers = renderRow()
    expect(screen.queryByTestId('operator-result-continue')).toBeNull()

    fireEvent.click(screen.getAllByTestId('operator-result-ask')[1]!)
    expect(handlers.onAsk).toHaveBeenCalledWith(items[1], 1)

    fireEvent.click(screen.getAllByTestId('operator-result-zoom')[0]!)
    expect(handlers.onZoom).toHaveBeenCalledWith(items[0], 0)
  })

  it('选中之后卡脚出「按这张继续」，交出的是选中的那一格', () => {
    const handlers = renderRow('g2')
    fireEvent.click(screen.getByTestId('operator-result-continue'))
    expect(handlers.onContinue).toHaveBeenCalledWith(items[1], 1)
  })

  it('每格角标写产物名的身份段（`图_0xx`）—— 用户照着打就能 @ 出来（切片 N1）', () => {
    renderRow()
    const badges = screen.getAllByTestId('operator-result-name')
    expect(badges.map((node) => node.textContent)).toEqual([
      buildGenerationTag({ id: 'g1' }),
      buildGenerationTag({ id: 'g2' }),
    ])
    // ⚠ 序号没有消失：读屏名与卡脚选中态照旧按「这一屏的第几格」说话。
    expect(
      screen
        .getAllByTestId('operator-result-select')[0]
        ?.getAttribute('aria-label'),
    ).toBeTruthy()
  })

  it('序号用带圈数字，超出表长回落成 #N（⛔ 不让两格顶同一个号）', () => {
    expect(resultOrdinal(0)).toBe('①')
    expect(resultOrdinal(19)).toBe('⑳')
    expect(resultOrdinal(20)).toBe('#21')
    // stagger 封顶：一批 20 张时最后几张不该等到半秒后才出现（§11.5）。
    expect(STUDIO_OPERATOR_RESULT_STAGGER.maxItems).toBe(12)
  })
})
