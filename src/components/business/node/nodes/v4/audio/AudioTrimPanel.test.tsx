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

const selectionWindow = (container: HTMLElement) =>
  container.querySelector('[data-audio-trim-window]') as HTMLElement

/** jsdom 里 `getBoundingClientRect` 全是 0 —— 拖动要真的坐标系，桩掉轨道那一格。 */
function stubTrack(container: HTMLElement, width = 400) {
  const track = container.querySelector(
    '[data-audio-trim-track]',
  ) as HTMLElement
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      width,
      right: width,
      top: 0,
      height: NODE_V4_AUDIO_TRIM.trackHeight,
    }) as DOMRect
  return track
}

/** 确认一次，读回它吐出来的那对入出点。 */
function confirmedRange(
  container: HTMLElement,
  onConfirm: ReturnType<typeof vi.fn>,
) {
  fireEvent.click(container.querySelector('[data-audio-trim-confirm]')!)
  return onConfirm.mock.calls.at(-1)?.[0] as {
    startSec: number
    endSec: number
  }
}

describe('AudioTrimPanel（spec §4，画板 AudioTrim 2026-09-10）', () => {
  it('一开就是整条：淡波形 + 一扇亮窗 + 两端方括号手柄 + 窗顶时长', () => {
    const { container } = setup()
    expect(container.querySelector('[data-audio-trim-track]')).not.toBeNull()
    expect(
      container.querySelector('[data-audio-trim-bars="faint"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-audio-trim-bars="selected"]'),
    ).not.toBeNull()
    expect(selectionWindow(container)).not.toBeNull()
    expect(
      container.querySelector('[data-audio-trim-selection]')?.textContent,
    ).toBe('10.0s')
    expect(handle(container, 'start').getAttribute('aria-valuenow')).toBe('0')
    expect(handle(container, 'end').getAttribute('aria-valuenow')).toBe('10')
  })

  it('⛔ 旧的入出点读数框与「取消」键都没了（只剩当前 / 选区时长 + 区间 + 确认）', () => {
    const { container } = setup()
    expect(container.querySelector('[data-audio-trim-readout]')).toBeNull()
    expect(container.querySelector('[data-audio-trim-cancel]')).toBeNull()
    expect(container.querySelector('[data-audio-trim-clock]')).not.toBeNull()
    expect(container.querySelector('[data-audio-trim-range]')).not.toBeNull()
  })

  it('拖手柄改入出点（10s / 400px：100px = 2.5s）', () => {
    const { container, onConfirm } = setup()
    stubTrack(container)
    fireEvent.pointerDown(handle(container, 'start'), { clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 100 })
    fireEvent.pointerUp(window, { clientX: 100 })
    expect(confirmedRange(container, onConfirm)).toEqual({
      startSec: 2.5,
      endSec: 10,
    })
  })

  it('拖窗身 = 整体平移，选区时长一秒不变', () => {
    const { container, onConfirm } = setup()
    stubTrack(container)
    // 先拖出一扇 5s 的窗（40px → 240px = 1s → 6s）。
    const track = stubTrack(container)
    fireEvent.pointerDown(track, { clientX: 40 })
    fireEvent.pointerMove(window, { clientX: 240 })
    fireEvent.pointerUp(window, { clientX: 240 })
    expect(confirmedRange(container, onConfirm)).toEqual({
      startSec: 1,
      endSec: 6,
    })
    // 再抓窗身右移 80px = 2s：两端各 +2s，时长仍是 5s。
    fireEvent.pointerDown(selectionWindow(container), { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 180 })
    fireEvent.pointerUp(window, { clientX: 180 })
    const moved = confirmedRange(container, onConfirm)
    expect(moved).toEqual({ startSec: 3, endSec: 8 })
    expect(moved.endSec - moved.startSec).toBe(5)
  })

  it('拖窗身撞到末尾就停住，⛔ 不把选区压短', () => {
    const { container, onConfirm } = setup()
    stubTrack(container)
    const track = stubTrack(container)
    fireEvent.pointerDown(track, { clientX: 40 })
    fireEvent.pointerMove(window, { clientX: 240 })
    fireEvent.pointerUp(window, { clientX: 240 })
    fireEvent.pointerDown(selectionWindow(container), { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 900 })
    fireEvent.pointerUp(window, { clientX: 900 })
    expect(confirmedRange(container, onConfirm)).toEqual({
      startSec: 5,
      endSec: 10,
    })
  })

  it('在淡波形上按下再挪 = 拖出新窗（替换旧窗）', () => {
    const { container, onConfirm } = setup()
    const track = stubTrack(container)
    fireEvent.pointerDown(track, { clientX: 40 })
    fireEvent.pointerMove(window, { clientX: 240 })
    fireEvent.pointerUp(window, { clientX: 240 })
    expect(confirmedRange(container, onConfirm)).toEqual({
      startSec: 1,
      endSec: 6,
    })
  })

  it('按下没挪 = 只挪播放头，⛔ 不抹掉已经调好的入出点', () => {
    const { container, onConfirm } = setup()
    const track = stubTrack(container)
    fireEvent.keyDown(handle(container, 'start'), {
      key: 'ArrowRight',
      shiftKey: true,
    })
    fireEvent.pointerDown(track, { clientX: 200 })
    fireEvent.pointerUp(window, { clientX: 200 })
    expect(confirmedRange(container, onConfirm)).toEqual({
      startSec: 1,
      endSec: 10,
    })
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

  it('「确认」把当下这对入出点交给裁剪管线', () => {
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

  it('Esc 退出裁剪（⛔ 不留一条关不掉的裁剪条）', () => {
    const { container, onCancel } = setup()
    fireEvent.keyDown(container.querySelector('[data-audio-trim-panel]')!, {
      key: 'Escape',
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
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

  it('空格试听选区（⛔ 不让空格落成「按下焦点那颗键」）', () => {
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined)
    const { container } = setup()
    fireEvent.keyDown(container.querySelector('[data-audio-trim-panel]')!, {
      key: ' ',
    })
    expect(play).toHaveBeenCalledTimes(1)
    play.mockRestore()
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

  it('⌘Z 退回上一步；栈空时什么都不做（⛔ 不退成 0）', () => {
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
