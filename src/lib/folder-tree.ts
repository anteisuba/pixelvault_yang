import type { ProjectRecord } from '@/types'

/**
 * 文件夹树的**扁平列表**视角 —— 门牌行 / 总览页 / 面包屑共用。
 *
 * `AssetFolderTree` 里那套 `TreeNode<FolderNodeData>` 是为 shadcn tree-view
 * 准备的嵌套结构；门牌体系拿到的是 `ProjectRecord[]` 扁平表，所以这里只做
 * 「按 parentId 分组 / 找祖先链 / 三档排序」三件事，排序档位与树保持同一套
 * （`docs/references/pages/assets.md` §4.1）。
 */

/** 与 `AssetFolderTree` 的 `FolderSortMode` 同一套档位。 */
export const FOLDER_SORT_MODES = ['recent', 'name', 'count'] as const
export type FolderSortMode = (typeof FOLDER_SORT_MODES)[number]

export const FOLDER_SORT_STORAGE_KEY = 'pv:assets:folder-sort'
export const DEFAULT_FOLDER_SORT_MODE: FolderSortMode = 'recent'

export function isFolderSortMode(
  value: string | null,
): value is FolderSortMode {
  return (FOLDER_SORT_MODES as readonly string[]).includes(value ?? '')
}

/** 顶层夹（`parentId` 为空，或父夹已不在列表里 —— 防孤儿）。 */
export function getRootFolders(projects: ProjectRecord[]): ProjectRecord[] {
  const known = new Set(projects.map((project) => project.id))
  return projects.filter(
    (project) => !project.parentId || !known.has(project.parentId),
  )
}

export function getChildFolders(
  projects: ProjectRecord[],
  parentId: string,
): ProjectRecord[] {
  return projects.filter((project) => project.parentId === parentId)
}

/**
 * 从根到该夹的整条链（含它自己）—— 面包屑 `素材 › 鸣潮 › 弗洛洛` 就是它。
 * 环形引用时提前停，最多走 `projects.length` 层。
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

/**
 * 三档排序。⚠ `recent` 现在排的是 `Project.updatedAt`，而**往夹里加素材不碰
 * Project 行** —— 这一档要等 service 把「夹内最新素材时间」透出来才诚实
 * （page §4.1 / 切片 4b）。别在这里自己造一个假的时间源。
 */
export function sortFolders(
  projects: ProjectRecord[],
  mode: FolderSortMode,
  countFor?: (projectId: string) => number | undefined,
): ProjectRecord[] {
  const displayCount = (project: ProjectRecord) =>
    countFor?.(project.id) ?? project.generationCount

  return [...projects].sort((a, b) => {
    if (mode === 'name') return a.name.localeCompare(b.name)
    if (mode === 'count') return displayCount(b) - displayCount(a)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

/** 跨层级扁平搜索（子夹也能被搜到，不要求父夹匹配）。 */
export function filterFolders(
  projects: ProjectRecord[],
  query: string,
): ProjectRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return projects
  return projects.filter((project) => project.name.toLowerCase().includes(q))
}
