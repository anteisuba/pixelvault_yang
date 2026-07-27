'use client'

import { RotateCw, Square, Triangle, X, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * S4（2026-07-27）图片卡状态语言共用件 —— canvas-image-card.md §1/§3。三个
 * 落点（ImageSourceStarter 空/上传中/失败 · LooseImageCard 就绪·hover 替换 ·
 * NodeMediaPreview kind=image 的空/生成中/失败）都要画同一套徽标/扫光/失败/
 * 替换胶囊，抽到这一个文件里，避免三处各写一份（§1 卡结构在图片族内部先定
 * 好，后两族——声音/身份——各自的状态语言完全不同，不共用这份）。
 *
 * 图标选型：基准原文用「□ 空」「↻ 上传中」「▲ 失败」这类形+词记号表达
 * 「形状是主编码」，读作「用一个方形/环形/三角形的图标」而非要求逐字渲染
 * 这三个 Unicode 字符——项目里状态类图标一律走 lucide-react（NodeStatusBadge
 * 的 Loader2 是先例），这里延续同一惯例：Square≈□、RotateCw≈↻、Triangle≈▲。
 */

export type ImageCardBadgeTone = 'neutral' | 'danger'

const BADGE_ICON: Record<
  'empty' | 'uploading' | 'generating' | 'failed',
  LucideIcon
> = {
  empty: Square,
  uploading: RotateCw,
  generating: RotateCw,
  failed: Triangle,
}

export interface ImageCardStatusBadgeProps {
  variant: keyof typeof BADGE_ICON
  label: string
}

/** 状态浮标 —— 媒体窗内左上角，内缩 8px（父容器需 `position: relative`）。
 *  就绪态不挂它，调用方自己判断要不要渲染。 */
export function ImageCardStatusBadge({
  variant,
  label,
}: ImageCardStatusBadgeProps) {
  const Icon = BADGE_ICON[variant]
  const tone: ImageCardBadgeTone = variant === 'failed' ? 'danger' : 'neutral'
  return (
    <span
      className={cn(
        'canvas-image-badge',
        tone === 'danger' && 'canvas-image-badge--danger',
      )}
    >
      <Icon
        aria-hidden
        className={cn('size-3', variant === 'uploading' && 'animate-spin')}
      />
      {label}
    </span>
  )
}

export interface ImageCardUploadOverlayProps {
  /** 0–100，真实百分比（canvas-image-card.md §3 硬要求①：上传有进度，
   *  不得沿用生成态的「无百分比」）。 */
  progress: number
  /** 例如「上传中 42%」，数字已经拼进文案（caller 用 t('uploading', {percent})）。 */
  label: string
  cancelLabel: string
  onCancel: () => void
}

/** 上传中 —— 半透明白 + 一道扫光 + 真实百分比 + × 取消。 */
export function ImageCardUploadOverlay({
  progress,
  label,
  cancelLabel,
  onCancel,
}: ImageCardUploadOverlayProps) {
  return (
    <div className="canvas-image-upload-scrim">
      <p className="canvas-image-upload-text">{label}</p>
      <button
        type="button"
        onClick={onCancel}
        aria-label={cancelLabel}
        title={cancelLabel}
        className="canvas-image-cancel-btn nodrag"
      >
        <X className="size-3.5" aria-hidden />
      </button>
      {/* 屏幕阅读器进度提示；视觉进度条本身规格未画，文字百分比已经够。 */}
      <span
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="sr-only"
      >
        {progress}%
      </span>
    </div>
  )
}

export interface ImageCardFailedContentProps {
  /** 具体原因（§3 硬要求②：不得只灰不说）。 */
  reason: string
  retryLabel: string
  onRetry: () => void
}

/** 失败 —— 具体原因 + 重试次级按钮，居中铺满媒体窗。 */
export function ImageCardFailedContent({
  reason,
  retryLabel,
  onRetry,
}: ImageCardFailedContentProps) {
  return (
    <div className="canvas-image-failed">
      <p className="canvas-image-failed-reason line-clamp-3">{reason}</p>
      <button
        type="button"
        onClick={onRetry}
        className="canvas-secondary-btn nodrag"
      >
        {retryLabel}
      </button>
    </div>
  )
}

export interface ImageCardReplacePillProps {
  label: string
  onClick: () => void
}

/** 就绪 · hover —— 居中「替换」白胶囊，仅 hover / 选中出现（父容器需带
 *  `.group` 与 `data-selected`，见 LooseImageCard）。 */
export function ImageCardReplacePill({
  label,
  onClick,
}: ImageCardReplacePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="canvas-image-replace-pill nodrag"
    >
      <RotateCw className="size-3.5" aria-hidden />
      {label}
    </button>
  )
}
