'use client'

import { FolderOpen, ImageIcon } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'

/**
 * 状态矩阵里的几块 —— `docs/references/pages/assets.md` §7。
 *
 * | 状态 | 契约 |
 * | --- | --- |
 * | 空库 | 大空态：「所有生成成品会自动回到这里」+ 上传/去生成两个出口；此时**文件夹段一并隐藏** |
 * | 空文件夹 | 「『X』里还没有素材」+ 指路（拖到门牌 / 批量移动）+ 上传到此文件夹 |
 * | 搜索无结果 | 回显当前全部生效筛选 + 「清除全部筛选」**单一出口** |
 * | 整页加载失败 | 与画廊同一块 `PageLoadError`（空态模板 + 图标角红点 + 重试转圈「重试中」）；文案明确「已加载的内容不会丢失」 |
 * | 分页失败 | ⭐ **只挡这一段**：与画廊同一条尾巴 `FeedTail`——灰块留着，底下一句「这批没拿到 · 重试」 |
 */

interface AssetEmptyLibraryProps {
  onUpload: () => void
}

/**
 * 空库（当前**没有**文件夹上下文那一档）—— 走全站空态原语
 * （`EmptyState`，ui-defaults §7）。
 *
 * ⚠ 下面的 `AssetEmptyFolder`（空文件夹）**故意还没收进原语**：它的文案与出口
 * 依赖 19「文件夹」那一整套还没落地，收口要和 19 一起做，否则改完还得再改一遍。
 */
export function AssetEmptyLibrary({ onUpload }: AssetEmptyLibraryProps) {
  const t = useTranslations('AssetsPage')
  return (
    <EmptyState
      className="my-4"
      icon={<ImageIcon aria-hidden />}
      title={t('emptyTitle')}
      description={t('emptyDescription')}
      action={
        <Button
          type="button"
          className="rounded-full"
          size="sm"
          onClick={onUpload}
        >
          {t('uploadButton')}
        </Button>
      }
      secondaryAction={
        <Button asChild size="sm" variant="ghost" className="rounded-full">
          <Link href={ROUTES.STUDIO_IMAGE}>{t('emptyAction')}</Link>
        </Button>
      }
    />
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
