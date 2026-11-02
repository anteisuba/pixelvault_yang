// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import type { HTMLAttributeReferrerPolicy } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  StudioOperatorAnswerSources,
  toOperatorAnswerSources,
  type StudioOperatorAnswerSource,
} from './StudioOperatorAnswerSources'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'

/**
 * **回答底下那两样**的回归闸（56b 切片 1）。
 *
 * 钉四件事（P4 第 14 项：一行胶囊 + 行尾 ⋯）：
 *  ① 一条资料一颗胶囊，站名在、标题在悬停里，`url` 缺席时⛔ 不渲染成链接；
 *  ② ⛔ 没有媒体小条了（并进找到的图那一块）；
 *  ③ 标成视频的胶囊：能嵌就**在面板里播**，嵌不了才是链接；
 *  ④ 高亮认的是 `cite` 而不是下标；「深入调查 / 钉住」在 ⋯ 里。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    referrerPolicy,
    onError,
    'data-testid': testId,
  }: {
    alt: string
    src: string
    referrerPolicy?: HTMLAttributeReferrerPolicy
    onError?: () => void
    'data-testid'?: string
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 测试替身
    <img
      alt={alt}
      src={src}
      referrerPolicy={referrerPolicy}
      onError={onError}
      data-testid={testId}
    />
  ),
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
  },
  {
    cite: 3,
    title: '三层光叠法拆解',
    url: 'https://www.bilibili.com/video/BV1',
    publisher: 'bilibili.com',
    kind: 'video',
  },
  {
    cite: 4,
    title: 'danbooru 共现标签',
    publisher: 'danbooru.donmai.us',
    kind: 'tags',
  },
]

describe('StudioOperatorAnswerSources', () => {
  it('一条资料一颗胶囊；标题在悬停里；没有 url 的那条⛔ 不是链接', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    const cards = screen.getAllByTestId('operator-answer-source-card')
    expect(cards).toHaveLength(4)
    expect(cards[0]?.tagName).toBe('A')
    expect(cards[3]?.tagName).toBe('SPAN')
    expect(cards[0]?.textContent).toContain('zhihu.com')
    expect(cards[0]?.textContent).not.toContain('雨夜霓虹')
    expect(cards[0]?.getAttribute('title')).toBe(SOURCES[0]?.title)
  })

  it('⛔ 没有媒体小条', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    expect(screen.queryByTestId('operator-answer-media')).toBeNull()
  })

  it('嵌不了的视频（`BV1` 不是完整稿件号）仍是链接', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    const cards = screen.getAllByTestId('operator-answer-source-card')
    expect(cards[2]?.tagName).toBe('A')
    expect(screen.queryByTestId('operator-answer-source-play')).toBeNull()
  })

  const PLAYABLE: StudioOperatorAnswerSource[] = [
    {
      cite: 1,
      title: '雨夜霓虹 · 讲解',
      url: 'https://zhihu.com/a',
      publisher: 'zhihu.com',
      kind: 'text',
    },
    {
      cite: 2,
      title: 'Changli PV',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      publisher: 'youtube.com',
      kind: 'video',
    },
    {
      cite: 3,
      title: '动画短片 | 今昔',
      url: 'https://www.bilibili.com/video/BV1ji421e7nM',
      publisher: 'bilibili.com',
      kind: 'video',
    },
  ]

  it('⭐ 能嵌的视频胶囊在面板里播（同一个播放器），再点 = 收起', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(<StudioOperatorAnswerSources sources={PLAYABLE} activeCite={null} />)
    const cards = screen.getAllByTestId('operator-answer-source-card')
    expect(cards[0]?.tagName).toBe('A')
    expect(cards[1]?.tagName).toBe('BUTTON')
    expect(screen.getAllByTestId('operator-answer-source-play')).toHaveLength(2)
    fireEvent.click(cards[1] as HTMLElement)
    expect(open).not.toHaveBeenCalled()
    const iframe = screen.getByTestId('operator-web-video-iframe')
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-top-navigation')
    expect(cards[1]?.getAttribute('aria-pressed')).toBe('true')
    // 换一条 = 同一个播放器换地址，⛔ 不叠第二个。
    fireEvent.click(cards[2] as HTMLElement)
    expect(screen.getAllByTestId('operator-web-video-player')).toHaveLength(1)
    expect(
      screen.getByTestId('operator-web-video-iframe').getAttribute('src'),
    ).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1ji421e7nM&autoplay=0',
    )
    fireEvent.click(cards[2] as HTMLElement)
    expect(screen.queryByTestId('operator-web-video-player')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('⭐ 胶囊是站点自己的 favicon（不带 Referer），取不到 / 没地址回到地球', () => {
    render(<StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />)
    const favicons = screen.getAllByTestId('operator-answer-source-favicon')
    expect(favicons.map((icon) => icon.getAttribute('src'))).toEqual([
      'https://zhihu.com/favicon.ico',
      'https://pixiv.net/favicon.ico',
      'https://www.bilibili.com/favicon.ico',
    ])
    expect(favicons[0]?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(screen.getAllByTestId('operator-answer-source-globe')).toHaveLength(
      1,
    )

    fireEvent.error(favicons[0] as HTMLElement)
    expect(
      screen.getAllByTestId('operator-answer-source-favicon'),
    ).toHaveLength(2)
    expect(screen.getAllByTestId('operator-answer-source-globe')).toHaveLength(
      2,
    )
  })

  it('⭐ 深入调查 / 钉住收在行尾 ⋯ 里；都没给就不画 ⋯', async () => {
    const onDeepResearch = vi.fn()
    const onTogglePin = vi.fn()
    const { rerender } = render(
      <StudioOperatorAnswerSources
        sources={SOURCES}
        activeCite={null}
        onDeepResearch={onDeepResearch}
        onTogglePin={onTogglePin}
        receiptLabel="搜了 6 条"
      />,
    )
    expect(screen.queryByTestId('operator-answer-deep-research')).toBeNull()
    expect(screen.getByTestId('operator-answer-receipt').textContent).toBe(
      '搜了 6 条',
    )
    fireEvent.pointerDown(screen.getByTestId('operator-answer-more'), {
      button: 0,
      pointerType: 'mouse',
    })
    await waitFor(() =>
      expect(screen.getByTestId('operator-answer-pin')).toBeTruthy(),
    )
    fireEvent.click(screen.getByTestId('operator-answer-deep-research'))
    expect(onDeepResearch).toHaveBeenCalledTimes(1)

    rerender(
      <StudioOperatorAnswerSources sources={SOURCES} activeCite={null} />,
    )
    expect(screen.queryByTestId('operator-answer-more')).toBeNull()
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

  it('⭐ 有一步说「X 没搜、但配了 Grok」才给 Grok 按钮', () => {
    const withX = (grokKey: boolean): StudioOperatorStepEntry => {
      const entry = step([])
      return {
        ...entry,
        step: {
          ...entry.step,
          result: { evidence: [], xNotSearched: { grokKey } },
        },
      } as unknown as StudioOperatorStepEntry
    }
    expect(toOperatorAnswerSources([step([])]).offerGrokForX).toBe(false)
    // 没配 Grok：只在正文里说清楚，⛔ 不给按不动的按钮。
    expect(toOperatorAnswerSources([withX(false)]).offerGrokForX).toBe(false)
    expect(toOperatorAnswerSources([withX(true)]).offerGrokForX).toBe(true)
  })
})
