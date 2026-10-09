'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { ProjectRecord, ReorderProjectsRequest } from '@/types'
import {
  createProjectAPI,
  deleteProjectAPI,
  listProjectsAPI,
  reorderProjectsAPI,
  updateProjectAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import {
  getChildFolders,
  getPinnedFolders,
  getRootFolders,
} from '@/lib/folder-tree'

export interface UseAssetFoldersReturn {
  folders: ProjectRecord[]
  isLoading: boolean
  refresh: () => Promise<void>
  create: (
    name: string,
    parentId: string | null,
  ) => Promise<ProjectRecord | null>
  rename: (id: string, name: string) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
  moveTo: (id: string, parentId: string | null) => Promise<void>
  remove: (id: string) => Promise<boolean>
  reorder: (input: ReorderProjectsRequest) => Promise<void>
}

/** 一组里最前面的位置（新建 / 新挪进来 / 新置顶的都排最前）。 */
function topOf(orders: number[]): number {
  return Math.min(0, ...orders) - 1
}

/**
 * 素材页左栏的文件夹状态（`docs/references/pages/assets.md` 文件夹 B）。
 *
 * 改名 / 置顶 / 排序 / 挪层级 / 删除都**先在本地改好**（栏里当场变，动效才接得上），
 * 再写库；写失败就拉一遍真值回来并提示。⛔ 成功不弹 toast —— 结果就在栏里。
 * ⚠ 与 `useProjects` 分开：那个是工作台的「当前项目 + 历史」，带成功 toast。
 */
export function useAssetFolders(): UseAssetFoldersReturn {
  const t = useTranslations('AssetsPage')
  const [folders, setFolders] = useState<ProjectRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    const response = await listProjectsAPI()
    if (response.success && response.data) setFolders(response.data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  const fail = useCallback(() => {
    toast.error(t('folderSaveFailed'))
    void refresh()
  }, [refresh, t])

  const create = useCallback(
    async (name: string, parentId: string | null) => {
      const response = await createProjectAPI({ name, parentId })
      if (!response.success || !response.data) {
        toast.error(t('folderSaveFailed'))
        return null
      }
      const record = response.data
      setFolders((prev) => [...prev, record])
      return record
    },
    [t],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      setFolders((prev) =>
        prev.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
      )
      const response = await updateProjectAPI(id, { name })
      if (!response.success) fail()
    },
    [fail],
  )

  const setPinned = useCallback(
    async (id: string, pinned: boolean) => {
      setFolders((prev) => {
        const top = topOf(
          getPinnedFolders(prev).map((folder) => folder.pinnedOrder ?? 0),
        )
        return prev.map((folder) =>
          folder.id === id
            ? { ...folder, pinnedOrder: pinned ? top : null }
            : folder,
        )
      })
      const response = await updateProjectAPI(id, { pinned })
      if (!response.success) fail()
    },
    [fail],
  )

  const moveTo = useCallback(
    async (id: string, parentId: string | null) => {
      setFolders((prev) => {
        const siblings = parentId
          ? getChildFolders(prev, parentId)
          : getRootFolders(prev)
        const top = topOf(siblings.map((folder) => folder.sortOrder))
        return prev.map((folder) =>
          folder.id === id ? { ...folder, parentId, sortOrder: top } : folder,
        )
      })
      const response = await updateProjectAPI(id, { parentId })
      if (!response.success) fail()
    },
    [fail],
  )

  const remove = useCallback(
    async (id: string) => {
      // 直接子夹往上挪一层（挂到它的父夹下），接在它原来的位置上；更深的子孙
      // 跟着各自的父夹走（与服务端同一条规矩）。
      setFolders((prev) => {
        const removed = prev.find((folder) => folder.id === id)
        const children = getChildFolders(prev, id)
        const rest = prev.filter((folder) => folder.id !== id)
        if (!removed || children.length === 0) return rest
        const parentId = removed.parentId
        const siblings = parentId
          ? getChildFolders(prev, parentId)
          : getRootFolders(prev)
        const levelOrder = siblings.flatMap((sibling) =>
          sibling.id === id ? children.map((child) => child.id) : [sibling.id],
        )
        const rank = new Map(
          levelOrder.map((folderId, index) => [folderId, index]),
        )
        return rest.map((folder) =>
          rank.has(folder.id)
            ? { ...folder, parentId, sortOrder: rank.get(folder.id) ?? 0 }
            : folder,
        )
      })
      const response = await deleteProjectAPI(id)
      if (!response.success) {
        fail()
        return false
      }
      return true
    },
    [fail],
  )

  const reorder = useCallback(
    async (input: ReorderProjectsRequest) => {
      const rank = new Map(input.ids.map((id, index) => [id, index]))
      setFolders((prev) =>
        prev.map((folder) => {
          const index = rank.get(folder.id)
          if (index === undefined) return folder
          return input.kind === 'pins'
            ? { ...folder, pinnedOrder: index }
            : { ...folder, sortOrder: index }
        }),
      )
      const response = await reorderProjectsAPI(input)
      if (!response.success) fail()
    },
    [fail],
  )

  return {
    folders,
    isLoading,
    refresh,
    create,
    rename,
    setPinned,
    moveTo,
    remove,
    reorder,
  }
}
