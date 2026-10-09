import { useState, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FOLDER_TREE_INDENT } from '@/constants/asset-folder-tree'
import type { FolderDropPlan } from '@/lib/folder-tree'
import type { ProjectRecord } from '@/types'

import { AssetFolderSidebar, type AssetFolderScope } from './AssetFolderSidebar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Radix 菜单在 jsdom 里开不起来：换成「受控 open 就把内容画出来」的最小替身。
vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await import('react')
  const OpenContext = React.createContext(false)
  type Slot = { children?: ReactNode }
  return {
    DropdownMenu: ({ open, children }: Slot & { open?: boolean }) => (
      <OpenContext.Provider value={Boolean(open)}>
        {children}
      </OpenContext.Provider>
    ),
    DropdownMenuTrigger: ({ children }: Slot) => <>{children}</>,
    DropdownMenuContent: ({ children }: Slot) =>
      React.useContext(OpenContext) ? <div role="menu">{children}</div> : null,
    DropdownMenuItem: ({
      children,
      onSelect,
    }: Slot & { onSelect?: () => void }) => (
      <div role="menuitem" onClick={() => onSelect?.()}>
        {children}
      </div>
    ),
    DropdownMenuSeparator: () => null,
    DropdownMenuShortcut: ({ children }: Slot) => <span>{children}</span>,
    DropdownMenuSub: ({ children }: Slot) => <div>{children}</div>,
    DropdownMenuSubTrigger: ({ children }: Slot) => <div>{children}</div>,
    DropdownMenuSubContent: ({ children }: Slot) => <div>{children}</div>,
  }
})

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

type Handlers = {
  onCreate: (
    name: string,
    parentId: string | null,
  ) => Promise<ProjectRecord | null>
  onRename: (id: string, name: string) => void
  onPlace: (plan: FolderDropPlan) => void
}

/** 改名状态与夹列表都由这里托管 —— 同页面上 `KreaAssetBrowser` 的接法。 */
function Harness({
  initialFolders,
  scope,
  handlers,
}: {
  initialFolders: ProjectRecord[]
  scope: AssetFolderScope
  handlers: Handlers
}) {
  const [folders, setFolders] = useState(initialFolders)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  return (
    <AssetFolderSidebar
      folders={folders}
      counts={{ byProject: {} }}
      scope={scope}
      onScopeChange={vi.fn()}
      renamingId={renamingId}
      onRenamingChange={setRenamingId}
      onCreate={async (name, parentId) => {
        const created = await handlers.onCreate(name, parentId)
        if (created) setFolders((prev) => [...prev, created])
        return created
      }}
      onRename={handlers.onRename}
      onTogglePin={vi.fn()}
      onMove={vi.fn()}
      onRequestDelete={vi.fn()}
      onReorder={vi.fn()}
      onPlace={handlers.onPlace}
      draggingCount={0}
      onDropAssets={vi.fn()}
    />
  )
}

function renderSidebar(
  folders: ProjectRecord[],
  {
    scope = { kind: 'all' },
    onCreate = vi.fn(async () => null),
  }: {
    scope?: AssetFolderScope
    onCreate?: Handlers['onCreate']
  } = {},
) {
  const handlers = {
    onCreate,
    onRename: vi.fn(),
    onPlace: vi.fn(),
  }
  render(<Harness initialFolders={folders} scope={scope} handlers={handlers} />)
  return handlers
}

const THREE_LEVELS = [
  folder('root', '角色'),
  folder('kid', '立绘', 'root'),
  folder('grandkid', '表情', 'kid'),
]

