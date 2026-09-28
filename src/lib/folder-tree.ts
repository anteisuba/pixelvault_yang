import type { ProjectRecord } from '@/types'

/**
 * 文件夹树的**扁平列表**视角 —— 素材页左栏 / 加入文件夹面板 / 素材选择器共用。
 *
 * 顺序是用户自己排的（owner 09-28 定手动排序）：同一层按 `sortOrder`，置顶组按
 * `pinnedOrder`，这几处看到的顺序一样。⛔ 不再有「最近 / 名称 / 数量」排法。
 * 只有两层：顶层夹 + 它们的子夹。
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
  let current = byId.get(folderId)
  for (let depth = 0; current && depth <= projects.length; depth += 1) {
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

/** 跨层级扁平搜索（子夹也能被搜到，不要求父夹匹配），按树里的顺序。 */
export function filterFolders(
  projects: ProjectRecord[],
  query: string,
): ProjectRecord[] {
  const q = query.trim().toLowerCase()
  const ordered = getRootFolders(projects).flatMap((root) => [
    root,
    ...getChildFolders(projects, root.id),
  ])
  if (!q) return ordered
  return ordered.filter((project) => project.name.toLowerCase().includes(q))
}
