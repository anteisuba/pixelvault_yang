'use client'

/**
 * 导出进度 —— **顶栏正中那一格**（④ A 关键切片 A4：「时长 / 比例 / 清晰度」换成
 * 「导出中 · 编码 58% ▬▬ 取消」）。⛔ 不在顶栏下面另起一条进度栏。
 *
 * 完成之后：勾了「导出到画布」的由舞台上方那条回执说（这一格回到读数）；没勾的
 * 变成「成片已就绪 · 下载 · ×」，⛔ 不自动消失 —— 一条片子渲了两分钟，结果自己
 * 滑走等于没交付。
 *
 * ⚠ 进度按**步骤**报（`RENDER_STEPS` 六步），⛔ 不做匀速假条 —— 编码那一步会停很久。
 */

import { useTranslations } from 'next-intl'
import { X } from '@/components/icons'

import { RENDER_JOB_STATUS_IDS } from '@/constants/render-video'
import { cn } from '@/lib/utils'
import type { RenderJobResponse } from '@/lib/api-client'

export interface EditDeskRenderStatusProps {
  readonly job: RenderJobResponse
  onCancel(): void
  onClear(): void
  /** 成片下载（没勾「导出到画布」时的去处）。 */
  onDownload(url: string): void
}

export function EditDeskRenderStatus({
  job,
  onCancel,
  onClear,
  onDownload,
}: EditDeskRenderStatusProps) {
  const t = useTranslations('StudioNode.editDesk.render')
  const done = job.status === RENDER_JOB_STATUS_IDS.completed
  const failed =
    job.status === RENDER_JOB_STATUS_IDS.failed ||
    job.status === RENDER_JOB_STATUS_IDS.cancelled
  const running = !done && !failed
  const percent = Math.round((job.progress ?? 0) * 100)

  return (
    <div
      data-testid="edit-desk-render-bar"
      role="status"
      className="flex min-w-0 items-center gap-3 text-xs"
    >
      <span
        data-testid="edit-desk-render-status"
        className={cn(
          'truncate tabular-nums',
          failed ? 'text-status-warning' : 'text-muted-foreground',
        )}
      >
        {done
          ? t('done')
          : failed
            ? (job.error ?? t(`status.${job.status}`))
            : t('exporting', {
                step: job.step ? t(`steps.${job.step}`) : t('steps.download'),
                percent,
              })}
      </span>

      {running ? (
        // 脊柱线性进度，⛔ 不用圆环（它读不出「还有多久」）。
        <span
          aria-hidden
          className="relative h-1 w-36 shrink-0 overflow-hidden rounded-full bg-surface-fill-track"
        >
          <span
            data-testid="edit-desk-render-progress"
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-slow motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </span>
      ) : null}

      {done && job.url ? (
        <button
          type="button"
          data-testid="edit-desk-render-download"
          onClick={() => job.url && onDownload(job.url)}
          className="inline-flex h-7 shrink-0 items-center rounded-lg bg-primary px-3 text-2xs font-medium text-primary-foreground"
        >
          {t('download')}
        </button>
      ) : null}

      {running ? (
        <button
          type="button"
          data-testid="edit-desk-render-cancel"
          onClick={onCancel}
          className="inline-flex h-7 shrink-0 items-center rounded-lg px-2 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
        >
          {t('cancel')}
        </button>
      ) : (
        <button
          type="button"
          aria-label={t('dismiss')}
          data-testid="edit-desk-render-dismiss"
          onClick={onClear}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-muted"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export interface EditDeskResumeStatusProps {
  readonly job: RenderJobResponse
  onResume(): void
  onDismiss(): void
}

/**
 * 「上次导出未完成 · 继续 / 重来」（spec §6「断点续传」的用户可见面）—— 也住在头部读数
 * 那一格，⛔ 不另起一条栏。
 */
export function EditDeskResumeStatus({
  job,
  onResume,
  onDismiss,
}: EditDeskResumeStatusProps) {
  const t = useTranslations('StudioNode.editDesk.render')
  return (
    <div
      data-testid="edit-desk-resume-bar"
      role="status"
      className="flex min-w-0 items-center gap-2 text-xs"
    >
      <span className="truncate text-muted-foreground">
        {t('resume', { name: job.name })}
      </span>
      <button
        type="button"
        data-testid="edit-desk-resume-continue"
        onClick={onResume}
        className="inline-flex h-7 shrink-0 items-center rounded-full bg-primary px-3 text-2xs font-medium text-primary-foreground"
      >
        {t('resumeContinue')}
      </button>
      <button
        type="button"
        data-testid="edit-desk-resume-restart"
        onClick={onDismiss}
        className="inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-2xs text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
      >
        {t('resumeRestart')}
      </button>
    </div>
  )
}