const rowOf = (name: string) =>
  screen.getByText(name).closest('[role="treeitem"]') as HTMLElement

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AssetFolderSidebar Eagle 式新建', () => {
  it('栏顶「+」当场建「未命名文件夹」，那一行直接改名、名字全选', async () => {
    const onCreate = vi.fn(async (name: string, parentId: string | null) => ({
      ...folder('fresh', name, parentId),
    }))
    const { onRename } = renderSidebar([folder('root', '角色')], { onCreate })

    fireEvent.click(screen.getByLabelText('folderCreate'))
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith('folderUntitled', null),
    )

    const input = (await screen.findByLabelText(
      'folderRenameInput',
    )) as HTMLInputElement
    expect(input.value).toBe('folderUntitled')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('folderUntitled'.length)

    fireEvent.change(input, { target: { value: '立绘' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('fresh', '立绘')
    expect(screen.queryByLabelText('folderRenameInput')).toBeNull()
  })

  it('Esc 留下默认名（不改名），建失败什么都不留', async () => {
    const onCreate = vi
      .fn<Handlers['onCreate']>()
      .mockResolvedValueOnce(folder('fresh', 'folderUntitled'))
      .mockResolvedValueOnce(null)
    const { onRename } = renderSidebar([], { onCreate })

    fireEvent.click(screen.getByLabelText('folderCreate'))
    const input = await screen.findByLabelText('folderRenameInput')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('folderUntitled')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('folderCreate'))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2))
    expect(screen.queryByLabelText('folderRenameInput')).toBeNull()
    expect(screen.getAllByRole('treeitem')).toHaveLength(1)
  })

  it('右键一行打开同一个菜单；「新建子文件夹」建在它里面并展开它', async () => {
    const onCreate = vi.fn(async (name: string, parentId: string | null) =>
      folder('child', name, parentId),
    )
    renderSidebar([folder('root', '角色')], { onCreate })

    fireEvent.contextMenu(rowOf('角色'))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(screen.getByText('folderCreateChild'))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith('folderUntitled', 'root'),
    )
    const input = await screen.findByLabelText('folderRenameInput')
    expect(rowOf('角色').getAttribute('aria-expanded')).toBe('true')
    expect(input.closest('[role="treeitem"]')?.getAttribute('aria-level')).toBe(
      '2',
    )
  })

  it('F2 / 双击名字进改名', () => {
    renderSidebar([folder('root', '角色')])
    fireEvent.keyDown(screen.getByText('角色'), { key: 'F2' })
    expect(screen.getByLabelText('folderRenameInput')).toBeTruthy()
    fireEvent.keyDown(screen.getByLabelText('folderRenameInput'), {
      key: 'Escape',
    })

    fireEvent.doubleClick(screen.getByText('角色'))
    expect(screen.getByLabelText('folderRenameInput')).toBeTruthy()
  })
})

describe('AssetFolderSidebar 任意层级', () => {
  it('选中第三层时祖先自动展开，三层按层缩进', () => {
    renderSidebar(THREE_LEVELS, { scope: { kind: 'folder', id: 'grandkid' } })
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
    expect(rows[0].getAttribute('aria-expanded')).toBe('true')
    expect(rows[1].getAttribute('aria-expanded')).toBe('true')
  })

  it('没选中时只显示最外层，▸ 一层层展开', () => {
    renderSidebar(THREE_LEVELS)
    expect(screen.getAllByRole('treeitem')).toHaveLength(1)

    fireEvent.click(screen.getByLabelText('folderExpand'))
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('folderExpand'))
    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
  })
})

describe('AssetFolderSidebar 拖一个夹', () => {
  const ROW = 32

  /** jsdom 不排版：树里每一行按出现顺序摞成 32 高。 */
  function stackRows() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>('[data-folder-row]'),
        )
        const index = rows.indexOf(this)
        const top = index >= 0 ? index * ROW : 0
        const height = index >= 0 ? ROW : 0
        return {
          top,
          bottom: top + height,
          left: 0,
          right: 200,
          width: 200,
          height,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect
      },
    )
  }

  function dragTo(name: string, toY: number) {
    fireEvent.pointerDown(screen.getByText(name), {
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 0,
    })
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 24,
          clientY: toY,
        }),
      )
    })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }))
    })
  }

  it('压在一行中间 = 放进去当子夹（排在最后）', () => {
    stackRows()
    const { onPlace } = renderSidebar([folder('a', 'A'), folder('b', 'B')])
    dragTo('B', ROW * 0.5)
    expect(onPlace).toHaveBeenCalledWith({ id: 'b', parentId: 'a', ids: ['b'] })
  })

  it('压在一行上边 = 排到它前面（同一层）', () => {
    stackRows()
    const { onPlace } = renderSidebar([folder('a', 'A'), folder('b', 'B')])
    dragTo('B', ROW * 0.1)
    expect(onPlace).toHaveBeenCalledWith({
      id: 'b',
      parentId: null,
      ids: ['b', 'a'],
    })
  })

  it('拖不进自己的子孙', () => {
    stackRows()
    const { onPlace } = renderSidebar(THREE_LEVELS, {
      scope: { kind: 'folder', id: 'grandkid' },
    })
    // 第三行 = 表情（角色的孙夹）
    dragTo('角色', ROW * 2.5)
    expect(onPlace).not.toHaveBeenCalled()
  })
})
