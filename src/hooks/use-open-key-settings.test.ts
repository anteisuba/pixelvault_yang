import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
})
