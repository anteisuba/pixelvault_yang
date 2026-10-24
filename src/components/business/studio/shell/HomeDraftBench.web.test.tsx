import { useState, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomeDraftBench } from './HomeDraftBench'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'

/**
 * 首页那份小配方交宿主给外壳（第 9g 步）。
 * ⭐ 钉的是 10-24 线上那次 React #185：宿主每次渲染都是新对象时，外壳 setState
 *   ⛔ 不能把这一份再带着重渲染一遍，否则无限循环。
 */

vi.mock('@/contexts/studio-context', () => ({
  StudioProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/hooks/use-studio-generate-action', () => ({
  useStudioGenerateAction: () => undefined,
}))
const hostRenders = vi.fn()
vi.mock('@/hooks/use-home-draft-operator-host', () => ({
  useHomeDraftOperatorHost: () => {
    hostRenders()
    // 每次都是新对象：最坏情况。
    return { domain: 'home' } as unknown as StudioOperatorHost
  },
}))

function Shell() {
  const [host, setHost] = useState<StudioOperatorHost | null>(null)
  return (
    <>
      <span data-testid="has-host">{host ? 'yes' : 'no'}</span>
      <HomeDraftBench onHost={setHost} />
    </>
  )
}

describe('HomeDraftBench', () => {
  it('⭐ 宿主交给外壳不会死循环（外壳重渲染不带着它重算）', () => {
    const view = render(<Shell />)
    expect(view.getByTestId('has-host')).toHaveTextContent('yes')
    expect(hostRenders.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('卸下时把宿主收回（外壳退回普通首页宿主）', () => {
    const onHost = vi.fn()
    const view = render(<HomeDraftBench onHost={onHost} />)
    view.unmount()
    expect(onHost).toHaveBeenLastCalledWith(null)
  })
})
