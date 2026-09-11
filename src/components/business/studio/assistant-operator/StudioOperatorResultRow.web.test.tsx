// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  StudioOperatorResultEntry,
  StudioOperatorResultItem,
} from '@/types/studio-assistant-operator'

import { StudioOperatorResultRow } from './StudioOperatorResultRow'

/**
 * 结果卡的回归闸（v2 §6 / 画板 BCards「结果」三态）。
 *
 * 钉五件事：
 *  ① **三态各自画对**：生成中（占位格数 = 本次张数 + 「1 / 3」）/ 单张 / 多张；
 *  ② **审核态在结构上不存在**：✓ / ✕ 两颗与「未选定 / 已选 ②」那一行零命中 ——
 *    这是 §6.1 唯一一条能被自动化钉住的判据；
 *  ③ 「再来一组」交出**这一条**（含载荷），调用方拿它去摆新的确认卡；
 *  ④ 「用它当参考」交出**第一格**；
 *  ⑤ 载荷缺席时「再来一组」**不渲染**，⛔ 不做禁用占位（§4.3）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => '11:26' }),
}))

vi.mock('motion/react', () => ({
  motion: { span: 'span' },
  useReducedMotion: () => true,
}))

vi.mock('next/image', () => ({
  // ⚠ `className` 透传：缩略图的裁切基准（`object-top`）就验在它身上。
  default: ({
    src,
    alt,
    className,
  }: {
    src: string
    alt: string
    className?: string
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}))

const items: StudioOperatorResultItem[] = [
  {
    id: 'g1',
    url: 'https://cdn.test/1.png',
    thumbnailUrl: 'https://cdn.test/1t.png',
    seq: 11,
  },
  { id: 'g2', url: 'https://cdn.test/2.png', label: '夜景版', seq: 12 },
  { id: 'g3', url: 'https://cdn.test/3.png', seq: 13 },
]

const request = {
  model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
  count: 3,
  specs: { aspectRatio: '3:2', resolution: null, durationSeconds: null },
}

function buildEntry(
  patch: Partial<StudioOperatorResultEntry> = {},
): StudioOperatorResultEntry {
  return {
    kind: 'result',
    id: 'result-1',
    total: 3,
    completed: 3,
    items,
    summary: '胶片质感',
    storedAt: '2026-09-11T03:26:00.000Z',
    request,
    ...patch,
  }
}

function renderCard(patch: Partial<StudioOperatorResultEntry> = {}) {
  const handlers = { onRerun: vi.fn(), onUseAsReference: vi.fn() }
  const entry = buildEntry(patch)
  const view = render(<StudioOperatorResultRow entry={entry} {...handlers} />)
  return { ...handlers, entry, view }
}

describe('StudioOperatorResultRow', () => {
  it('生成中：占位格数 = 本次张数，读数写「{done} / {total}」', () => {
    renderCard({ items: [], completed: 1, total: 3, storedAt: undefined })

    expect(screen.getAllByTestId('operator-result-placeholder')).toHaveLength(3)
    expect(screen.getByTestId('operator-result-progress').textContent).toBe(
      'generating',
    )
    expect(screen.getByTestId('operator-result-row').dataset.generating).toBe(
      'true',
    )
    // 生成中没有缩略图，也没有两颗轻操作 —— 还没有东西可以「再来」或「当参考」。
    expect(screen.queryByTestId('operator-result-tile')).toBeNull()
    expect(screen.queryByTestId('operator-result-rerun')).toBeNull()
  })

  it('单张：一格缩略图 + 「已入库」那一行', () => {
    renderCard({ items: [items[0]], total: 1, completed: 1 })

    expect(screen.getAllByTestId('operator-result-tile')).toHaveLength(1)
    expect(screen.getByTestId('operator-result-stored').textContent).toContain(
      'stored',
    )
  })

  it('多张：每张一格，读数走带计数的那一句', () => {
    renderCard()

    expect(screen.getAllByTestId('operator-result-tile')).toHaveLength(3)
    expect(screen.getByTestId('operator-result-stored').textContent).toContain(
      'storedCount',
    )
  })

  it('⭐ 缩略图按顶部裁（人物图别只剩腿）—— 单张与多张同一条 class', () => {
    const single = renderCard({ items: [items[0]], total: 1, completed: 1 })
    expect(
      screen.getAllByTestId('operator-result-tile')[0]?.querySelector('img')
        ?.className,
    ).toContain('object-top')
    single.view.unmount()

    renderCard()
    for (const tile of screen.getAllByTestId('operator-result-tile')) {
      expect(tile.querySelector('img')?.className).toContain('object-top')
    }
  })

  /**
   * ⭐ §6.1 的自动化落点：卡上**没有**审核记号，也没有「未选定 / 已选」那一行。
   * ⛔ 别把这条改成「查 class」—— 它要钉的是这些控件在结构上不存在。
   */
  it('⛔ 没有审核态：✓ / ✕ 与选中行零命中', () => {
    renderCard()

    expect(screen.queryByTestId('operator-result-approve')).toBeNull()
    expect(screen.queryByTestId('operator-result-block')).toBeNull()
    expect(screen.queryByTestId('operator-result-review')).toBeNull()
    expect(screen.queryByTestId('operator-result-selection')).toBeNull()
    expect(screen.queryByTestId('operator-result-continue')).toBeNull()
  })

  it('「再来一组」交出这一条（调用方拿 request 去摆新的确认卡）', () => {
    const { onRerun, entry } = renderCard()

    fireEvent.click(screen.getByTestId('operator-result-rerun'))

    expect(onRerun).toHaveBeenCalledWith(entry)
  })

  it('「用它当参考」交出第一格', () => {
    const { onUseAsReference } = renderCard()

    fireEvent.click(screen.getByTestId('operator-result-reference'))

    expect(onUseAsReference).toHaveBeenCalledWith(items[0])
  })

  it('载荷缺席时「再来一组」不渲染，⛔ 不做禁用占位', () => {
    renderCard({ request: undefined })

    expect(screen.queryByTestId('operator-result-rerun')).toBeNull()
    // 「用它当参考」不依赖载荷，照旧在。
    expect(screen.getByTestId('operator-result-reference')).toBeTruthy()
  })
})
