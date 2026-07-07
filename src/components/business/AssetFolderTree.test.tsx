import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  AssetFolderTree,
  filterFolderNodes,
  sortFolderNodes,
  type FolderNodeData,
} from './AssetFolderTree'
import type { TreeNode } from '@/components/ui/tree-view'
import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import type { ProjectRecord } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// ProjectCreateDialog pulls in Radix Dialog + createProjectAPI + toast; the
// folder tree only needs its trigger rendered, so stub it to the trigger.
vi.mock('@/components/business/ProjectCreateDialog', () => ({
  ProjectCreateDialog: ({ trigger }: { trigger: React.ReactNode }) => (
    <>{trigger}</>
  ),
}))

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
  }
})

const project = (
  id: string,
  name: string,
  parentId: string | null = null,
): ProjectRecord => ({ id, name, parentId }) as unknown as ProjectRecord

function renderTree(
  overrides: Partial<Parameters<typeof AssetFolderTree>[0]> = {},
) {
  const onSelectProject = vi.fn()
  const onSelectUnassigned = vi.fn()
  const props = {
    projects: [project('p1', 'ba'), project('p2', 'キサキ', 'p1')],
    byProjectCounts: { p1: 27, p2: 5 },
    unassignedCount: 64,
    activeProjectId: 'p1',
    isUnassignedActive: false,
    onSelectUnassigned,
    onSelectProject,
    onProjectCreated: vi.fn(),
    onRenameProject: vi.fn().mockResolvedValue(true),
    onRequestDeleteProject: vi.fn(),
    ...overrides,
  }
  render(<AssetFolderTree {...props} />)
  return { onSelectProject, onSelectUnassigned }
}

describe('AssetFolderTree', () => {
  it('renders project folders, the nested child, and their ledger counts', () => {
    renderTree()
    expect(screen.getByText('ba')).toBeInTheDocument()
    // parent is auto-expanded (has children) so the nested project shows
    expect(screen.getByText('キサキ')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders the unassigned to-do row with its count', () => {
    renderTree()
    expect(screen.getByText('sidebarUnassigned')).toBeInTheDocument()
    expect(screen.getByText('64')).toBeInTheDocument()
  })

  it('calls onSelectProject when a folder row is clicked', () => {
    const { onSelectProject } = renderTree()
    fireEvent.click(screen.getByText('ba'))
    expect(onSelectProject).toHaveBeenCalledWith('p1')
  })

  it('calls onSelectUnassigned when the unassigned row is clicked', () => {
    const { onSelectUnassigned } = renderTree()
    fireEvent.click(screen.getByText('sidebarUnassigned'))
    expect(onSelectUnassigned).toHaveBeenCalledTimes(1)
  })

  it('moves dropped assets onto a folder (drop target)', () => {
    const onDropAssets = vi.fn()
    renderTree({ onDropAssets })
    const dataTransfer = {
      types: [ASSET_DND_MIME],
      dropEffect: '',
      getData: (type: string) =>
        type === ASSET_DND_MIME ? JSON.stringify(['g1', 'g2']) : '',
    }
    const row = screen.getByText('ba')
    fireEvent.dragOver(row, { dataTransfer })
    fireEvent.drop(row, { dataTransfer })
    expect(onDropAssets).toHaveBeenCalledWith('p1', ['g1', 'g2'])
  })

  it('moves dropped assets onto the unassigned bucket with a null project', () => {
    const onDropAssets = vi.fn()
    renderTree({ onDropAssets })
    const dataTransfer = {
      types: [ASSET_DND_MIME],
      dropEffect: '',
      getData: (type: string) =>
        type === ASSET_DND_MIME ? JSON.stringify(['g3']) : '',
    }
    const row = screen.getByText('sidebarUnassigned')
    fireEvent.dragOver(row, { dataTransfer })
    fireEvent.drop(row, { dataTransfer })
    expect(onDropAssets).toHaveBeenCalledWith(null, ['g3'])
  })

  it('filters folders to the search query and shows an empty state', () => {
    renderTree({
      projects: [project('p1', 'apple'), project('p2', 'banana')],
      byProjectCounts: { p1: 1, p2: 2 },
    })
    const search = screen.getByLabelText('folderSearch')

    fireEvent.change(search, { target: { value: 'ban' } })
    expect(screen.queryByText('apple')).not.toBeInTheDocument()
    expect(screen.getByText('banana')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText('folderSearchEmpty')).toBeInTheDocument()

    // Clearing the search restores every folder.
    fireEvent.click(screen.getByLabelText('folderSearchClear'))
    expect(screen.getByText('apple')).toBeInTheDocument()
    expect(screen.getByText('banana')).toBeInTheDocument()
  })
})

const node = (
  id: string,
  label: string,
  count: number,
  updatedAt: string,
): TreeNode<FolderNodeData> => ({
  id,
  label,
  children: [],
  data: {
    project: { id, name: label, updatedAt } as unknown as ProjectRecord,
    count,
  },
})

describe('sortFolderNodes', () => {
  const nodes = [
    node('a', 'zed', 3, '2026-01-01'),
    node('b', 'alpha', 9, '2026-03-01'),
    node('c', 'mid', 1, '2026-02-01'),
  ]

  it('sorts by name A→Z', () => {
    expect(sortFolderNodes(nodes, 'name').map((n) => n.label)).toEqual([
      'alpha',
      'mid',
      'zed',
    ])
  })

  it('sorts by count, most assets first', () => {
    expect(sortFolderNodes(nodes, 'count').map((n) => n.label)).toEqual([
      'alpha',
      'zed',
      'mid',
    ])
  })

  it('sorts by recent, newest updatedAt first', () => {
    expect(sortFolderNodes(nodes, 'recent').map((n) => n.label)).toEqual([
      'alpha',
      'mid',
      'zed',
    ])
  })

  it('sorts nested children too', () => {
    const parent: TreeNode<FolderNodeData> = {
      ...node('root', 'root', 0, '2026-01-01'),
      children: [
        node('x', 'yankee', 1, '2026-01-01'),
        node('y', 'bravo', 1, '2026-01-01'),
      ],
    }
    const sorted = sortFolderNodes([parent], 'name')
    expect(sorted[0].children?.map((n) => n.label)).toEqual(['bravo', 'yankee'])
  })
})

describe('filterFolderNodes', () => {
  it('keeps a parent when a descendant matches', () => {
    const parent: TreeNode<FolderNodeData> = {
      ...node('root', 'outer', 0, '2026-01-01'),
      children: [node('x', 'target', 1, '2026-01-01')],
    }
    const filtered = filterFolderNodes([parent], 'targ')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].children?.map((n) => n.label)).toEqual(['target'])
  })

  it('returns the original list for a blank query', () => {
    const nodes = [node('a', 'one', 1, '2026-01-01')]
    expect(filterFolderNodes(nodes, '  ')).toBe(nodes)
  })
})
