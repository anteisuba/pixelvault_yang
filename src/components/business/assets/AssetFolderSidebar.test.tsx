import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FOLDER_TREE_INDENT } from '@/constants/asset-folder-tree'
import type { ProjectRecord } from '@/types'

import {
  AssetFolderSidebar,
  type AssetFolderEdit,
  type AssetFolderScope,
} from './AssetFolderSidebar'

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
  {
    onCreate = vi.fn(async () => null),
    edit = { kind: 'create', parentId: 'root' },
    scope = { kind: 'all' },
  }: {
    onCreate?: (
      name: string,
      parentId: string | null,
    ) => Promise<ProjectRecord | null>
    edit?: AssetFolderEdit | null
    scope?: AssetFolderScope
  } = {},
) {
  const onEditChange = vi.fn()
  render(
    <AssetFolderSidebar
      folders={folders}
      counts={{ byProject: {} }}
      scope={scope}
      onScopeChange={vi.fn()}
      edit={edit}
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

const THREE_LEVELS = [
  folder('root', '角色'),
  folder('kid', '立绘', 'root'),
  folder('grandkid', '表情', 'kid'),
]

describe('AssetFolderSidebar 新建子文件夹', () => {
  it('父夹还没有子夹时，输入行照样长出来，回车用父夹 id 建', async () => {
    const onCreate = vi.fn(async () => null)
    renderSidebar([folder('root', '角色')], { onCreate })
    const input = screen.getByLabelText('folderRenameInput')
    fireEvent.change(input, { target: { value: '立绘' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('立绘', 'root'))
  })

  it('在第三层下面新建：祖先一路展开，输入行出现，用第三层的 id 建', async () => {
    const onCreate = vi.fn(async () => null)
    renderSidebar(THREE_LEVELS, {
      onCreate,
      edit: { kind: 'create', parentId: 'grandkid' },
    })
    expect(screen.getByText('表情')).toBeTruthy()
    const input = screen.getByLabelText('folderRenameInput')
    fireEvent.change(input, { target: { value: '笑脸' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith('笑脸', 'grandkid'),
    )
  })
})

describe('AssetFolderSidebar 任意层级', () => {
  it('选中第三层时祖先自动展开，三层按层缩进', () => {
    renderSidebar(THREE_LEVELS, {
      edit: null,
      scope: { kind: 'folder', id: 'grandkid' },
    })
    const rows = screen.getAllByRole('treeitem')
    expect(rows.map((row) => row.getAttribute('aria-level'))).toEqual([
      '1',
      '2',
      '3',
    ])
    const { basePx, stepPx } = FOLDER_TREE_INDENT.sidebar
    expect(rows.map((row) => row.style.paddingLeft)).toEqual([
      `${basePx}px`,
      `${basePx + stepPx}px`,
      `${basePx + 2 * stepPx}px`,
    ])
    expect(rows[2].getAttribute('aria-selected')).toBe('true')
    // 第一、二层都有 ▸，且是展开态
    expect(rows[0].getAttribute('aria-expanded')).toBe('true')
    expect(rows[1].getAttribute('aria-expanded')).toBe('true')
  })

  it('没选中时只显示最外层，▸ 一层层展开', () => {
    renderSidebar(THREE_LEVELS, { edit: null })
    expect(screen.getAllByRole('treeitem')).toHaveLength(1)

    fireEvent.click(screen.getByLabelText('folderExpand'))
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('folderExpand'))
    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
  })
})
