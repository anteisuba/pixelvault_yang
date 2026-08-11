'use client'

import { useMemo, useState } from 'react'
import { Folder, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'

/**
 * 顶栏搜索 —— `docs/references/pages/assets.md` §3 / §4「搜索直达」。
 *
 * 两件事共用一个输入框，但**落点不同**：
 * - **输入即出「文件夹」结果组** —— 跨层级扁平搜，子夹显示父路径，点行直达该夹。
 *   夹数量增长时这是唯一 O(1) 的路径，所以它是一等公民。
 * - **回车才落到素材内容搜索**（提示词 / 模型）。
 */

/** 结果组里最多列几个夹 —— 再多就该用文件夹总览页了。 */
const MAX_FOLDER_RESULTS = 6

interface AssetSearchBoxProps {
  /** 已生效的素材内容搜索词（`filters.search`）。 */
  value: string
  /** 回车提交 —— 落到素材内容搜索。 */
  onSearch: (value: string) => void
  projects: ProjectRecord[]
  onSelectFolder: (projectId: string) => void
  className?: string
}

export function AssetSearchBox({
  value,
  onSearch,
  projects,
  onSelectFolder,
  className,
}: AssetSearchBoxProps) {
  const t = useTranslations('AssetsPage')
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)

  const folderPaths = useMemo(() => buildFolderPaths(projects), [projects])
  const query = draft.trim().toLowerCase()
  const folderMatches = useMemo(() => {
    if (!query) return []
    return projects
      .filter((project) => project.name.toLowerCase().includes(query))
      .slice(0, MAX_FOLDER_RESULTS)
      .map((project) => ({
        id: project.id,
        name: project.name,
        path: folderPaths.get(project.id) ?? '',
        count: project.generationCount,
      }))
  }, [projects, query, folderPaths])

  const commit = (next: string) => {
    setOpen(false)
    onSearch(next.trim())
  }

  return (
    <div
      className={cn('relative min-w-0', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={draft}
        placeholder={t('search')}
        aria-label={t('search')}
        onChange={(event) => {
          setDraft(event.target.value)
          setOpen(event.target.value.trim().length > 0)
        }}
        onFocus={() => setOpen(draft.trim().length > 0)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(draft)
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-7 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border-strong focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {(draft || value) && (
        <button
          type="button"
          aria-label={t('folderSearchClear')}
          onClick={() => {
            setDraft('')
            commit('')
          }}
          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-72 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg">
          {folderMatches.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('sidebarFolders')}
              </p>
              {folderMatches.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onSelectFolder(folder.id)
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
                >
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{folder.name}</span>
                  {folder.path && (
                    <span className="truncate text-2xs text-muted-foreground">
                      {folder.path}
                    </span>
                  )}
                  <span className="text-soft-count ml-auto shrink-0 text-2xs">
                    {folder.count}
                  </span>
                </button>
              ))}
            </>
          )}
          <button
            type="button"
            onClick={() => commit(draft)}
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground transition-colors hover:bg-muted',
              folderMatches.length > 0 && 'mt-1 border-t border-border pt-1',
            )}
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {t('searchAssetsFor', { query: draft.trim() })}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

/** 子夹显示父路径（`达妮娅 · 鸣潮 /`），所以要先把每个夹的祖先链拼出来。 */
function buildFolderPaths(projects: ProjectRecord[]): Map<string, string> {
  const byId = new Map(projects.map((project) => [project.id, project]))
  const paths = new Map<string, string>()
  for (const project of projects) {
    const ancestors: string[] = []
    let parentId = project.parentId
    // 防御环形父子引用：最多向上走 projects.length 层。
    for (let depth = 0; parentId && depth < projects.length; depth += 1) {
      const parent = byId.get(parentId)
      if (!parent) break
      ancestors.unshift(parent.name)
      parentId = parent.parentId
    }
    paths.set(project.id, ancestors.length ? `${ancestors.join(' / ')} /` : '')
  }
  return paths
}
