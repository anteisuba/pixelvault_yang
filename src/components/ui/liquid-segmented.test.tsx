import { StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { LiquidSegmented } from './liquid-segmented'

const TAB_WIDTH = 50

describe('LiquidSegmented', () => {
  beforeAll(() => {
    // jsdom 不排版：每一格按 50 宽横排，轨道 = 两格。
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute('role') === 'tab' ? TAB_WIDTH : TAB_WIDTH * 2
      },
    )
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(
      function (this: HTMLElement) {
        if (this.getAttribute('role') !== 'tab') return 0
        return (
          [...(this.parentElement?.children ?? [])].indexOf(this) * TAB_WIDTH
        )
      },
    )
  })
  afterAll(() => vi.restoreAllMocks())

  /**
   * owner 2026-09-26「角色 / 画师」整条都是黑的：StrictMode 再挂载把首次量完排的
   * 那一帧取消了，裁剪停在全 0。⛔ 这条红 = 选中块又铺满了整条轨道。
   */
  it('StrictMode 下选中块只盖住选中的那一格', async () => {
    const { container } = render(
      <StrictMode>
        <LiquidSegmented
          items={[
            { value: 'character', label: '角色' },
            { value: 'artist', label: '画师' },
          ]}
          value="character"
          onChange={() => {}}
          ariaLabel="kind"
        />
      </StrictMode>,
    )
    const fill = container.querySelector<HTMLElement>('[aria-hidden]')!
    await waitFor(() =>
      expect(fill.style.clipPath).toBe(
        `inset(0 ${TAB_WIDTH}px 0 0px round 999px)`,
      ),
    )
  })
})
