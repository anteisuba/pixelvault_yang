import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssetMobileActionBar } from './AssetMobileActionBar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

function renderBar(props: {
  open: boolean
  downloading?: boolean
  downloadProgress?: { done: number; total: number } | null
  onDownload?: () => void
  onDelete?: () => void
}) {
  return render(
    <AssetMobileActionBar
      open={props.open}
      count={3}
      pending={Boolean(props.downloading)}
      downloading={Boolean(props.downloading)}
      downloadProgress={props.downloadProgress}
      favoriting={false}
      publishing={false}
      publishBlocked={false}
      addToFolder={(trigger) => trigger}
      onDownload={props.onDownload ?? vi.fn()}
      onFavorite={vi.fn()}
      onPublish={vi.fn()}
      onDelete={props.onDelete ?? vi.fn()}
    />,
  )
}

describe('AssetMobileActionBar', () => {
  it('多选开启时浮出五格动作胶囊，未多选时不渲染', () => {
    const { rerender } = renderBar({ open: false })
    expect(screen.queryByRole('toolbar')).toBeNull()

    rerender(
      <AssetMobileActionBar
        open
        count={3}
        pending={false}
        downloading={false}
        favoriting={false}
        publishing={false}
        publishBlocked={false}
        addToFolder={(trigger) => trigger}
        onDownload={vi.fn()}
        onFavorite={vi.fn()}
        onPublish={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const toolbar = screen.getByRole('toolbar')
    expect(toolbar.querySelectorAll('button')).toHaveLength(5)
    expect(
      screen.getByRole('button', { name: 'bulkDownload' }),
    ).toBeInTheDocument()
  })

  it('点击下载触发批量下载，下载中显示进度并禁用按钮', () => {
    const onDownload = vi.fn()
    const { rerender } = renderBar({ open: true, onDownload })

    fireEvent.click(screen.getByRole('button', { name: 'bulkDownload' }))
    expect(onDownload).toHaveBeenCalledTimes(1)

    rerender(
      <AssetMobileActionBar
        open
        count={3}
        pending
        downloading
        downloadProgress={{ done: 2, total: 3 }}
        favoriting={false}
        publishing={false}
        publishBlocked={false}
        addToFolder={(trigger) => trigger}
        onDownload={onDownload}
        onFavorite={vi.fn()}
        onPublish={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const downloadBtn = screen.getByRole('button', { name: /2\/3/ })
    expect(downloadBtn).toBeDisabled()
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
