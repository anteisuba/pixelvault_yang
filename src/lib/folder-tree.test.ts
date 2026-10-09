import { describe, expect, it } from 'vitest'

import {
  FOLDER_TREE_INDENT,
  FOLDER_TREE_MAX_INDENT_DEPTH,
} from '@/constants/asset-folder-tree'
import type { ProjectRecord } from '@/types'

import {
  filterFolders,
  flattenFolderTree,
  folderIndentPx,
  getFolderAncestorIds,
  getFolderMoveTargets,
  getFolderPath,
  getFolderSubtreeIds,
} from './folder-tree'

function folder(
  id: string,
  parentId: string | null = null,
  sortOrder = 0,
): ProjectRecord {
  return {
    id,
    name: id,
    description: null,
    parentId,
    sortOrder,
    pinnedOrder: null,
    coverUrl: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
}

// a ─ b ─ c ─ d      e ─ f
const TREE = [
  folder('e', null, 1),
  folder('a', null, 0),
  folder('c', 'b'),
  folder('b', 'a'),
  folder('d', 'c'),
  folder('f', 'e'),
]

describe('folder-tree at any depth', () => {
  it('flattens depth-first in manual order with depths', () => {
    expect(
      flattenFolderTree(TREE).map(({ folder: f, depth }) => `${f.id}${depth}`),
    ).toEqual(['a0', 'b1', 'c2', 'd3', 'e0', 'f1'])
  })

  it('walks the path and ancestors of a deep folder', () => {
    expect(getFolderPath(TREE, 'd').map((f) => f.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(getFolderAncestorIds(TREE, 'd')).toEqual(['a', 'b', 'c'])
    expect(getFolderAncestorIds(TREE, 'a')).toEqual([])
  })

  it('collects a subtree at every level', () => {
    expect([...getFolderSubtreeIds(TREE, 'b')].sort()).toEqual(['b', 'c', 'd'])
  })

  it('move targets exclude itself, its descendants and its current parent', () => {
    const b = TREE.find((f) => f.id === 'b') as ProjectRecord
    expect(
      getFolderMoveTargets(TREE, b).map(({ folder: f, depth }) => [
        f.id,
        depth,
      ]),
    ).toEqual([
      ['e', 0],
      ['f', 1],
    ])
  })

  it('searches every level in tree order', () => {
    expect(filterFolders(TREE, '').map((f) => f.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ])
    expect(filterFolders(TREE, 'd').map((f) => f.id)).toEqual(['d'])
  })

  it('stops on a cycle instead of looping', () => {
    const looped = [folder('x', 'y'), folder('y', 'x')]
    expect(getFolderPath(looped, 'x').map((f) => f.id)).toEqual(['y', 'x'])
    expect([...getFolderSubtreeIds(looped, 'x')].sort()).toEqual(['x', 'y'])
  })

  it('indents per level and stops indenting past the cap', () => {
    const { basePx, stepPx } = FOLDER_TREE_INDENT.sidebar
    expect(folderIndentPx('sidebar', 0)).toBe(basePx)
    expect(folderIndentPx('sidebar', 2)).toBe(basePx + 2 * stepPx)
    expect(folderIndentPx('sidebar', FOLDER_TREE_MAX_INDENT_DEPTH + 3)).toBe(
      folderIndentPx('sidebar', FOLDER_TREE_MAX_INDENT_DEPTH),
    )
  })
})
