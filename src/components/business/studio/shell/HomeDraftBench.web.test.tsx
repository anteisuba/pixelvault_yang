import { useCallback, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { renderWithApp } from '@/test/app-harness'
import { fakeStudioServer } from '@/test/studio-harness'

import { HomeDraftBench } from './HomeDraftBench'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'

/**
 * 首页那份小配方交宿主给外壳（第 9g 步）。
 * ⭐ 钉的是 10-24 线上那次 React #185：宿主每次渲染都是新对象时，外壳 setState
 *   ⛔ 不能把这一份再带着重渲染一遍，否则无限循环。
 */

// 真 StudioProvider、真首页宿主、真出图执行端；只假网络与登录。
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
  useUser: () => ({ user: { id: 'user-a' } }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(() => {
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

const hostHandoffs = vi.fn()

function Shell() {
  const [host, setHostState] = useState<StudioOperatorHost | null>(null)
  // 稳的 setter（外壳给的就是 useState 的 setter），顺手数一下交了几次。
  const setHost = useCallback((next: StudioOperatorHost | null) => {
    hostHandoffs(next)
    setHostState(next)
  }, [])
  return (
    <>
      <span data-testid="has-host">{host ? 'yes' : 'no'}</span>
      <HomeDraftBench onHost={setHost} />
    </>
  )
}

describe('HomeDraftBench', () => {
  it('⭐ 宿主交给外壳不会死循环（外壳重渲染不带着它重算）', () => {
    hostHandoffs.mockClear()
    const view = renderWithApp(<Shell />, { inner: ApiKeysProvider })
    expect(view.getByTestId('has-host')).toHaveTextContent('yes')
    // 死循环时这里会一直交（React 到 50 次报 #185）；挡住了就只有挂载那几次。
    expect(hostHandoffs.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('卸下时把宿主收回（外壳退回普通首页宿主）', () => {
    const onHost = vi.fn()
    const view = renderWithApp(<HomeDraftBench onHost={onHost} />, {
      inner: ApiKeysProvider,
    })
    view.unmount()
    expect(onHost).toHaveBeenLastCalledWith(null)
  })
})
