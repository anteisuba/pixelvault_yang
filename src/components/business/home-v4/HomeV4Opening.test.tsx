import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HOME_V4_SHOWCASE, HOME_V4_STRIP } from '@/constants/homepage-v4'

import { HomeV4Opening } from './HomeV4Opening'

vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return { useTranslations: () => translate }
})

/* `className` matters here, unlike the deck's copy of this mock: the `a` / `b`
   pair inside a cell is exactly what the rotation cross-fades between. */
vi.mock('next/image', () => ({
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

/** `n` shots shaped like the service's output. */
function shots(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `gen-${i}`,
    src: `https://cdn.example/gen-${i}.webp`,
  }))
}

const cellSrcs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.op-strip figure img.a')).map((img) =>
    img.getAttribute('src'),
  )

/**
 * The wall is the first thing a visitor sees, and its images now come from the
 * database. jsdom has no layout, so this pins the wiring rather than the look:
 * the grid draws what the page handed it, and it still draws a full wall when
 * the page hands it nothing.
 */
describe('HomeV4Opening · showcase wall', () => {
  it('draws the shots the page passed, not the bundled strip', () => {
    const { container } = render(
      <HomeV4Opening progress={0} shots={shots(HOME_V4_SHOWCASE.CELL_COUNT)} />,
    )

    expect(cellSrcs(container)).toEqual(
      shots(HOME_V4_SHOWCASE.CELL_COUNT).map((shot) => shot.src),
    )
  })

  it('takes only the first CELL_COUNT shots — the rest are rotation spares', () => {
    const { container } = render(
      <HomeV4Opening
        progress={0}
        shots={shots(HOME_V4_SHOWCASE.CELL_COUNT + 6)}
      />,
    )

    expect(cellSrcs(container)).toHaveLength(HOME_V4_SHOWCASE.CELL_COUNT)
  })

  it('falls back to the bundled strip when no shots are passed', () => {
    const { container } = render(<HomeV4Opening progress={0} />)

    expect(cellSrcs(container)).toEqual(HOME_V4_STRIP.map((shot) => shot.src))
  })

  it('falls back to the bundled strip on an empty list', () => {
    const { container } = render(<HomeV4Opening progress={0} shots={[]} />)

    expect(cellSrcs(container)).toEqual(HOME_V4_STRIP.map((shot) => shot.src))
  })
})

/**
 * 首屏随滚动散开（UX 板 Hero · 100vh：「作品墙随滚动向两侧散开（scrub）」）。
 *
 * jsdom 不算样式，所以这里钉的是**喂给 CSS 的数**：每格自己的 `--away`（到中线
 * 的距离）与全墙共用的 `--spread`（段内进度）。⛔ 只写自定义属性，没有一行
 * 布局属性被碰。
 */
describe('HomeV4Opening · 随滚动散开', () => {
  const styles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.op-strip figure')).map(
      (cell) => cell.getAttribute('style') ?? '',
    )

  it('把进度喂给每一格，中线两侧的符号相反', () => {
    const { container } = render(<HomeV4Opening progress={0.5} />)
    const written = styles(container)

    expect(written).toHaveLength(HOME_V4_SHOWCASE.CELL_COUNT)
    for (const style of written) {
      expect(style).toContain('--spread: 0.5')
      expect(style).toContain('--away')
    }
    /* 第一格在中线左侧，最后一格在右侧 —— 散开，不是整块平移。 */
    expect(written[0]).toContain('--away: -1')
    expect(written[written.length - 1]).toContain('--away: 1')
  })

  it('标题与提示随后半程淡出，且只动 opacity', () => {
    const top = render(<HomeV4Opening progress={0} />)
    expect(top.container.querySelector('.op-hero')?.getAttribute('style')).toBe(
      'opacity: 1;',
    )

    const gone = render(<HomeV4Opening progress={1} />)
    expect(
      gone.container.querySelector('.op-hero')?.getAttribute('style'),
    ).toBe('opacity: 0;')
  })
})
