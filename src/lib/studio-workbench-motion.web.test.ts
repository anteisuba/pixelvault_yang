/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  flyTileFromGenerate,
  landRecipeInComposer,
} from '@/lib/studio-workbench-motion'

/**
 * 工作台出图动效（owner 2026-10-07）：纯装饰、一定收得回、减少动效时不动。
 */

const rect = (left: number, top: number, size: number) =>
  ({ left, top, width: size, height: size }) as DOMRect

function stubMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  })) as unknown as typeof window.matchMedia
}

let cancel: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers()
  cancel = vi.fn()
  HTMLElement.prototype.animate = vi.fn(
    () => ({ cancel }) as unknown as Animation,
  ) as unknown as typeof HTMLElement.prototype.animate
  stubMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function mountGenerateAndTile() {
  const button = document.createElement('button')
  button.setAttribute('data-studio-generate', '')
  button.getBoundingClientRect = () => rect(500, 600, 36)
  const tile = document.createElement('div')
  tile.getBoundingClientRect = () => rect(100, 100, 180)
  document.body.append(button, tile)
  return tile
}

describe('flyTileFromGenerate', () => {
  it('格子从生成键的位置缩着飞回自己的位置，播完把动画收掉', () => {
    const tile = mountGenerateAndTile()
    flyTileFromGenerate(tile, 0)
    expect(tile.animate).toHaveBeenCalledTimes(1)
    const [frames] = vi.mocked(tile.animate).mock.calls[0]
    expect((frames as Keyframe[])[0].transform).toContain('scale(0.2)')

    vi.runAllTimers()
    expect(cancel).toHaveBeenCalled()
  })

  it('减少动效时不动', () => {
    stubMotion(true)
    const tile = mountGenerateAndTile()
    flyTileFromGenerate(tile, 0)
    expect(tile.animate).not.toHaveBeenCalled()
  })

  it('找不到生成键（别的宿主）就不飞', () => {
    const tile = document.createElement('div')
    document.body.append(tile)
    flyTileFromGenerate(tile, 0)
    expect(tile.animate).not.toHaveBeenCalled()
  })
})

describe('landRecipeInComposer', () => {
  it('输入框卡顶一下、提示词由糊变清', () => {
    const card = document.createElement('div')
    card.setAttribute('data-studio-composer', '')
    const prompt = document.createElement('div')
    prompt.id = 'studio-prompt'
    card.append(prompt)
    document.body.append(card)

    landRecipeInComposer()
    expect(card.animate).toHaveBeenCalled()
    expect(vi.mocked(HTMLElement.prototype.animate).mock.contexts).toContain(
      prompt,
    )
  })
})
