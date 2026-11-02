'use client'

import { ChevronLeft, ChevronRight } from '@/components/icons'
import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

import { formatLibraryTotal } from './lora-library-filter-labels'

interface LoraLibraryPaginationProps {
  page: number
  total: number | null
  /** 总数是封顶数（Civitai 索引数到上限就停） */
  totalCapped?: boolean
  hasNextPage: boolean
  isBusy: boolean
  onPreviousPage: () => void
  onNextPage: () => void
}

// S1 统一外壳：civitai 的 CommunityPagination 和 HF 的 HuggingFacePagination
// 此前是两份几乎逐字相同的实现——收成一个，两个 tab 共用。
export function LoraLibraryPagination({
  page,
  total,
  totalCapped = false,
  hasNextPage,
  isBusy,
  onPreviousPage,
  onNextPage,
}: LoraLibraryPaginationProps) {
  const t = useTranslations('LoraWorkbench')
  const format = useFormatter()
  const pageStatus = total
    ? t('communityPageStatusKnown', {
        page,
        total: formatLibraryTotal(format, total, totalCapped),
      })
    : t('communityPageStatus', { page })

  return (
    <nav
      aria-label={pageStatus}
      className="flex w-full shrink-0 items-center justify-between gap-2 rounded-xl border border-border/60 bg-background p-2 lg:mt-1 lg:bg-muted/20"
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={page <= 1 || isBusy}
        onClick={onPreviousPage}
        className="h-11 justify-center px-2.5 text-xs sm:min-w-24 sm:px-3"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {t('communityPrevious')}
      </Button>

      <span
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-background px-2.5 text-xs font-medium whitespace-nowrap text-foreground ring-1 ring-border/60 sm:px-3"
        aria-live="polite"
      >
        {pageStatus}
      </span>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!hasNextPage || isBusy}
        onClick={onNextPage}
        className="h-11 justify-center px-2.5 text-xs sm:min-w-24 sm:px-3"
      >
        {t('communityNext')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Button>
    </nav>
  )
}
