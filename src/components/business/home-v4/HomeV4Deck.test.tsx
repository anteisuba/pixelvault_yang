import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_SCROLL,
  HOME_V4_SECTIONS,
  HOME_V4_STATIONS,
  homeV4SectionAnchor,
} from '@/constants/homepage-v4'

import { HomeV4Deck } from './HomeV4Deck'

/* The topbar is the only thing under the deck that reaches for Clerk and the
   auth dialog context; the scroll engine has nothing to do with either. */
vi.mock('./HomeV4Topbar', () => ({
  HomeV4Topbar: () => null,
}))

/* `.rich` is part of the surface too — 02 LoRA prints its mount counter through
   it, and a translator without it throws on render. */
vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return { useTranslations: () => translate, useLocale: () => 'zh' }
})

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

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

function renderDeck() {
  return render(<HomeV4Deck locale="zh" />)
}

/**
 * jsdom 有 `matchMedia` 但没有布局：`getBoundingClientRect()` 一律回零，
 * `innerHeight` 是 768。所以**桌面 scrub 路径在这里跑不出真进度**——能钉的是
 * 它的骨架：段的几何是不是按常量写的、钉住的那一层在不在、降级是不是结果态、
 * 目录与键盘走不走同一条「滚过去」的路。真机目检交给 owner。
 */
function mockMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach(() => {
  /* 默认走降级：手机 / reduced-motion。桌面 scrub 的那一条单独 stub。 */
  mockMedia(false)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined,
  )
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('home v5 · 长卷骨架', () => {
  it('每段都是文档流里的一节，段高来自常量，⛔ 不是叠在一起的绝对定位页', () => {
    const { container } = renderDeck()
    const sections = container.querySelectorAll('.deck > .vp')

    expect(sections).toHaveLength(HOME_V4_SECTIONS.length)
    sections.forEach((element, index) => {
      const section = HOME_V4_SECTIONS[index]
      expect(element.getAttribute('data-name')).toBe(section.id)
      expect(element.getAttribute('style')).toContain(
        `--sec-vh: ${section.vh}vh`,
      )
      /* 钉住的那一屏在每段里各有一个，sticky 挂在它身上。 */
      expect(element.querySelectorAll(':scope > .vp-stage')).toHaveLength(1)
    })
  })

  it('每段带可分享锚点与读得出来的名字', () => {
    const { container } = renderDeck()

    for (const section of HOME_V4_SECTIONS) {
      const element = container.querySelector(
        `#${homeV4SectionAnchor(section.id)}`,
      )
      expect(element, section.id).not.toBeNull()
      expect(element?.tagName).toBe('SECTION')
      expect(element?.getAttribute('aria-label')).toBe(
        `v4.pages.${section.id}.nav`,
      )
    }
  })

  it('⛔ 没有翻页引擎留下的叠页：一个 data-pos 都不剩', () => {
    const { container } = renderDeck()
    expect(container.querySelectorAll('[data-pos]')).toHaveLength(0)
    expect(container.querySelectorAll('.hwrap, .hpg, .hnav')).toHaveLength(0)
  })

  it('滚动条交还给文档：挂的是 roll 而不是 locked', () => {
    const { unmount } = renderDeck()
    expect(document.documentElement.classList.contains('home-v4-roll')).toBe(
      true,
    )
    expect(document.documentElement.classList.contains('home-v4-locked')).toBe(
      false,
    )
    unmount()
    expect(document.documentElement.classList.contains('home-v4-roll')).toBe(
      false,
    )
  })
})

describe('home v5 · 服务端优先 / 降级', () => {
  it('首个渲染就画出标题、模型名与整张段表', () => {
    const { container } = renderDeck()
    const text = container.textContent ?? ''

    for (const section of HOME_V4_SECTIONS) {
      expect(text, section.id).toContain(`v4.pages.${section.id}.nav`)
    }
    /* 模型名是真站表里的值，不是 key。 */
    for (const model of HOME_V4_STATIONS.image) {
      expect(text, model.name).toContain(model.name)
    }
  })

  it('降级（手机 / reduced-motion）下每段直接是结果态 + CTA', () => {
    const { container } = renderDeck()
    const ctas = container.querySelectorAll('.fn-cta')

    expect(ctas).toHaveLength(
      HOME_V4_SECTIONS.filter((section) => section.group === 'feature').length,
    )
    for (const cta of ctas) {
      expect(cta.getAttribute('data-on')).toBe('true')
    }
    expect(container.querySelector('.deck')?.getAttribute('data-scrub')).toBe(
      'false',
    )
    expect(HOME_V4_SCROLL.REST_PROGRESS).toBe(1)
  })
})

describe('home v5 · 目录与键盘', () => {
  it('点目录就是滚过去 —— 没有第二套状态', () => {
    const { container } = renderDeck()
    const target = container.querySelectorAll('.dots button')[2]

    fireEvent.click(target)
    expect(window.scrollTo).toHaveBeenCalled()
  })

  it('左缘一段一条进度轨，填充量就是那一段的进度', () => {
    const { container } = renderDeck()
    const rails = container.querySelectorAll('.dots button')

    expect(rails).toHaveLength(HOME_V4_SECTIONS.length)
    for (const rail of rails) {
      /* 降级下每段都是结果态，所以九条都填满。 */
      expect(rail.getAttribute('style')).toContain('--p: 1')
      /* ⛔ 不是圆点了：轨里得有一条填充。 */
      expect(rail.querySelector('i > b')).not.toBeNull()
    }
  })

  /**
   * 手机缩略图条（owner 批注 51 / 52）**只在 `<768` 渲染**，⛔ 不复用桌面那条
   * 进度轨。jsdom 默认 1024 宽、`useIsPhone` 回落桌面，所以这里两边各跑一次。
   */
  it('手机缩略图条只在 <768 渲染，且每段一张图', () => {
    const wide = renderDeck()
    expect(wide.container.querySelector('.mstrip')).toBeNull()
    wide.unmount()

    mockMedia(true)
    vi.stubGlobal('innerWidth', 375)
    const phone = renderDeck()
    const strip = phone.container.querySelector('.mstrip')

    expect(strip).not.toBeNull()
    expect(strip?.querySelectorAll('button')).toHaveLength(
      HOME_V4_SECTIONS.length,
    )
    /* 图才是手机上认得出的那件东西；序号与段名跟着走（段名给读屏）。 */
    expect(strip?.querySelectorAll('img')).toHaveLength(HOME_V4_SECTIONS.length)
    for (const section of HOME_V4_SECTIONS) {
      expect(strip?.textContent).toContain(`v4.pages.${section.id}.nav`)
    }
  })

  it('方向键滚动，其余键一律留给浏览器', () => {
    renderDeck()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(window.scrollTo).toHaveBeenCalled()

    vi.mocked(window.scrollTo).mockClear()
    fireEvent.keyDown(window, { key: ' ' })
    fireEvent.keyDown(window, { key: 'Home' })
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('详情 sheet 开着时 Escape 关它，不滚页', () => {
    const { container } = renderDeck()

    fireEvent.click(container.querySelectorAll('.mcard .more')[0])
    expect(document.querySelector('.msheet')).not.toBeNull()

    vi.mocked(window.scrollTo).mockClear()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.msheet')).toBeNull()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
