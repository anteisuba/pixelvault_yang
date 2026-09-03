'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'

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
  // ⚠ useIsMobile() 恒为 false 直到 mount 后的 effect 跑完（SSR 无 matchMedia）。
  // 桌面单行条在服务端先渲染出来，挂载后手机再切成胶囊——本页可接受这一帧切换。
  const isMobile = useIsMobile()
  const pageStatus = total
    ? t('communityPageStatusKnown', { page, total })
    : t('communityPageStatus', { page })

  if (isMobile) {
    const pageLabel = total ? `${page} / ${total}` : `${page}`
    return (
      <nav
        aria-label={pageStatus}
        // 手机改悬浮胶囊：40px 高、贴底安全区，不再占内容区一整行
        // （owner 2026-09-03，接续上面 mt-1 那条记录的堆行问题）。
        className="bg-background/85 border-border sticky bottom-safe-bottom z-10 mx-auto flex h-10 w-fit shrink-0 items-center gap-1 rounded-full border px-1 shadow-sm backdrop-blur"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          disabled={page <= 1 || isBusy}
          onClick={onPreviousPage}
          aria-label={t('communityPrevious')}
          className="shrink-0 rounded-full"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>

        <span
          className="text-foreground px-2 text-xs font-medium tabular-nums whitespace-nowrap"
          aria-live="polite"
        >
          {pageLabel}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          disabled={!hasNextPage || isBusy}
          onClick={onNextPage}
          aria-label={t('communityNext')}
          className="shrink-0 rounded-full"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </nav>
    )
  }

  return (
    <nav
      aria-label={pageStatus}
      // ⚠ 手机上别再堆成三整行：375×812 里那是 150px，占了内容区的 27%，
      // 库里一页只剩 6 行结果（owner 2026-09-03）。三个控件本来就只要 250px 宽。
      className="mt-1 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 p-2"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1 || isBusy}
        onClick={onPreviousPage}
        className="touch-target-y h-9 justify-center px-2.5 text-xs sm:min-w-24 sm:px-3"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {t('communityPrevious')}
      </Button>

      <span
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-background px-2.5 text-xs font-medium whitespace-nowrap text-foreground ring-1 ring-border/60 sm:px-3"
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
        className="touch-target-y h-9 justify-center px-2.5 text-xs sm:min-w-24 sm:px-3"
      >
        {t('communityNext')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Button>
    </nav>
  )
}
