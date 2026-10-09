import {
  FOLDER_TREE_DRAG,
  FOLDER_TREE_INDENT,
  FOLDER_TREE_MAX_INDENT_DEPTH,
  type FolderTreeIndentSurface,
} from '@/constants/asset-folder-tree'
import type { ProjectRecord } from '@/types'

/**
 * 文件夹树的**扁平列表**视角 —— 素材页左栏 / 加入文件夹面板 / 素材选择器共用。
 *
 * 顺序是用户自己排的（owner 09-28 定手动排序）：同一层按 `sortOrder`，置顶组按
 * `pinnedOrder`，这几处看到的顺序一样。⛔ 不再有「最近 / 名称 / 数量」排法。
 * 层数不限（owner 2026-10-09）：每个走树的函数都对坏数据（成环）自带刹车。
 */

function byManualOrder(a: ProjectRecord, b: ProjectRecord): number {
  return (
    a.sortOrder - b.sortOrder ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

/** 顶层夹（`parentId` 为空，或父夹已不在列表里 —— 防孤儿），按手动顺序。 */
export function getRootFolders(projects: ProjectRecord[]): ProjectRecord[] {
  const known = new Set(projects.map((project) => project.id))
  return projects
    .filter((project) => !project.parentId || !known.has(project.parentId))
    .sort(byManualOrder)
}

export function getChildFolders(
  projects: ProjectRecord[],
  parentId: string,
): ProjectRecord[] {
  return projects
    .filter((project) => project.parentId === parentId)
    .sort(byManualOrder)
}

/** 置顶组（子夹也能置顶），按置顶顺序。 */
export function getPinnedFolders(projects: ProjectRecord[]): ProjectRecord[] {
  return projects
    .filter((project) => project.pinnedOrder !== null)
    .sort(
      (a, b) =>
        (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0) || byManualOrder(a, b),
    )
}

/**
 * 从根到该夹的整条链（含它自己）。环形引用时提前停，最多走 `projects.length` 层。
 */
export function getFolderPath(
  projects: ProjectRecord[],
  folderId: string,
): ProjectRecord[] {
  const byId = new Map(projects.map((project) => [project.id, project]))
  const path: ProjectRecord[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

/** 该夹所有层的祖先 id（不含它自己）—— 选中一个深层夹时一路展开用。 */
export function getFolderAncestorIds(
  projects: ProjectRecord[],
  folderId: string,
): string[] {
  return getFolderPath(projects, folderId)
    .slice(0, -1)
    .map((folder) => folder.id)
}

/** 该夹连同所有层子孙的 id（含它自己）。 */
export function getFolderSubtreeIds(
  projects: ProjectRecord[],
  folderId: string,
): Set<string> {
  const ids = new Set([folderId])
  const queue = [folderId]
  while (queue.length > 0) {
    const parentId = queue.shift() as string
    for (const project of projects) {
      if (project.parentId === parentId && !ids.has(project.id)) {
        ids.add(project.id)
        queue.push(project.id)
      }
    }
  }
  return ids
}

export interface FolderTreeEntry {
  folder: ProjectRecord
  /** 最外层 = 0。 */
  depth: number
}

/** 整棵树按显示顺序摊平（深度优先，同一层按手动顺序），带层深。 */
export function flattenFolderTree(
  projects: ProjectRecord[],
): FolderTreeEntry[] {
  const entries: FolderTreeEntry[] = []
  const seen = new Set<string>()
  const walk = (nodes: ProjectRecord[], depth: number) => {
    for (const folder of nodes) {
      if (seen.has(folder.id)) continue
      seen.add(folder.id)
      entries.push({ folder, depth })
      walk(getChildFolders(projects, folder.id), depth + 1)
    }
  }
  walk(getRootFolders(projects), 0)
  return entries
}

/**
 * 「移到…」能去的夹：整棵树里除掉它自己和它所有层的子孙（挂过去会成环），
 * 也除掉它现在的父夹（挪过去等于没挪）。带层深，菜单里照树缩进。
 */
export function getFolderMoveTargets(
  projects: ProjectRecord[],
  folder: ProjectRecord,
): FolderTreeEntry[] {
  const subtree = getFolderSubtreeIds(projects, folder.id)
  return flattenFolderTree(projects).filter(
    (entry) =>
      !subtree.has(entry.folder.id) && entry.folder.id !== folder.parentId,
  )
}

/** 跨层级扁平搜索（子夹也能被搜到，不要求父夹匹配），按树里的顺序。 */
export function filterFolders(
  projects: ProjectRecord[],
  query: string,
): ProjectRecord[] {
  const q = query.trim().toLowerCase()
  const ordered = flattenFolderTree(projects).map((entry) => entry.folder)
  if (!q) return ordered
  return ordered.filter((project) => project.name.toLowerCase().includes(q))
}

/** 某一层的左缩进（px）。超过 `FOLDER_TREE_MAX_INDENT_DEPTH` 不再往里缩。 */
export function folderIndentPx(
  surface: FolderTreeIndentSurface,
  depth: number,
): number {
  const { basePx, stepPx } = FOLDER_TREE_INDENT[surface]
  return basePx + Math.min(depth, FOLDER_TREE_MAX_INDENT_DEPTH) * stepPx
}

// ─── 拖动一个夹（左栏 Eagle 式，owner 2026-10-09）────────────────────

export type FolderDropTarget = {
  kind: 'into' | 'before' | 'after'
  /** 指针压着的那一行。 */
  id: string
}

/**
 * 指针压在某一行的哪里 → 落点。`relY` = 指针在这一行里的竖直位置（0 顶 … 1 底）。
 * 中间 = 放进去；上 / 下 `FOLDER_TREE_DRAG.edgeRatio` = 排到它前 / 后（同一层）。
 * ⛔ 压在它自己或它任何一层的子孙上 = 没有落点（会成环，服务端同样拒）。
 */
export function resolveFolderDropTarget(
  projects: ProjectRecord[],
  draggedId: string,
  overId: string,
  relY: number,
): FolderDropTarget | null {
  if (getFolderSubtreeIds(projects, draggedId).has(overId)) return null
  if (!projects.some((project) => project.id === overId)) return null
  const { edgeRatio } = FOLDER_TREE_DRAG
  if (relY < edgeRatio) return { kind: 'before', id: overId }
  if (relY > 1 - edgeRatio) return { kind: 'after', id: overId }
  return { kind: 'into', id: overId }
}

export interface FolderDropPlan {
  id: string
  /** 落下后的父夹（`null` = 最外层）。 */
  parentId: string | null
  /** 落下后那一层的完整顺序（含它自己）—— 直接喂给 `reorder({ kind: 'tree' })`。 */
  ids: string[]
}

/**
 * 落点 → 落下后挂在哪、那一层排成什么样。放进去 = 排在那个夹的子夹最后；
 * 排到一行前 / 后 = 和那一行同一层。成环或什么都没变 → `null`。
 */
export function planFolderDrop(
  projects: ProjectRecord[],
  draggedId: string,
  target: FolderDropTarget,
): FolderDropPlan | null {
  const dragged = projects.find((project) => project.id === draggedId)
  const over = projects.find((project) => project.id === target.id)
  if (!dragged || !over) return null
  if (getFolderSubtreeIds(projects, draggedId).has(target.id)) return null

  const roots = getRootFolders(projects)
  // 孤儿（父夹已不在列表里）按最外层算 —— 与树里画出来的位置一致。
  const levelOf = (folder: ProjectRecord) =>
    roots.some((root) => root.id === folder.id) ? null : folder.parentId

  const parentId = target.kind === 'into' ? over.id : levelOf(over)
  const siblings = (
    parentId === null ? roots : getChildFolders(projects, parentId)
  ).map((folder) => folder.id)
  const rest = siblings.filter((id) => id !== draggedId)

  let ids: string[]
  if (target.kind === 'into') {
    ids = [...rest, draggedId]
  } else {
    const at = rest.indexOf(over.id) + (target.kind === 'after' ? 1 : 0)
    ids = [...rest.slice(0, at), draggedId, ...rest.slice(at)]
  }

  const unchanged =
    levelOf(dragged) === parentId &&
    ids.length === siblings.length &&
    ids.every((id, index) => id === siblings[index])
  return unchanged ? null : { id: draggedId, parentId, ids }
}
