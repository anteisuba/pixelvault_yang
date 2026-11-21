'use client'

import { FolderOpen, ImageIcon } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
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
 * | 整页加载失败 | 与画廊同一块 `PageLoadError`（空态模板 + 图标角红点 + 重试转圈「重试中」）；文案明确「已加载的内容不会丢失」 |
 * | 分页失败 | ⭐ **只挡这一段**：与画廊同一条尾巴 `FeedTail`——灰块留着，底下一句「这批没拿到 · 重试」 |
 *
 * `variant="picker"` = 挑选弹框（page §8 任务型 shell）里的同一块：留白收小（弹框 1000×680 /
 * 手机抽屉，⛔ 整页那么大）；上传由网格首格的上传格负责，这里不再给第二个上传钮；
 * ⛔「去生成」—— 弹框是任务框，点了就丢下原任务离开。
 */
type AssetStateVariant = 'page' | 'picker'

interface AssetEmptyLibraryProps {
  /** 缺省 = 不给上传钮（挑选弹框：首格就是上传格）。 */
  onUpload?: () => void
  /** 挑选弹框锁了类型时改说「还没有视频素材」。缺省 = `emptyTitle`。 */
  title?: string
  variant?: AssetStateVariant
}

/**
 * 空库（当前**没有**文件夹上下文那一档）—— 走全站空态原语
 * （`EmptyState`，ui-defaults §7）。
 *
 * ⚠ 下面的 `AssetEmptyFolder`（空文件夹）**故意还没收进原语**：它的文案与出口
 * 依赖 19「文件夹」那一整套还没落地，收口要和 19 一起做，否则改完还得再改一遍。
 */
export function AssetEmptyLibrary({
  onUpload,
  title,
  variant = 'page',
}: AssetEmptyLibraryProps) {
  const t = useTranslations('AssetsPage')
  return (
    <EmptyState
      className={variant === 'picker' ? 'my-2' : 'my-4'}
      icon={<ImageIcon aria-hidden />}
      title={title ?? t('emptyTitle')}
      description={t('emptyDescription')}
      action={
        onUpload ? (
          <Button
            type="button"
            className="rounded-full coarse:h-11"
            size="sm"
            onClick={onUpload}
          >
            {t('uploadButton')}
          </Button>
        ) : undefined
      }
      secondaryAction={
        variant === 'page' ? (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="rounded-full coarse:h-11"
          >
            <Link href={ROUTES.STUDIO_IMAGE}>{t('emptyAction')}</Link>
          </Button>
        ) : undefined
      }
    />
  )
}

interface AssetEmptyFolderProps {
  folderName: string
  /** 缺省 = 不给上传钮（挑选弹框：首格就是上传格）。 */
  onUpload?: () => void
  /** 缺省 = 整页那句「拖到夹上 / 加入文件夹」；挑选弹框里没有这些动作，换一句。 */
  hint?: string
  variant?: AssetStateVariant
}

export function AssetEmptyFolder({
  folderName,
  onUpload,
  hint,
  variant = 'page',
}: AssetEmptyFolderProps) {
  const t = useTranslations('AssetsPage')
  const compact = variant === 'picker'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'py-8' : 'py-16',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground',
          compact ? 'size-10 rounded-12' : 'size-12 rounded-2xl',
        )}
      >
        <FolderOpen className={compact ? 'size-5' : 'size-6'} />
      </span>
      <h2
        className={cn(
          'font-medium text-foreground',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        {t('emptyFolderTitle', { folder: folderName })}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hint ?? t('emptyFolderHint')}
      </p>
      {onUpload ? (
        <Button
          type="button"
          size="sm"
          className="mt-1 coarse:h-11"
          onClick={onUpload}
        >
          {t('emptyFolderUpload')}
        </Button>
      ) : null}
    </div>
  )
}

interface AssetEmptySearchProps {
  /** 回显当前全部生效筛选 —— 用户得知道自己在什么口径下看到「空」。 */
  activeFilterLabels: string[]
  onClearFilters: () => void
  variant?: AssetStateVariant
}

export function AssetEmptySearch({
  activeFilterLabels,
  onClearFilters,
  variant = 'page',
}: AssetEmptySearchProps) {
  const t = useTranslations('AssetsPage')
  const compact = variant === 'picker'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'py-8' : 'py-16',
      )}
    >
      <h2
        className={cn(
          'font-medium text-foreground',
          compact ? 'text-sm' : 'text-base',
        )}
      >
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
        variant="secondary"
        className="coarse:h-11"
        onClick={onClearFilters}
      >
        {t('facetClearAll')}
      </Button>
    </div>
  )
}
