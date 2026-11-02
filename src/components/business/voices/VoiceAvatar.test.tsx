import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" src={String(props.src)} />
  ),
}))

import { VoiceAvatar, VoiceAvatarButton } from './VoiceAvatar'

describe('VoiceAvatar（声音库方向 A）', () => {
  it('有封面放封面；克隆的写首字；录音是波形', () => {
    const { container, rerender } = render(
      <VoiceAvatar
        cover="https://x.test/c.png"
        fallback="letter"
        name="秧秧"
        size="row"
      />,
    )
    expect(
      container.querySelector('[data-voice-avatar="cover"] img'),
    ).not.toBeNull()
    rerender(
      <VoiceAvatar cover={null} fallback="letter" name="我的声音" size="row" />,
    )
    expect(
      container.querySelector('[data-voice-avatar="letter"]')!.textContent,
    ).toBe('我')
    rerender(
      <VoiceAvatar cover={null} fallback="wave" name="一段录音" size="row" />,
    )
    expect(
      container.querySelector('[data-voice-avatar="wave"] svg'),
    ).not.toBeNull()
  })

  it('头像就是试听键：点一下切换，响着时外圈一道进度环', () => {
    const onToggle = vi.fn()
    const { container, rerender } = render(
      <VoiceAvatarButton
        cover={null}
        fallback="letter"
        name="秧秧"
        size="library"
        playing={false}
        ariaLabel="试听"
        onToggle={onToggle}
      />,
    )
    fireEvent.click(container.querySelector('button')!)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(container.querySelector('circle')).toBeNull()
    rerender(
      <VoiceAvatarButton
        cover={null}
        fallback="letter"
        name="秧秧"
        size="library"
        playing
        progress={0.5}
        ariaLabel="试听"
        onToggle={onToggle}
      />,
    )
    expect(
      container.querySelector('button')!.getAttribute('data-playing'),
    ).toBe('true')
    expect(container.querySelector('circle')).not.toBeNull()
  })
})
