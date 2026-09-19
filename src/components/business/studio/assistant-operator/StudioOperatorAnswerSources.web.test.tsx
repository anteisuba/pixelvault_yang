// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  StudioOperatorAnswerSources,
  formatSourceDuration,
  toOperatorAnswerSources,
  type StudioOperatorAnswerSource,
} from './StudioOperatorAnswerSources'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'

/**
 * **回答底下那两样**的回归闸（56b 切片 1）。
 *
 * 钉四件事：
 *  ① 一条资料一张来源卡，域名与标题都在，`url` 缺席时⛔ 不渲染成链接；
 *  ② 只有带画面的那几条进媒体条 —— ⛔ 不给没有封面的视频留灰格子；
 *  ③ 视频封面点下去**开新窗口跳原站**（⛔ 不进灯箱、⛔ 不嵌播放器）；
 *  ④ 高亮认的是 `cite` 而不是下标。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 测试替身
    <img alt={alt} src={src} />
  ),
}))

const openLightbox = vi.fn()
vi.mock('./StudioOperatorLightbox', () => ({
  openOperatorLightbox: (url: string, caption?: string) =>
    openLightbox(url, caption),
}))

const SOURCES: StudioOperatorAnswerSource[] = [
  {
    cite: 1,
    title: '新海诚式「雨夜霓虹」到底怎么画',
    url: 'https://zhihu.com/a',
    publisher: 'zhihu.com',
    kind: 'text',
  },
  {
    cite: 2,
    title: '雨夜街道 · 作品集',
    url: 'https://pixiv.net/b',
    publisher: 'pixiv.net',
    kind: 'image',
    mediaUrl: 'https://cdn.test/1.png',
  },
  {
    cite: 3,
    title: '三层光叠法拆解',
    url: 'https://www.bilibili.com/video/BV1',
    publisher: 'bilibili.com',
    kind: 'video',
    mediaUrl: 'https://cdn.test/cover.jpg',
    durationSeconds: 760,
  },
  {
    cite: 4,
    title: 'danbooru 共现标签',
    publisher: 'danbooru.donmai.us',
    kind: 'tags',
  },
]

describe('StudioOperatorAnswerSources', () => {
  it('一条资料一张来源卡；没有 url 的那条⛔ 不是链接', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    const cards = screen.getAllByTestId('operator-answer-source-card')
    expect(cards).toHaveLength(4)
    expect(cards[0]?.tagName).toBe('A')
    expect(cards[3]?.tagName).toBe('SPAN')
    expect(cards[0]?.textContent).toContain('zhihu.com')
  })

  it('⛔ 没有画面的那两条不进媒体条', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    const media = screen.getAllByTestId('operator-answer-media-item')
    expect(media).toHaveLength(2)
    expect(media.map((item) => item.dataset.cite)).toEqual(['2', '3'])
  })

  it('⭐ 图片开灯箱、视频开新窗口 —— 两种点击两个去处', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    const media = screen.getAllByTestId('operator-answer-media-item')
    fireEvent.click(media[0] as HTMLElement)
    expect(openLightbox).toHaveBeenCalledWith(
      'https://cdn.test/1.png',
      '雨夜街道 · 作品集',
    )
    fireEvent.click(media[1] as HTMLElement)
    expect(open).toHaveBeenCalledWith(
      'https://www.bilibili.com/video/BV1',
      '_blank',
      'noopener,noreferrer',
    )
    vi.unstubAllGlobals()
  })

  it('时长角标只在有时长时画', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    expect(
      screen.getAllByTestId('operator-answer-media-duration'),
    ).toHaveLength(1)
    expect(formatSourceDuration(760)).toBe('12:40')
    expect(formatSourceDuration(3723)).toBe('1:02:03')
  })

  it('高亮认的是 cite，不是下标', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={3} />)
    const active = screen
      .getAllByTestId('operator-answer-source-card')
      .filter((card) => card.dataset.active === 'true')
    expect(active).toHaveLength(1)
    expect(active[0]?.dataset.cite).toBe('3')
  })

  it('⛔ 一条资料都没有就整块不渲染', () => {
    const { container } = render(
      <StudioOperatorAnswerSources sources={[]} activeCite={null} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('toOperatorAnswerSources', () => {
  const step = (
    evidence: Record<string, unknown>[],
    conclusion?: string,
  ): StudioOperatorStepEntry =>
    ({
      kind: 'step',
      id: 'e1',
      runKey: 'run-1',
      step: {
        id: 's1',
        title: '查了一下',
        tool: 'research',
        status: 'done',
        payload: {},
        result: { evidence, ...(conclusion ? { conclusion } : {}) },
      },
    }) as unknown as StudioOperatorStepEntry

  it('⭐ 按 cite 去重并排序；印证数与编号进摘要', () => {
    const { sources, summary } = toOperatorAnswerSources([
      step(
        [
          {
            cite: 2,
            title: 'b',
            publisher: 'b.test',
            kind: 'text',
            corroboration: 2,
            evidenceRef: '#e2',
          },
          {
            cite: 1,
            title: 'a',
            publisher: 'a.test',
            kind: 'text',
            corroboration: 1,
            evidenceRef: '#e1',
          },
          // 同号重复的那一条不再占一格。
          {
            cite: 1,
            title: 'a again',
            publisher: 'a.test',
            kind: 'text',
            corroboration: 1,
          },
        ],
        '结论一句',
      ),
    ])
    expect(sources.map((item) => item.cite)).toEqual([1, 2])
    expect(summary).toEqual({
      conclusion: '结论一句',
      sourceCount: 2,
      corroborated: 1,
      evidenceRefs: ['#e2', '#e1'],
    })
  })
})
