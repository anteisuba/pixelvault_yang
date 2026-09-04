import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssetFolderBreadcrumb } from './AssetFolderBreadcrumb'

describe('AssetFolderBreadcrumb', () => {
  it('renders an optional folder action next to the current path', () => {
    const onCreate = vi.fn()

    render(
      <AssetFolderBreadcrumb
        crumbs={[]}
        current="AI模型小剧场"
        count={10}
        action={<button onClick={onCreate}>Create folder</button>}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))
    expect(onCreate).toHaveBeenCalledOnce()
  })
})
