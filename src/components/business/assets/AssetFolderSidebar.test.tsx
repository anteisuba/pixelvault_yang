import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectRecord } from '@/types'

import { AssetFolderSidebar } from './AssetFolderSidebar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function folder(id: string, name: string, parentId: string | null = null) {
  return {
    id,
    name,
    description: null,
    parentId,
    sortOrder: 0,
    pinnedOrder: null,
    coverUrl: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } satisfies ProjectRecord
}

function renderSidebar(
  folders: ProjectRecord[],
  onCreate = vi.fn(async () => null),
) {
  const onEditChange = vi.fn()
  render(
    <AssetFolderSidebar
      folders={folders}
      counts={{ byProject: {} }}
      scope={{ kind: 'all' }}
      onScopeChange={vi.fn()}
      edit={{ kind: 'create', parentId: 'root' }}
      onEditChange={onEditChange}
      onCreate={onCreate}
      onRename={vi.fn()}
      onTogglePin={vi.fn()}
      onMove={vi.fn()}
      onRequestDelete={vi.fn()}
      onReorder={vi.fn()}
      draggingCount={0}
      onDropAssets={vi.fn()}
    />,
  )
  return { onCreate, onEditChange }
}

describe('AssetFolderSidebar 新建子文件夹', () => {
  it('父夹还没有子夹时，输入行照样长出来，回车用父夹 id 建', async () => {
    const { onCreate } = renderSidebar([folder('root', '角色')])
    const input = screen.getByLabelText('folderRenameInput')
    fireEvent.change(input, { target: { value: '立绘' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('立绘', 'root'))
  })
})
