import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { useOpenKeySettings } from './use-open-key-settings'

const mockPush = vi.hoisted(() => vi.fn())

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/studio/node',
}))

describe('useOpenKeySettings', () => {
  it('把「配置渠道与 key」送到 /settings/keys，并带上来处', () => {
    const { result } = renderHook(() => useOpenKeySettings())
    result.current()

    expect(mockPush).toHaveBeenCalledWith(
      '/settings/keys?from=%2Fstudio%2Fnode',
    )
  })

  it('给了 adapterType 就带上 setup，让配置页直接打开那一家', () => {
    mockPush.mockClear()
    const { result } = renderHook(() => useOpenKeySettings())
    result.current(AI_ADAPTER_TYPES.OPENAI)

    expect(mockPush).toHaveBeenCalledWith(
      '/settings/keys?from=%2Fstudio%2Fnode&setup=openai',
    )
  })

  it('被当点击回调直接传下去时，塞进来的事件对象不当成 provider', () => {
    mockPush.mockClear()
    const { result } = renderHook(() => useOpenKeySettings())
    ;(result.current as (arg?: unknown) => void)({ type: 'click' })

    expect(mockPush).toHaveBeenCalledWith(
      '/settings/keys?from=%2Fstudio%2Fnode',
    )
  })
})
