'use client'

import {
  Check,
  Clock3,
  FolderOpen,
  FolderPlus,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { NodeWorkflowProjectSummary } from '@/types/node-workflow'

interface CanvasProjectPanelProps {
  projectName: string
  projects: NodeWorkflowProjectSummary[]
  currentProjectId: string
  nodeCount: number
  isSaving?: boolean
  /**
   * 立即保存。保存本身是自动的（顶栏那颗独立按钮已按 owner 意见移除），但
   * 自动保存失败时得有条手动的路 —— 放在「更新于 …」旁边是它最该在的位置。
   */
  onSave?: () => void
  onCreateProject: () => void
  onRenameProject: () => void
  onDeleteProject: () => void
  onSwitchProject: (id: string) => void
}

/**
 * 项目管理 —— 左侧面板的第二个视图（owner 2026-08-02 拍板）。
 *
 * 在这之前它是顶栏项目名下的一个 dropdown。搬进侧边栏有两个理由，都是 owner
 * 给的：① 项目列表本来就需要列表空间，塞在下拉里反而挤；② 收起态的侧边栏是
 * 一根 56×600 的空白柱（台账 E4），与其把空柱子缩小，不如给它真实内容。
 *
 * 文案全部复用顶栏那套 `StudioNode.topbar.projectMenu.*`，一个新键都不加 ——
 * 这是同一个功能换了个位置，不是新功能。
 */
export function CanvasProjectPanel({
  projectName,
  projects,
  currentProjectId,
  nodeCount,
  isSaving,
  onSave,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onSwitchProject,
}: CanvasProjectPanelProps) {
  // ⚠ 命名空间是 `StudioNode` 而不是 `StudioNode.topbar`：projectMenu.* 与
  // nodeCount 挂在 StudioNode 下，只有 save 在 topbar 下（与顶栏原实现一致）。
  const t = useTranslations('StudioNode')
  const currentProject = projects.find(
    (project) => project.id === currentProjectId,
  )
  const otherProjects = projects.filter(
    (project) => project.id !== currentProjectId,
  )
  // 与顶栏原实现逐字一致（含 suppressHydrationWarning 的用法）—— toLocaleString
  // 的结果依赖运行环境时区，服务端与客户端可能不同。
  // ⚠ 比顶栏原实现少给一档精度：那里是 toLocaleString()（完整日期+秒），在
  // 240px 的面板里必然截断成「更新于…」——一个零信息量的字符串。这里只留
  // 「月/日 时:分」，够回答「是不是刚存过」这个唯一会问的问题。
  const updatedLabel = currentProject
    ? t('projectMenu.updatedAt', {
        time: new Date(currentProject.updatedAt).toLocaleString(undefined, {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })
    : t('projectMenu.unsaved')

  return (
    <div className="flex flex-col gap-3 p-3">
      <section className="space-y-2">
        <h3 className="px-1 text-2xs uppercase tracking-nav-dense text-node-muted">
          {t('projectMenu.current')}
        </h3>
        <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
          <div className="flex items-start gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-node-panel-inner text-node-foreground">
              <Check className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-node-foreground">
                {projectName}
              </p>
              {/* 时间与「立即保存」同一行：保存用图标钮而不是文字 —— 240px
                  的面板里 updatedLabel（「更新于 2026/8/3 …」）本来就要截断，
                  再放两个字会把它挤成「更新…」。 */}
              <p className="mt-1 flex items-center gap-1 text-2xs font-medium text-node-muted">
                <Clock3 className="size-3 shrink-0" aria-hidden />
                <span
                  suppressHydrationWarning
                  className="min-w-0 flex-1 truncate"
                >
                  {isSaving ? t('projectMenu.saving') : updatedLabel}
                </span>
                {onSave ? (
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={isSaving}
                    aria-label={t('topbar.save')}
                    title={t('topbar.save')}
                    className="flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
                  >
                    <Save className="size-3" aria-hidden />
                  </button>
                ) : null}
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-node-panel-inner px-2 py-1 text-2xs font-semibold text-node-muted">
              {t('nodeCount', { count: nodeCount })}
            </span>
          </div>
          {/* 搬进侧边栏后空间够了，重命名/删除不必再藏进菜单项里 */}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onRenameProject}
              className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg border border-node-panel-inner text-2xs font-semibold text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
            >
              <Pencil className="size-3" aria-hidden />
              {t('projectMenu.rename')}
            </button>
            {/* 删除只留图标：文案「删除当前项目」在 240px 里会把重命名挤扁，
                而红色垃圾桶本身已经足够警示。全文进 aria-label / title。 */}
            <button
              type="button"
              onClick={onDeleteProject}
              aria-label={t('projectMenu.delete')}
              title={t('projectMenu.delete')}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </section>

      {otherProjects.length > 0 ? (
        <section className="space-y-1">
          <h3 className="px-1 text-2xs uppercase tracking-nav-dense text-node-muted">
            {t('projectMenu.switch')}
          </h3>
          <ul className="space-y-0.5">
            {otherProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => onSwitchProject(project.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                >
                  <FolderOpen className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {project.name}
                  </span>
                  <span className="shrink-0 text-2xs text-node-subtle">
                    {project.nodeCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onCreateProject}
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-node-panel-inner text-xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
      >
        <FolderPlus className="size-3.5" aria-hidden />
        {t('projectMenu.create')}
      </button>
    </div>
  )
}
