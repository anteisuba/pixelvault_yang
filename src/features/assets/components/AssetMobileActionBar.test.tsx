import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  useMobileTabBarActionsActive,
  useMobileTabBarActionsHost,
} from '@/hooks/use-mobile-tabbar-actions'
import { AssetMobileActionBar } from './AssetMobileActionBar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

/** 底栏那一格（外壳 `MobileShell` 里同样的接法）。 */
function TabBarSlot() {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  useMobileTabBarActionsHost(host)
  const lent = useMobileTabBarActionsActive()
  return <div ref={setHost} data-testid="slot" data-lent={lent} />
}

function renderBar(props: { open: boolean; onDelete?: () => void }) {
  return render(
    <>
      <TabBarSlot />
      <AssetMobileActionBar
        open={props.open}
        count={3}
        pending={false}
        favoriting={false}
        publishing={false}
        publishBlocked={false}
        addToFolder={(trigger) => trigger}
        onFavorite={vi.fn()}
        onPublish={vi.fn()}
        onDelete={props.onDelete ?? vi.fn()}
      />
    </>,
  )
}

describe('AssetMobileActionBar', () => {
  it('借底栏那一格放四个动作，没在多选时底栏照旧', () => {
    const { rerender } = renderBar({ open: false })
    expect(screen.getByTestId('slot')).toHaveAttribute('data-lent', 'false')
    expect(screen.queryByRole('toolbar')).toBeNull()

    rerender(
      <>
        <TabBarSlot />
        <AssetMobileActionBar
          open
          count={3}
          pending={false}
          favoriting={false}
          publishing={false}
          publishBlocked={false}
          addToFolder={(trigger) => trigger}
          onFavorite={vi.fn()}
          onPublish={vi.fn()}
          onDelete={vi.fn()}
        />
      </>,
    )
    const slot = screen.getByTestId('slot')
    expect(slot).toHaveAttribute('data-lent', 'true')
    expect(slot.querySelectorAll('button')).toHaveLength(4)
  })

  it('删除点两下：第一下变成确认，第二下才删', () => {
    const onDelete = vi.fn()
    renderBar({ open: true, onDelete })
    const button = screen.getByRole('button', { name: /bulkDelete/ })

    fireEvent.click(button)
    expect(onDelete).not.toHaveBeenCalled()
    expect(button).toHaveAttribute('data-armed', 'true')
    expect(button).toHaveTextContent('bulkDeleteArm')

    fireEvent.click(button)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
