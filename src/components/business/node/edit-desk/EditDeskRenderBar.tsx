'use client'

/**
 * 顶栏下的**渲染进度条**（S9 · spec §6「导出」）。
 *
 * 一条脊柱线性进度 + 一行「第几步 · 百分比」+ 取消。完成之后变成「打开 / 下载 /
 * 收起」，⛔ 不自动消失：一条片子渲了两分钟，结果自己滑走等于没交付。
 *
 * ⚠ 进度按**步骤**报（`RENDER_STEPS` 六步），⛔ 不做匀速假条 —— 编码那一步会停很久。
 */

import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'

import { RENDER_JOB_STATUS_IDS } from '@/constants/render-video'
import { cn } from '@/lib/utils'
import type { RenderJobResponse } from '@/lib/api-client'

export interface EditDeskRenderBarProps {
  readonly job: RenderJobResponse
  onCancel(): void
  onClear(): void
  /** 成片下载（没勾「导出到画布」时的去处）。 */
  onDownload(url: string): void
}

export function EditDeskRenderBar({
  job,
  onCancel,
  onClear,
  onDownload,
}: EditDeskRenderBarProps) {
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
      className="relative flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-1.5"
    >
      <span className="truncate text-xs text-foreground">{job.name}</span>
      <span
        data-testid="edit-desk-render-status"
        className="shrink-0 text-2xs tabular-nums text-muted-foreground"
      >
        {done
          ? t('done')
          : failed
            ? (job.error ?? t(`status.${job.status}`))
            : t('step', {
                step: job.step ? t(`steps.${job.step}`) : t('steps.download'),
                percent,
              })}
      </span>

      <div className="min-w-0 flex-1" />

      {done ? (
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
          className="inline-flex h-7 shrink-0 items-center rounded-lg px-2 text-2xs text-muted-foreground transition-colors duration-fast hover:bg-muted"
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

      {/* 脊柱线性进度 —— 贴在这条的下沿，⛔ 不用圆环（它读不出「还有多久」）。 */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-fill-track"
      >
        <span
          data-testid="edit-desk-render-progress"
          className={cn(
            'block h-full transition-[width] duration-slow motion-reduce:transition-none',
            failed ? 'bg-status-warning' : 'bg-primary',
          )}
          style={{ width: `${done ? 100 : percent}%` }}
        />
      </span>
    </div>
  )
}

export interface EditDeskResumeBarProps {
  readonly job: RenderJobResponse
  onResume(): void
  onDismiss(): void
}

/** 「上次导出未完成 · 继续 / 重来」（spec §6「断点续传」的用户可见面）。 */
export function EditDeskResumeBar({
  job,
  onResume,
  onDismiss,
}: EditDeskResumeBarProps) {
  const t = useTranslations('StudioNode.editDesk.render')
  return (
    <div
      data-testid="edit-desk-resume-bar"
      role="status"
      className="flex shrink-0 items-center gap-3 border-b border-border bg-muted px-3 py-1.5"
    >
      <span className="truncate text-xs text-foreground">
        {t('resume', { name: job.name })}
      </span>
      <div className="min-w-0 flex-1" />
      <button
        type="button"
        data-testid="edit-desk-resume-continue"
        onClick={onResume}
        className="inline-flex h-7 shrink-0 items-center rounded-lg bg-primary px-3 text-2xs font-medium text-primary-foreground"
      >
        {t('resumeContinue')}
      </button>
      <button
        type="button"
        data-testid="edit-desk-resume-restart"
        onClick={onDismiss}
        className="inline-flex h-7 shrink-0 items-center rounded-lg px-2 text-2xs text-muted-foreground transition-colors duration-fast hover:bg-muted"
      >
        {t('resumeRestart')}
      </button>
    </div>
  )
}
