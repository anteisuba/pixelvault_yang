// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StudioOperatorWebVideoPlayer } from './StudioOperatorWebVideoPlayer'

/**
 * 面板里的视频播放器 · **放大**（owner 2026-10-16 卡上选「页面中间大窗口」）。
 *
 * 钉这几件事：
 *  ① 整张卡是 `popover="auto"` + `operator-video-stage`，放大 = `togglePopover()`
 *     同一个元素进顶层，⛔ 不换 iframe（不重载、接着播）；
 *  ② 开合以浏览器的 `toggle` 为准（点旁边 / Esc 收回也走它）：键换成「收回」、
 *     面板里留一块占位，占位上的「收回」也能收；
 *  ③ 放大时 Esc 在 window 捕获阶段拦下，⛔ 传不到画布 Esc 梯 / 手机 Sheet；
 *  ④ 不认 popover 的浏览器（jsdom 也是）不画放大键。
 */

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}))

const VIDEO = {
  url: 'https://www.bilibili.com/video/BV1ji421e7nM',
  title: '【性转】马尔福小姐的一分钟变装',
  platform: 'bilibili' as const,
  domain: 'bilibili.com',
}

type PopoverHost = HTMLElement & { __open?: boolean }

/** jsdom 没有 popover：补一个只会翻状态、发 `toggle` 的替身（浏览器里 toggle 是排队发的，这里同步发）。 */
function stubPopover() {
  const proto = HTMLElement.prototype
  const had = Object.prototype.hasOwnProperty.call(proto, 'togglePopover')
  const original = proto.togglePopover
  proto.togglePopover = function (this: PopoverHost) {
    this.__open = !this.__open
    const event = new Event('toggle')
    Object.assign(event, { newState: this.__open ? 'open' : 'closed' })
    this.dispatchEvent(event)
    return this.__open
  }
  return () => {
    if (had) proto.togglePopover = original
    else Reflect.deleteProperty(proto, 'togglePopover')
  }
}

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
})

describe('视频播放器 · 放大成页面中间大窗口', () => {
  it('不认 popover：没有放大键，播放器照常是一张卡', () => {
    render(<StudioOperatorWebVideoPlayer video={VIDEO} onClose={() => {}} />)
    const stage = screen.getByTestId('operator-web-video-player')
    expect(stage.getAttribute('popover')).toBe('auto')
    expect(stage.className).toContain('operator-video-stage')
    expect(screen.queryByTestId('operator-web-video-enlarge')).toBeNull()
  })

  it('⭐ 放大 = 同一个元素 togglePopover，iframe 不换；收回走键或占位', () => {
    restore = stubPopover()
    render(<StudioOperatorWebVideoPlayer video={VIDEO} onClose={() => {}} />)
    const iframe = screen.getByTestId('operator-web-video-iframe')
    const enlarge = screen.getByTestId('operator-web-video-enlarge')
    expect(enlarge.getAttribute('aria-label')).toBe('web.videoEnlarge')
    expect(enlarge.getAttribute('aria-pressed')).toBe('false')

    act(() => {
      fireEvent.click(enlarge)
    })
    const stage = screen.getByTestId('operator-web-video-player')
    expect(stage.getAttribute('data-enlarged')).toBe('true')
    expect(screen.getByTestId('operator-web-video-iframe')).toBe(iframe)
    expect(enlarge.getAttribute('aria-label')).toBe('web.videoShrink')
    expect(enlarge.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByTestId('operator-web-video-enlarged').textContent,
    ).toContain('web.videoEnlarged')

    // 占位上的「收回」。
    act(() => {
      fireEvent.click(
        screen.getByTestId('operator-web-video-shrink-placeholder'),
      )
    })
    expect(stage.getAttribute('data-enlarged')).toBe('false')
    expect(screen.queryByTestId('operator-web-video-enlarged')).toBeNull()
    expect(screen.getByTestId('operator-web-video-iframe')).toBe(iframe)
  })

  it('⭐ 放大时 Esc 不往下传（画布 Esc 梯 / 手机 Sheet 不跟着收）；收回后照常', () => {
    restore = stubPopover()
    const outer = vi.fn()
    window.addEventListener('keydown', outer)
    try {
      render(<StudioOperatorWebVideoPlayer video={VIDEO} onClose={() => {}} />)
      act(() => {
        fireEvent.click(screen.getByTestId('operator-web-video-enlarge'))
      })
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(outer).not.toHaveBeenCalled()

      act(() => {
        fireEvent.click(screen.getByTestId('operator-web-video-enlarge'))
      })
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(outer).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', outer)
    }
  })

  it('浏览器自己收回（点旁边 / Esc）也认：键与占位跟着回来', () => {
    restore = stubPopover()
    render(<StudioOperatorWebVideoPlayer video={VIDEO} onClose={() => {}} />)
    act(() => {
      fireEvent.click(screen.getByTestId('operator-web-video-enlarge'))
    })
    const stage = screen.getByTestId('operator-web-video-player') as PopoverHost
    act(() => {
      stage.__open = false
      const event = new Event('toggle')
      Object.assign(event, { newState: 'closed' })
      stage.dispatchEvent(event)
    })
    expect(stage.getAttribute('data-enlarged')).toBe('false')
    expect(screen.queryByTestId('operator-web-video-enlarged')).toBeNull()
  })
})
