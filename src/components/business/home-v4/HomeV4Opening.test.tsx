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
      <HomeV4Opening
        active={false}
        shots={shots(HOME_V4_SHOWCASE.CELL_COUNT)}
      />,
    )

    expect(cellSrcs(container)).toEqual(
      shots(HOME_V4_SHOWCASE.CELL_COUNT).map((shot) => shot.src),
    )
  })

  it('takes only the first CELL_COUNT shots — the rest are rotation spares', () => {
    const { container } = render(
      <HomeV4Opening
        active={false}
        shots={shots(HOME_V4_SHOWCASE.CELL_COUNT + 6)}
      />,
    )

    expect(cellSrcs(container)).toHaveLength(HOME_V4_SHOWCASE.CELL_COUNT)
  })

  it('falls back to the bundled strip when no shots are passed', () => {
    const { container } = render(<HomeV4Opening active={false} />)

    expect(cellSrcs(container)).toEqual(HOME_V4_STRIP.map((shot) => shot.src))
  })

  it('falls back to the bundled strip on an empty list', () => {
    const { container } = render(<HomeV4Opening active={false} shots={[]} />)

    expect(cellSrcs(container)).toEqual(HOME_V4_STRIP.map((shot) => shot.src))
  })
})
