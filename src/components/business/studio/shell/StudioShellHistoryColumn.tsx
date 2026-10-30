'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { PanelLeftClose, Plus } from '@/components/icons'
import {
  StudioOperatorSessionDeleteDialog,
  StudioOperatorSessionRow,
} from '@/components/business/studio/assistant-operator/StudioOperatorSessionRow'
import {
  SHELL_HISTORY_SKELETON_WIDTHS,
  useShellHistoryBuckets,
} from '@/components/business/studio/shell/ShellHistoryMenu'
import { useShellWorkHistory } from '@/components/business/studio/shell/StudioShellHistoryKeys'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * 白板里最左那一列（用户 10-26 定稿 v5）：「＋ 新对话」· 收起，下面按今天 / 昨天 / 更早列以前的几段。
 * 没开台时摊开，开台自动收起（外壳管 `open`）；收起后对话头最左出一颗展开键。
 *
 * 宽 232 ↔ 0 走一段过渡，里面那一层同时往左滑、淡出（样件 v5），⛔ 内容跟着宽一起挤。
 * 行和手机上那颗下拉是同一套（`StudioOperatorSessionRow` 的 `compact`，摆在框里 `inMenu={false}`）。
 */
/** 这一列开着时的宽（= 下面的 `w-58`）：库在角色页贴着它右边排，要按它让位。 */
export const SHELL_HISTORY_COLUMN_WIDTH = '14.5rem'

export function StudioShellHistoryColumn({
  open,
  onClose,
}: {
  open: boolean
  onClose(): void
}) {
  const t = useTranslations('StudioShell')
  // 这一列只摆在首页 / 台上，对话面板总在场：列表就是它手上那份，后台自己会刷。
  const history = useShellWorkHistory()
  const buckets = useShellHistoryBuckets(history.items)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null)

  return (
    <aside
      aria-label={t('history')}
      aria-hidden={!open}
      inert={!open}
      data-testid="studio-shell-history-column"
      data-open={open}
      className={cn(
        'hidden shrink-0 overflow-hidden border-r transition-[width,border-color] duration-slow ease-standard lg:block motion-reduce:transition-none',
        open ? 'w-58 border-border' : 'w-0 border-transparent',
      )}
    >
      <div
        className={cn(
          'flex h-full w-58 flex-col p-2.5 transition-[opacity,transform] duration-slow ease-standard motion-reduce:transition-none',
          open ? 'opacity-100' : '-translate-x-6 opacity-0',
        )}
      >
        <div className="mb-1 flex h-8 shrink-0 items-center gap-1.5">
          <button
            type="button"
            data-testid="studio-shell-history-new"
            disabled={history.newDisabled}
            onClick={history.onNew}
            className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-2sm font-medium text-primary-foreground transition-[transform,opacity] duration-fast ease-standard active:scale-96 disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
          >
            <Plus className="size-3.5" aria-hidden />
            <span className="truncate">{t('newChat')}</span>
          </button>
          <button
            type="button"
            aria-label={t('historyHide')}
            title={t('historyHide')}
            data-testid="studio-shell-history-hide"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
          >
            <PanelLeftClose className="size-4.5" aria-hidden />
          </button>
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {history.loading && history.items.length === 0
            ? SHELL_HISTORY_SKELETON_WIDTHS.map((width) => (
                <div key={width} className="flex h-9 items-center px-2.25">
                  <Skeleton className={`h-2.5 rounded-sm ${width}`} />
                </div>
              ))
            : null}
          {buckets.map((bucket) => (
            <div key={bucket.id}>
              <p className="px-2.25 pt-2 pb-0.5 text-2xs text-muted-foreground">
                {t(`historyBucket.${bucket.id}`)}
              </p>
              {bucket.items.map((item) => (
                <StudioOperatorSessionRow
                  key={item.id}
                  compact
                  inMenu={false}
                  session={{ id: item.id, title: item.title }}
                  domainLabel={null}
                  dateLabel={bucket.timeLabel(item.updatedAt)}
                  current={item.id === history.currentId}
                  selectDisabled={
                    history.deletingId === item.id || history.selectDisabled()
                  }
                  deleteDisabled={
                    history.deletingId !== null ||
                    history.deleteDisabled(item.id)
                  }
                  renaming={history.renamingId === item.id}
                  deleting={history.deletingId === item.id}
                  onSelect={() => history.onSelect(item.id)}
                  onRename={(title) => history.onRename(item.id, title)}
                  onRequestDelete={() => setDeleteTarget(item)}
                />
              ))}
            </div>
          ))}
          {history.error ? (
            <p className="px-2.25 py-2 text-2sm text-destructive">
              {history.error}
            </p>
          ) : null}
        </div>
      </div>
      <StudioOperatorSessionDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={history.onDelete}
      />
    </aside>
  )
}
