'use client'

import { useTranslations } from 'next-intl'

import { Info } from '@/components/icons'
import { cn } from '@/lib/utils'

interface SearchGroundingPublishNoteProps {
  /** 这张（或选中的全部）用过「先搜再画」—— 原因行长出来；否则收起。 */
  show: boolean
  /** 给被禁用的「发布」挂 `aria-describedby`。 */
  id?: string
  /**
   * `single` = 一张图（查看器 / 素材详情）；`bulk` = 多选里全是这类图；
   * `bulkShort` = 手机多选那一条窄的。
   */
  variant?: 'single' | 'bulk' | 'bulkShort'
  className?: string
  /** 浮在内容上的那一条（多选工具条上方）要自己的底。 */
  noteClassName?: string
}

/**
 * 「发布」被禁用时写在按钮下面的一行原因（B 定稿：禁用态 opacity .5、不隐藏，
 * 原因写出来、不靠悬停）。开 = 高度 0 → 一行（spring-slot），关 = 收起（base）。
 */
export function SearchGroundingPublishNote({
  show,
  id,
  variant = 'single',
  className,
  noteClassName,
}: SearchGroundingPublishNoteProps) {
  const t = useTranslations('SearchGrounding')
  return (
    <div
      data-open={show ? 'true' : 'false'}
      aria-hidden={!show}
      className={cn('search-sources-slot search-sources-slot--rows', className)}
    >
      <div>
        <p
          id={id}
          role="note"
          className={cn(
            'flex items-start gap-1.75 text-xs leading-4.5 text-muted-foreground',
            noteClassName,
          )}
        >
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {variant === 'bulk'
              ? t('bulkAllBlocked')
              : variant === 'bulkShort'
                ? t('bulkAllBlockedShort')
                : t('publishWhy')}
          </span>
        </p>
      </div>
    </div>
  )
}
