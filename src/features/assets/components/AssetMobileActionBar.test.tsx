import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssetMobileActionBar } from './AssetMobileActionBar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

function renderBar(props: { open: boolean; onDelete?: () => void }) {
  return render(
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
    />,
  )
}

describe('AssetMobileActionBar', () => {
  it('多选开启时浮出四格动作胶囊，未多选时不渲染', () => {
    const { rerender } = renderBar({ open: false })
    expect(screen.queryByRole('toolbar')).toBeNull()

    rerender(
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
      />,
    )
    const toolbar = screen.getByRole('toolbar')
    expect(toolbar.querySelectorAll('button')).toHaveLength(4)
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
