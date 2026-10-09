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
  planFolderDrop,
  resolveFolderDropTarget,
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

// a ─ b ─ c ─ d      e ─ f   （TREE 同上）
describe('dragging a folder: where it lands', () => {
  it('middle of a row = into, top / bottom quarter = before / after', () => {
    expect(resolveFolderDropTarget(TREE, 'f', 'a', 0.5)).toEqual({
      kind: 'into',
      id: 'a',
    })
    expect(resolveFolderDropTarget(TREE, 'f', 'a', 0.1)).toEqual({
      kind: 'before',
      id: 'a',
    })
    expect(resolveFolderDropTarget(TREE, 'f', 'a', 0.9)).toEqual({
      kind: 'after',
      id: 'a',
    })
  })

  it('never lands on itself or any of its descendants', () => {
    expect(resolveFolderDropTarget(TREE, 'b', 'b', 0.5)).toBeNull()
    expect(resolveFolderDropTarget(TREE, 'b', 'd', 0.5)).toBeNull()
    expect(resolveFolderDropTarget(TREE, 'b', 'd', 0.1)).toBeNull()
    expect(resolveFolderDropTarget(TREE, 'b', 'ghost', 0.5)).toBeNull()
    expect(planFolderDrop(TREE, 'a', { kind: 'into', id: 'c' })).toBeNull()
  })

  it('into = becomes the last child of that folder', () => {
    expect(planFolderDrop(TREE, 'e', { kind: 'into', id: 'b' })).toEqual({
      id: 'e',
      parentId: 'b',
      ids: ['c', 'e'],
    })
  })

  it('before / after = same level as that row, in that slot', () => {
    // f（e 的子夹）排到最外层 a 的后面
    expect(planFolderDrop(TREE, 'f', { kind: 'after', id: 'a' })).toEqual({
      id: 'f',
      parentId: null,
      ids: ['a', 'f', 'e'],
    })
    // 同一层里换位置：e 排到 a 前面
    expect(planFolderDrop(TREE, 'e', { kind: 'before', id: 'a' })).toEqual({
      id: 'e',
      parentId: null,
      ids: ['e', 'a'],
    })
    // d 排到 c 前面：从第四层挪到第三层
    expect(planFolderDrop(TREE, 'd', { kind: 'before', id: 'c' })).toEqual({
      id: 'd',
      parentId: 'b',
      ids: ['d', 'c'],
    })
  })

  it('a drop that changes nothing is no plan', () => {
    expect(planFolderDrop(TREE, 'e', { kind: 'after', id: 'a' })).toBeNull()
    expect(planFolderDrop(TREE, 'a', { kind: 'before', id: 'e' })).toBeNull()
    expect(planFolderDrop(TREE, 'f', { kind: 'into', id: 'e' })).toBeNull()
  })
})
