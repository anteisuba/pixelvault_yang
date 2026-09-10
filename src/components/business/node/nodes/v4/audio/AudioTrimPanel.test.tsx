import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { NODE_V4_AUDIO_TRIM } from '@/constants/node-studio'

import { AudioTrimPanel } from './AudioTrimPanel'

function setup(
  props: Partial<React.ComponentProps<typeof AudioTrimPanel>> = {},
) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  const view = render(
    <AudioTrimPanel
      url="https://cdn.test/a.mp3"
      durationSec={10}
      seed="https://cdn.test/a.mp3"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { ...view, onCancel, onConfirm }
}

const handle = (container: HTMLElement, which: 'start' | 'end') =>
  container.querySelector(`[data-audio-trim-handle="${which}"]`)!

describe('AudioTrimPanel（spec §4，画板 AudioTrim）', () => {
  it('一开面板选区就是整段：大波形 + 两端手柄 + 播放头 + 三个读数', () => {
    const { container } = setup()
    expect(container.querySelector('[data-audio-trim-track]')).not.toBeNull()
    expect(container.querySelector('[data-audio-trim-playhead]')).not.toBeNull()
    expect(handle(container, 'start').getAttribute('aria-valuenow')).toBe('0')
    expect(handle(container, 'end').getAttribute('aria-valuenow')).toBe('10')
    for (const readout of ['in', 'out', 'selection']) {
      expect(
        container.querySelector(`[data-audio-trim-readout="${readout}"]`),
      ).not.toBeNull()
    }
  })

  it('键盘也拖得动手柄：一格 0.1s，Shift 一格 1s（AA）', () => {
    const { container } = setup()
    fireEvent.keyDown(handle(container, 'start'), {
      key: 'ArrowRight',
      shiftKey: true,
    })
    expect(handle(container, 'start').getAttribute('aria-valuenow')).toBe('1')
    fireEvent.keyDown(handle(container, 'end'), { key: 'ArrowLeft' })
    expect(handle(container, 'end').getAttribute('aria-valuenow')).toBe('9.9')
  })

  it('两端夹住：入点顶不过出点，中间至少留一个最短选区', () => {
    const { container } = setup()
    for (let i = 0; i < 200; i += 1) {
      fireEvent.keyDown(handle(container, 'start'), {
        key: 'ArrowRight',
        shiftKey: true,
      })
    }
    expect(handle(container, 'start').getAttribute('aria-valuenow')).toBe(
      String(10 - NODE_V4_AUDIO_TRIM.minSelectionSec),
    )
  })

  it('「裁剪为新版本」吐的是当下这对入出点', () => {
    const { container, onConfirm } = setup()
    fireEvent.keyDown(handle(container, 'start'), {
      key: 'ArrowRight',
      shiftKey: true,
    })
    fireEvent.click(container.querySelector('[data-audio-trim-confirm]')!)
    expect(onConfirm).toHaveBeenCalledWith({ startSec: 1, endSec: 10 })
  })

  it('正在切 / 传时确认键按不动（⛔ 不重复落两版）', () => {
    const { container } = setup({ busy: true })
    expect(container.querySelector('[data-audio-trim-confirm]')).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('Esc 与「取消」都退出裁剪（⛔ 不留一个关不掉的面板）', () => {
    const { container, onCancel } = setup()
    fireEvent.keyDown(container.querySelector('[data-audio-trim-panel]')!, {
      key: 'Escape',
    })
    fireEvent.click(container.querySelector('[data-audio-trim-cancel]')!)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('I / O 把播放头收成入 / 出点', () => {
    const { container } = setup()
    const panel = container.querySelector('[data-audio-trim-panel]')!
    // 播放头还在 0：按 O 会被夹回「入点 + 最短选区」。
    fireEvent.keyDown(panel, { key: 'o' })
    expect(handle(container, 'end').getAttribute('aria-valuenow')).toBe(
      String(NODE_V4_AUDIO_TRIM.minSelectionSec),
    )
  })

  it('时长晚一步回来（loadedmetadata）时出点跟到新的末尾', () => {
    const { container, rerender } = setup({ durationSec: 0 })
    expect(handle(container, 'end').getAttribute('aria-valuenow')).toBe('0')
    rerender(
      <AudioTrimPanel
        url="https://cdn.test/a.mp3"
        durationSec={12}
        seed="https://cdn.test/a.mp3"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(handle(container, 'end').getAttribute('aria-valuenow')).toBe('12')
  })
})

describe('波形上拖出选区 / ⌘Z 撤上一步（画板 AudioTrim 的交互两句）', () => {
  /** jsdom 里 `getBoundingClientRect` 全是 0 —— 拖选区要真的坐标系，桩掉轨道那一格。 */
  function stubTrack(container: HTMLElement, width = 400) {
    const track = container.querySelector(
      '[data-audio-trim-track]',
    ) as HTMLElement
    track.getBoundingClientRect = () =>
      ({ left: 0, width, right: width, top: 0, height: 96 }) as DOMRect
    return track
  }

  it('按下再挪 = 拖出一段选区（10s / 400px：100px = 2.5s）', () => {
    const { container, onConfirm } = setup()
    const track = stubTrack(container)
    fireEvent.pointerDown(track, { clientX: 40 })
    fireEvent.pointerMove(window, { clientX: 240 })
    fireEvent.pointerUp(window, { clientX: 240 })
    fireEvent.click(container.querySelector('[data-audio-trim-confirm]')!)
    expect(onConfirm).toHaveBeenCalledWith({ startSec: 1, endSec: 6 })
  })

  it('按下没挪 = 只放播放头，⛔ 不抹掉已经调好的入出点', () => {
    const { container, onConfirm } = setup()
    const track = stubTrack(container)
    fireEvent.keyDown(handle(container, 'start'), {
      key: 'ArrowRight',
      shiftKey: true,
    })
    fireEvent.pointerDown(track, { clientX: 200 })
    fireEvent.pointerUp(window, { clientX: 200 })
    fireEvent.click(container.querySelector('[data-audio-trim-confirm]')!)
    expect(onConfirm).toHaveBeenCalledWith({ startSec: 1, endSec: 10 })
  })

  it('⌘Z 退回上一步手柄；栈空时什么都不做（⛔ 不退成 0）', () => {
    const { container } = setup()
    const panel = container.querySelector('[data-audio-trim-panel]')!
    fireEvent.keyDown(handle(container, 'start'), {
      key: 'ArrowRight',
      shiftKey: true,
    })
    expect(handle(container, 'start').getAttribute('aria-valuenow')).toBe('1')
    fireEvent.keyDown(panel, { key: 'z', metaKey: true })
    expect(handle(container, 'start').getAttribute('aria-valuenow')).toBe('0')
    fireEvent.keyDown(panel, { key: 'z', metaKey: true })
    expect(handle(container, 'start').getAttribute('aria-valuenow')).toBe('0')
    expect(handle(container, 'end').getAttribute('aria-valuenow')).toBe('10')
  })
})
