import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_ALL_MODELS,
  HOME_V4_STATION_KEYS,
  HOME_V4_STATION_ROUTES,
  HOME_V4_STATIONS,
} from '@/constants/homepage-v4'

import { HomeV4ModelRail } from './HomeV4ModelRail'

vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return { useTranslations: () => translate }
})

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const renderRail = (onOpenDetail = vi.fn()) => ({
  ...render(<HomeV4ModelRail onOpenDetail={onOpenDetail} />),
  onOpenDetail,
})

/**
 * 模型阵容：一行一模态的横滑列表，替换了 v4 的五个整屏模型站。
 *
 * jsdom 没有布局，所以这里不量任何东西。钉的是**名册的来源**：每一张卡都必须
 * 能追回 `HOME_V4_STATIONS`，一个都不许是在组件里手写的。
 */
describe('HomeV4ModelRail', () => {
  it('每个模态一行，行序与站表一致', () => {
    const { container } = renderRail()
    const rows = container.querySelectorAll('.mrow2')

    expect(rows).toHaveLength(HOME_V4_STATION_KEYS.length)
    rows.forEach((row, index) => {
      expect(row.getAttribute('aria-label')).toBe(
        `v4.models.rows.${HOME_V4_STATION_KEYS[index]}`,
      )
    })
  })

  it('卡片走真站表，⛔ 一个手抄的模型名都没有', () => {
    const { container } = renderRail()
    const cards = container.querySelectorAll('.mcard')

    expect(cards).toHaveLength(HOME_V4_ALL_MODELS.length)

    const printed = Array.from(
      cards,
      (card) => card.querySelector('figcaption > b')?.textContent,
    )
    expect(printed).toEqual(HOME_V4_ALL_MODELS.map((model) => model.name))
  })

  it('封面链到那一行的工作台', () => {
    const { container } = renderRail()
    const rows = container.querySelectorAll('.mrow2')

    rows.forEach((row, index) => {
      const station = HOME_V4_STATION_KEYS[index]
      const covers = row.querySelectorAll('.mcard .cover')
      expect(covers).toHaveLength(HOME_V4_STATIONS[station].length)
      for (const cover of covers) {
        expect(cover.getAttribute('href')).toBe(HOME_V4_STATION_ROUTES[station])
      }
    })
  })

  /* 还没出样图的模型走的是留白卡，不是一张碎图 —— 它得说自己缺什么，
     而不是假装完整。 */
  it('没有封面的模型画留白卡而不是坏图', () => {
    const { container } = renderRail()
    const without = HOME_V4_ALL_MODELS.filter((model) => model.cover === null)

    expect(container.querySelectorAll('.mcard .cover .plain')).toHaveLength(
      without.length,
    )
    expect(container.querySelectorAll('.mcard .cover img')).toHaveLength(
      HOME_V4_ALL_MODELS.length - without.length,
    )
  })

  /* 一行最多七张封面、屏上只见两张，所以交给浏览器自己的视口判断就够了 ——
     v4 那套手写的 `near` 预取门是因为翻页引擎用 transform 移动页面，浏览器
     看哪张都像在屏上；长卷里这个前提没了。 */
  it('封面全部 lazy + async decode', () => {
    const { container } = renderRail()
    const covers = container.querySelectorAll('.mcard .cover img')

    for (const cover of covers) {
      expect(cover.getAttribute('loading')).toBe('lazy')
      expect(cover.getAttribute('decoding')).toBe('async')
    }
  })

  it('详情按钮把那一张卡交回给 deck', () => {
    const { container, onOpenDetail } = renderRail()

    fireEvent.click(container.querySelectorAll('.mcard .more')[1])
    expect(onOpenDetail).toHaveBeenCalledWith(HOME_V4_STATION_KEYS[0], 1)
  })

  /* 封面是链接、详情是按钮，两件事两个元素。⚠ 嵌套的可点元素在读屏与键盘上
     都是坏的，所以这一条是无障碍的硬线，不是风格偏好。 */
  it('封面链接里不嵌按钮', () => {
    const { container } = renderRail()
    expect(container.querySelectorAll('.cover button')).toHaveLength(0)
  })
})
