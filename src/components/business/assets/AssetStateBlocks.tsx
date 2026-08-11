'use client'

import { AlertCircle, FolderOpen, ImageIcon, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * 状态矩阵里的几块 —— `docs/references/pages/assets.md` §7。
 *
 * | 状态 | 契约 |
 * | --- | --- |
 * | 空库 | 大空态：「所有生成成品会自动回到这里」+ 上传/去生成两个出口；此时**文件夹段一并隐藏** |
 * | 空文件夹 | 「『X』里还没有素材」+ 指路（拖到门牌 / 批量移动）+ 上传到此文件夹 |
 * | 搜索无结果 | 回显当前全部生效筛选 + 「清除全部筛选」**单一出口** |
 * | 整页加载失败 | `destructive` **弱化面**（非满屏红）+ 重试；文案明确「已加载的内容不会丢失」 |
 * | 分页失败 | ⭐ **只挡这一段**：网格末尾行内错误条 + 重试 |
 */

interface AssetEmptyLibraryProps {
  onUpload: () => void
}

export function AssetEmptyLibrary({ onUpload }: AssetEmptyLibraryProps) {
  const t = useTranslations('AssetsPage')
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <ImageIcon className="size-6" />
      </span>
      <h2 className="text-xl font-medium text-foreground">{t('emptyTitle')}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t('emptyDescription')}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" size="sm" onClick={onUpload}>
          {t('uploadButton')}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={ROUTES.STUDIO_IMAGE}>{t('emptyAction')}</Link>
        </Button>
      </div>
    </div>
  )
}

interface AssetEmptyFolderProps {
  folderName: string
  onUpload: () => void
}

export function AssetEmptyFolder({
  folderName,
  onUpload,
}: AssetEmptyFolderProps) {
  const t = useTranslations('AssetsPage')
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <FolderOpen className="size-6" />
      </span>
      <h2 className="text-base font-medium text-foreground">
        {t('emptyFolderTitle', { folder: folderName })}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t('emptyFolderHint')}
      </p>
      <Button type="button" size="sm" className="mt-1" onClick={onUpload}>
        {t('emptyFolderUpload')}
      </Button>
    </div>
  )
}

interface AssetEmptySearchProps {
  /** 回显当前全部生效筛选 —— 用户得知道自己在什么口径下看到「空」。 */
  activeFilterLabels: string[]
  onClearFilters: () => void
}

export function AssetEmptySearch({
  activeFilterLabels,
  onClearFilters,
}: AssetEmptySearchProps) {
  const t = useTranslations('AssetsPage')
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <h2 className="text-base font-medium text-foreground">
        {t('emptySearchTitle')}
      </h2>
      {activeFilterLabels.length > 0 && (
        <p className="flex max-w-xl flex-wrap items-center justify-center gap-1.5">
          {activeFilterLabels.map((label) => (
            <span
              key={label}
              className="inline-flex h-6 items-center rounded-md border border-border bg-muted/40 px-2 text-2xs text-foreground"
            >
              {label}
            </span>
          ))}
        </p>
      )}
      {/* ⭐ 单一出口：不给第二个按钮分散注意力。 */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onClearFilters}
      >
        {t('facetClearAll')}
      </Button>
    </div>
  )
}

interface AssetErrorBlockProps {
  message: string
  onRetry: () => void
  className?: string
}

/** 整页加载失败 —— 弱化的 destructive 面，不是满屏红。 */
export function AssetPageError({
  message,
  onRetry,
  className,
}: AssetErrorBlockProps) {
  const t = useTranslations('AssetsPage')
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3',
        className,
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertCircle className="size-4 text-destructive" />
        {message}
      </span>
      <p className="text-xs text-muted-foreground">{t('errorKeepsLoaded')}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-1"
        onClick={onRetry}
      >
        <RotateCcw className="size-3.5" />
        {t('errorRetry')}
      </Button>
    </div>
  )
}

/** 分页失败 —— 网格末尾的行内错误条，**只挡这一段**。 */
export function AssetPaginationError({
  message,
  onRetry,
  className,
}: AssetErrorBlockProps) {
  const t = useTranslations('AssetsPage')
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2',
        className,
      )}
    >
      <AlertCircle className="size-3.5 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-2xs text-foreground transition-colors hover:bg-muted"
      >
        <RotateCcw className="size-3" />
        {t('errorRetry')}
      </button>
    </div>
  )
}
