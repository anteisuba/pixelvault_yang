// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantOperatorWebVideo } from '@/types/assistant-operator'

import { StudioOperatorWebVideoRow } from './StudioOperatorWebVideoRow'

/**
 * **找到的视频**那一排的回归闸（搜索期第二片）。
 *
 * 钉这几件事：
 *  ① 还在搜 = 同形状灰卡；一条都没找到 = 整排不画；头上一行「搜索视频：… · N 个」；
 *  ② 一张卡：封面⛔ 不带我们的 Referer、左上平台角标、右下时长（取不到不画）、标题、频道；
 *  ③ 四家点开**在面板里播**：官方嵌入地址 + sandbox（⛔ allow-top-navigation）+ 全屏；
 *     再点 / 关上 = 收起；「去原站」新窗口；
 *  ④ 别的站 / 认不出稿件号：新窗口链接（`noopener noreferrer`），⛔ 不嵌。
 */

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}))

const YOUTUBE: AssistantOperatorWebVideo = {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Wuthering Waves — Changli PV',
  platform: 'youtube',
  channel: 'Wuthering Waves',
  domain: 'youtube.com',
  durationSeconds: 209,
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
}

const BILIBILI: AssistantOperatorWebVideo = {
  url: 'https://www.bilibili.com/video/BV1ji421e7nM',
  title: '《鸣潮》动画短片 | 今昔',
  platform: 'bilibili',
  domain: 'bilibili.com',
}

const UNKNOWN_SITE: AssistantOperatorWebVideo = {
  url: 'https://www.tiktok.com/@kuro/video/123',
  title: 'Some clip',
  platform: 'other',
  domain: 'tiktok.com',
}

type RowProps = Parameters<typeof StudioOperatorWebVideoRow>[0]

function renderRow(
  videos: RowProps['videos'],
  overrides: Partial<RowProps> = {},
) {
  return render(
    <StudioOperatorWebVideoRow
      entryId="run-1:step-2"
      query="长离 PV"
      videos={videos}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
})

describe('找到的视频 · 一排卡片（搜索期第二片）', () => {
  it('还在搜 = 同形状的灰卡（按要的条数，最多 8 张），⛔ 没有卡片', () => {
    renderRow(null, { placeholderCount: 5 })
    const row = screen.getByTestId('operator-web-videos')
    expect(row.getAttribute('data-state')).toBe('loading')
    expect(row.getAttribute('aria-busy')).toBe('true')
    expect(screen.getAllByTestId('operator-web-video-skeleton')).toHaveLength(5)
    expect(screen.queryByTestId('operator-web-video-card')).toBeNull()
  })

  it('一条都没找到 = 整排不画', () => {
    renderRow([])
    expect(screen.queryByTestId('operator-web-videos')).toBeNull()
  })

  it('头上一行写搜了什么、找到几个；一张卡：封面 / 平台 / 时长 / 标题 / 频道', () => {
    renderRow([YOUTUBE, BILIBILI, UNKNOWN_SITE])
    expect(screen.getByTestId('operator-web-videos-caption').textContent).toBe(
      'web.videosFound {"query":"长离 PV","count":3}',
    )

    const card = screen.getAllByTestId('operator-web-video-card')[0]!
    const cover = card.querySelector('img')
    expect(cover?.getAttribute('src')).toBe(YOUTUBE.thumbnailUrl)
    expect(cover?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(card.textContent).toContain('Wuthering Waves — Changli PV')
    expect(card.textContent).toContain('Wuthering Waves')

    expect(
      screen
        .getAllByTestId('operator-web-video-platform')
        .map((badge) => badge.textContent),
    ).toEqual([
      'web.videoPlatform.youtube',
      'web.videoPlatform.bilibili',
      // 别的站写域名。
      'tiktok.com',
    ])
    // 时长取不到的整枚不画（⛔ 不写「0:00」）。
    expect(
      screen
        .getAllByTestId('operator-web-video-duration')
        .map((badge) => badge.textContent),
    ).toEqual(['3:29'])
    // 没有封面的画占位，⛔ 破图标。
    expect(
      screen.getAllByTestId('operator-web-video-cover-unavailable'),
    ).toHaveLength(2)
  })

  it('⭐ 点 YouTube 卡：在面板里播 youtube-nocookie，sandbox 不放行顶层导航，全屏放行', () => {
    renderRow([YOUTUBE, BILIBILI])
    expect(screen.queryByTestId('operator-web-video-player')).toBeNull()

    const [youtube] = screen.getAllByTestId('operator-web-video-card')
    fireEvent.click(youtube!)

    const iframe = screen.getByTestId('operator-web-video-iframe')
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
    const sandbox = iframe.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(iframe.hasAttribute('allowfullscreen')).toBe(true)
    expect(iframe.getAttribute('allow')).toContain('fullscreen')
    expect(iframe.getAttribute('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(youtube!.getAttribute('aria-pressed')).toBe('true')

    // 「去原站」新窗口，⛔ 不带页面句柄。
    const source = screen.getByTestId('operator-web-video-open-source')
    expect(source.getAttribute('href')).toBe(YOUTUBE.url)
    expect(source.getAttribute('target')).toBe('_blank')
    expect(source.getAttribute('rel')).toBe('noopener noreferrer')

    // 换一支：同一个播放器换地址；B站带 autoplay=0。
    fireEvent.click(screen.getAllByTestId('operator-web-video-card')[1]!)
    expect(
      screen.getByTestId('operator-web-video-iframe').getAttribute('src'),
    ).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1ji421e7nM&autoplay=0',
    )

    // 关上。
    fireEvent.click(screen.getByTestId('operator-web-video-close'))
    expect(screen.queryByTestId('operator-web-video-player')).toBeNull()
  })

  it('再点正在播的那张 = 收起', () => {
    renderRow([YOUTUBE])
    const card = screen.getByTestId('operator-web-video-card')
    fireEvent.click(card)
    expect(screen.getByTestId('operator-web-video-player')).toBeTruthy()
    fireEvent.click(card)
    expect(screen.queryByTestId('operator-web-video-player')).toBeNull()
  })

  it('⭐ 别的站：新窗口链接（noopener noreferrer），⛔ 不嵌', () => {
    renderRow([UNKNOWN_SITE])
    expect(screen.queryByTestId('operator-web-video-card')).toBeNull()
    const link = screen.getByTestId('operator-web-video-link')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe(UNKNOWN_SITE.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    fireEvent.click(link)
    expect(screen.queryByTestId('operator-web-video-iframe')).toBeNull()
  })

  it('认得出平台、认不出稿件号（b23.tv 短链）：同样新窗口', () => {
    renderRow([
      {
        url: 'https://b23.tv/AbCdEf1',
        title: '短链',
        platform: 'bilibili',
        domain: 'b23.tv',
      },
    ])
    expect(
      screen.getByTestId('operator-web-video-link').getAttribute('href'),
    ).toBe('https://b23.tv/AbCdEf1')
  })
})
