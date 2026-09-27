import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useNodeGenerationFinish } from './use-node-generation-finish'

/**
 * 画布卡的「出图那一拍」（加载态 A）：只有换上了新媒体才走；取消与失败 ⛔ 走。
 */
describe('useNodeGenerationFinish', () => {
  function setup(initial: {
    generating: boolean
    failed: boolean
    mediaUrl: string | undefined
  }) {
    return renderHook((props) => useNodeGenerationFinish(props), {
      initialProps: initial,
    })
  }

  it('换上了新图：先压着（线合拢那一拍），放开后再走完', () => {
    const { result, rerender } = setup({
      generating: false,
      failed: false,
      mediaUrl: 'https://cdn.example.com/old.png',
    })
    rerender({
      generating: true,
      failed: false,
      mediaUrl: 'https://cdn.example.com/old.png',
    })
    expect(result.current.completing).toBe(false)
    rerender({
      generating: false,
      failed: false,
      mediaUrl: 'https://cdn.example.com/new.png',
    })
    expect(result.current.completing).toBe(true)
    expect(result.current.holding).toBe(true)
    act(() => result.current.release())
    expect(result.current.holding).toBe(false)
    expect(result.current.completing).toBe(true)
    act(() => result.current.finish())
    expect(result.current.completing).toBe(false)
  })

  it('取消（地址没换）：⛔ 假装走满一圈', () => {
    const { result, rerender } = setup({
      generating: true,
      failed: false,
      mediaUrl: 'https://cdn.example.com/old.png',
    })
    rerender({
      generating: false,
      failed: false,
      mediaUrl: 'https://cdn.example.com/old.png',
    })
    expect(result.current.completing).toBe(false)
  })

  it('失败：不走出图那一拍（线停住变灰由进度层自己画）', () => {
    const { result, rerender } = setup({
      generating: true,
      failed: false,
      mediaUrl: undefined,
    })
    rerender({ generating: false, failed: true, mediaUrl: undefined })
    expect(result.current.completing).toBe(false)
  })

  it('空卡第一次出图也走（开始时没有地址）', () => {
    const { result, rerender } = setup({
      generating: true,
      failed: false,
      mediaUrl: undefined,
    })
    rerender({
      generating: false,
      failed: false,
      mediaUrl: 'https://cdn.example.com/first.png',
    })
    expect(result.current.holding).toBe(true)
  })
})
