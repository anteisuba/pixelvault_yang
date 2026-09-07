import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NodeVideoSurface } from './NodeVideoSurface'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

/**
 * 台账 B7(a)：卡上的视频原本是浏览器**原生 `<video controls>`** —— 灰底 mute
 * 图标 + 原生进度条 + ⋮ 菜单，在 400px 的卡上跟别的什么都不搭；且没有
 * `preload`，`poster` 缺席时窗里就是一块纯黑。
 *
 * ⚠ 这组守的两条都是**有理由的具体属性**，不是风格偏好，别顺手改掉。
 */
describe('NodeVideoSurface', () => {
  function renderSurface(props?: { poster?: string }) {
    const { container } = render(
      <NodeVideoSurface src="https://cdn/x.mp4" poster={props?.poster} />,
    )
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    return video as HTMLVideoElement
  }

  // 原生控件是 B7 的正主 —— 它一回来，这张卡就又是另一套语言了。
  it('不给原生 controls', () => {
    expect(renderSurface().hasAttribute('controls')).toBe(false)
  })

  // 这才是「首帧未加载是纯黑窗」的真正解：没有它浏览器可能一帧都不取，
  // 而 poster（videoThumbnailUrl）不是每条生成链路都会写。
  it('preload=metadata，且没有 poster 时也照给', () => {
    expect(renderSurface().getAttribute('preload')).toBe('metadata')
    expect(
      renderSurface({ poster: 'https://cdn/p.jpg' }).getAttribute('preload'),
    ).toBe('metadata')
  })

  it('卡上只留播放与静音两颗钮，且都带 nodrag', () => {
    render(<NodeVideoSurface src="https://cdn/x.mp4" />)
    // 默认静音：一屏可能同时有好几张视频卡。
    const play = screen.getByRole('button', { name: 'play' })
    const unmute = screen.getByRole('button', { name: 'unmute' })
    // nodrag 掉了的话，点按钮会变成拖卡。
    expect(play).toHaveClass('nodrag')
    expect(unmute).toHaveClass('nodrag')
  })

  it('拿到元数据时回报宽高比', () => {
    const onAspectRatio = vi.fn()
    const { container } = render(
      <NodeVideoSurface
        src="https://cdn/x.mp4"
        onAspectRatio={onAspectRatio}
      />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', {
      value: 1920,
      configurable: true,
    })
    Object.defineProperty(video, 'videoHeight', {
      value: 1080,
      configurable: true,
    })
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(onAspectRatio).toHaveBeenCalledWith(1920 / 1080)
  })
})
