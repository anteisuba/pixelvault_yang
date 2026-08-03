'use client'

import { RotateCw, Square, Triangle, X, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { NodeProgressState } from './NodeProgressState'

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
   *  不得沿用生成态的「无百分比」）。走 XHR 的真实字节数，不是估算。 */
  progress: number
  /** 例如「上传中 42%」，数字已经拼进文案（caller 用 t('uploading', {percent})）。 */
  label: string
  cancelLabel: string
  onCancel: () => void
}

/**
 * 上传中 —— 遮罩 + 文案（含百分比）+ **确定式**条 + × 取消。
 *
 * 台账 #14（owner 2026-08-03 拍板②）：上传与生成收进同一条轴。此前上传的百分比
 * 只活在文案里，视觉上没有条（只有一个 `sr-only` 的 progressbar）；现在同一个
 * 器件两种行为 —— **上传有真实百分比 → 宽度随进度**，**生成拿不到 → 不定式来回
 * 扫**，用户一眼分得清哪个能预估完成时间。
 */
export function ImageCardUploadOverlay({
  progress,
  label,
  cancelLabel,
  onCancel,
}: ImageCardUploadOverlayProps) {
  return (
    <NodeProgressState
      label={label}
      progress={progress}
      veiled
      action={
        <button
          type="button"
          onClick={onCancel}
          aria-label={cancelLabel}
          title={cancelLabel}
          className="canvas-image-cancel-btn nodrag"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      }
    />
  )
}

export interface ImageCardGeneratingOverlayProps {
  /** 「生成中」文案，无百分比（canvas-image-card.md §3 第六态，
   *  2026-07-28 owner 真机实测缺陷④补）。生成期间前端拿不到真实进度——规格
   *  §5 原话「生成中 ↻（无百分比）」明确禁止假造一个。它与
   *  `ImageCardUploadOverlay` 的区别因此只剩两处：条是**不定式**的（没有
   *  百分比可给），且没有取消按钮（生成不可取消）。 */
  label: string
}

/**
 * 生成中 —— 遮罩 + **不定式**条（台账 #14 统一后的唯一说法）。
 *
 * ⚠ `labelShownElsewhere` 写死在这里：这颗浮层的唯一调用方
 * （`ImageSourceStarter`）在同一个媒体窗的左上角必然还挂着一枚
 * `ImageCardStatusBadge variant="generating"`，上面就写着「生成中」。
 * 中央再写一遍就是 B6「信息说三遍」那个病。文案降为 `sr-only`，读屏与进度条的
 * 可访问名都不受影响。
 *
 * 对照：`ImageCardUploadOverlay` 的中央文案**要显示**，因为它带着百分比
 * （「上传中 42%」），角标只有「上传中」—— 那不是重复，是多一档信息。
 */
export function ImageCardGeneratingOverlay({
  label,
}: ImageCardGeneratingOverlayProps) {
  return <NodeProgressState label={label} veiled labelShownElsewhere />
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
