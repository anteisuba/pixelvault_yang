import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AssetFolderTree } from './AssetFolderTree'
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
})
