'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

interface LoraLibraryPaginationProps {
  page: number
  total: number | null
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
  hasNextPage,
  isBusy,
  onPreviousPage,
  onNextPage,
}: LoraLibraryPaginationProps) {
  const t = useTranslations('LoraWorkbench')
  const pageStatus = total
    ? t('communityPageStatusKnown', { page, total })
    : t('communityPageStatus', { page })

  return (
    <nav
      aria-label={pageStatus}
      className="mt-1 flex shrink-0 flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1 || isBusy}
        onClick={onPreviousPage}
        className="h-9 justify-center text-xs sm:min-w-24"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {t('communityPrevious')}
      </Button>

      <span
        className="inline-flex h-9 items-center justify-center rounded-lg bg-background px-3 text-xs font-medium text-foreground ring-1 ring-border/60"
        aria-live="polite"
      >
        {pageStatus}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNextPage || isBusy}
        onClick={onNextPage}
        className="h-9 justify-center text-xs sm:min-w-24"
      >
        {t('communityNext')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Button>
    </nav>
  )
}
