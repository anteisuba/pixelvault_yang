// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_MOBILE_SHELL,
} from '@/constants/studio-assistant-operator'

/**
 * 手机**半屏可拖** Sheet 的几何闸（v2 §4.6 · `ui-defaults.md §6` 移动端配方）。
 *
 * 钉这几件事：
 *  ① 关着时内容整颗不在 DOM 里（面板卸载 = 手机上的「收起」）；
 *  ② 打开时装的就是传进来的那个面板；
 *  ③ **默认开在半屏那一档**（三档里的中间那档；关闭那档 = `open=false`）；
 *  ④ 软键盘弹起（`visualViewport` 变矮）时升到全屏，收起后**回到弹起前那一档**；
 *  ⑤ Sheet 自身高度是 `dvh` 不是 `vh`（半屏靠 vaul 的吸附位移，不靠改高度），
 *     且 `maxHeight` 把 `--keyboard-inset` 扣掉 —— ⛔ 只钉 bottom 不扣高的话，
 *     软键盘会把整张 Sheet 顶出屏幕上沿；
 *  ⑥ 带 `data-operator-keep`（面板内的 Radix portal 靠它认亲）；
 *  ⑦ `modal={false}` 下**没有遮罩** —— 上半截工作台照常看得见、点得到（半屏这
 *     一档的全部理由）；
 *  ⑧ 拖把手**只有一条**（原语自带），⛔ 不在 Sheet 里再画第二条；
 *  ⑨ 关掉再开回到默认那一档 —— 上一次被键盘顶到全屏不记进下一次。
 *
 * ⚠ 吸附档读的是 `data-snap`：vaul 的位移是 rAF 里写的 transform，jsdom 量不出来。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioOperatorMobileSheet } from './StudioOperatorMobileSheet'

class FakeVisualViewport extends EventTarget {
  height = 844
  offsetTop = 0
}

function renderSheet(open: boolean) {
  return render(
    <StudioOperatorMobileSheet open={open} onOpenChange={vi.fn()}>
      <div data-testid="operator-panel-content" />
    </StudioOperatorMobileSheet>,
  )
}

describe('StudioOperatorMobileSheet', () => {
  let viewport: FakeVisualViewport

  beforeEach(() => {
    viewport = new FakeVisualViewport()
    vi.stubGlobal('visualViewport', viewport)
    Object.defineProperty(window, 'innerHeight', {
      value: 844,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('关着时内容整颗不在 DOM 里', () => {
    renderSheet(false)
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-panel-content')).toBeNull()
  })

  it('打开时装的就是传进来的那个面板，且默认停在半屏那一档', () => {
    renderSheet(true)
    expect(screen.getByTestId('operator-panel-content')).toBeTruthy()
    expect(screen.getByTestId('operator-mobile-sheet').dataset.snap).toBe(
      String(STUDIO_OPERATOR_MOBILE_SHELL.halfSnapPoint),
    )
    // 半屏这一档必须真的小于全屏，否则「露出上半截工作台」无从谈起。
    expect(STUDIO_OPERATOR_MOBILE_SHELL.halfSnapPoint).toBeLessThan(
      STUDIO_OPERATOR_MOBILE_SHELL.fullSnapPoint,
    )
  })

  it('软键盘弹起升到全屏，收起后回到原来那一档', () => {
    renderSheet(true)
    const sheet = () => screen.getByTestId('operator-mobile-sheet')

    act(() => {
      viewport.height = 500
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(sheet().dataset.snap).toBe(
      String(STUDIO_OPERATOR_MOBILE_SHELL.fullSnapPoint),
    )

    act(() => {
      viewport.height = 844
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(sheet().dataset.snap).toBe(
      String(STUDIO_OPERATOR_MOBILE_SHELL.halfSnapPoint),
    )
  })

  it('高度走 dvh，且 maxHeight 扣掉软键盘那一段', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    expect(sheet.style.height).toBe(STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight)
    // ⛔ 不用 `100vh`（`ui-defaults.md §6`）。
    expect(STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight).toBe('100dvh')
    expect(sheet.style.maxHeight).toContain('--keyboard-inset')
  })

  it('半屏档露出上半截工作台：`modal={false}` 下 vaul 的遮罩整颗不渲染', () => {
    const { baseElement } = renderSheet(true)
    // 有遮罩 = 上半截被盖住且 body 被锁滚 —— 那正是半屏这一档要消灭的东西。
    expect(baseElement.querySelector('[data-vaul-overlay]')).toBeNull()
  })

  it('顶部那条拖把手由原语提供（⛔ 不在 Sheet 里再画第二条）', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    const handles = sheet.querySelectorAll('.h-1.w-10.rounded-full')
    expect(handles.length).toBe(1)
  })

  it('键盘开着时再来一次遮挡不覆盖「弹起前那一档」', () => {
    renderSheet(true)
    const sheet = () => screen.getByTestId('operator-mobile-sheet')

    act(() => {
      viewport.height = 500
      viewport.dispatchEvent(new Event('resize'))
    })
    // 已经在全屏档了：第二次遮挡必须提前返回，⛔ 不许把 restore 覆写成全屏。
    act(() => {
      viewport.height = 480
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(sheet().dataset.snap).toBe(
      String(STUDIO_OPERATOR_MOBILE_SHELL.fullSnapPoint),
    )

    act(() => {
      viewport.height = 844
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(sheet().dataset.snap).toBe(
      String(STUDIO_OPERATOR_MOBILE_SHELL.halfSnapPoint),
    )
  })

  it('关掉再开回到默认那一档（上一次被顶到全屏不记进下一次）', () => {
    const view = render(
      <StudioOperatorMobileSheet open onOpenChange={vi.fn()}>
        <div data-testid="operator-panel-content" />
      </StudioOperatorMobileSheet>,
    )

    act(() => {
      viewport.height = 500
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(screen.getByTestId('operator-mobile-sheet').dataset.snap).toBe(
      String(STUDIO_OPERATOR_MOBILE_SHELL.fullSnapPoint),
    )

    view.rerender(
      <StudioOperatorMobileSheet open={false} onOpenChange={vi.fn()}>
        <div data-testid="operator-panel-content" />
      </StudioOperatorMobileSheet>,
    )
    act(() => {
      viewport.height = 844
      viewport.dispatchEvent(new Event('resize'))
    })
    view.rerender(
      <StudioOperatorMobileSheet open onOpenChange={vi.fn()}>
        <div data-testid="operator-panel-content" />
      </StudioOperatorMobileSheet>,
    )
    expect(screen.getByTestId('operator-mobile-sheet').dataset.snap).toBe(
      String(STUDIO_OPERATOR_MOBILE_SHELL.halfSnapPoint),
    )
  })

  it('带 data-operator-keep', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    expect(sheet.hasAttribute(STUDIO_OPERATOR_KEEP_OPEN_ATTR)).toBe(true)
  })
})
