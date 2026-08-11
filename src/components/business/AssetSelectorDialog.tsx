'use client'

import { X } from 'lucide-react'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { AssetPickerBrowser } from '@/components/business/assets/AssetPickerBrowser'
import type { GenerationRecord, OutputTypeValue } from '@/types'

interface AssetSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Single-select callback. Required unless `multiSelect` is true (in which
   *  case `onConfirmMany` takes over). Keep both behaviours mutually
   *  exclusive at the call site so the dialog has one resolution path. */
  onSelect?: (generation: GenerationRecord) => void
  initialGenerations?: GenerationRecord[]
  initialTotal?: number
  initialHasMore?: boolean
  initialNextCursor?: string | null
  /** Visually-hidden title required by Radix Dialog for screen readers. */
  title: string
  /** Visually-hidden description for screen readers. */
  description: string
  /**
   * 把 picker 锁到单一媒体类型。⚠ **锁 = 不渲染，不是灰掉**（page §8.2）——
   * 灰掉等于承诺「可选」，会误导。
   */
  mediaType?: OutputTypeValue
  /**
   * 多选模式。判据是**消费端是槽还是集合**（page §8.3）：填一个槽（替换）用
   * 单选，往集合里加（追加 + 有容量）才用多选。⛔ 不要为了「统一」把所有入口
   * 改成多选 —— 17 个高频入口会从 1 击变 2 击。
   */
  multiSelect?: boolean
  /** Fires when the user clicks "Add N" in multi-select mode. The dialog
   *  closes itself afterwards. */
  onConfirmMany?: (generations: GenerationRecord[]) => void
  /** 多选容量。传**剩余容量**（`上限 - 已有`），picker 据此就地红字拒绝。 */
  maxSelection?: number
}

/**
 * AssetSelectorDialog —— 任务型素材选择器的外壳（响应式 Dialog / Drawer）。
 *
 * ⭐ 内部是 `AssetPickerBrowser`（page §8 的任务型 shell），**不再**把整个
 * `/assets` 页缩进弹窗：没有文件夹门牌墙、没有密度控制、没有批量管理动作。
 * 单选/多选**只差 checkbox 与底部条**，所以这里只渲染一次，用 `mode` 区分
 * （以前是两整棵 `<KreaAssetBrowser>`，两套 props 两条路径）。
 */
export function AssetSelectorDialog({
  open,
  onOpenChange,
  onSelect,
  initialGenerations,
  initialTotal,
  initialHasMore,
  initialNextCursor,
  title,
  description,
  mediaType,
  multiSelect = false,
  onConfirmMany,
  maxSelection,
}: AssetSelectorDialogProps) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        showCloseButton={false}
        className="h-[min(88svh,760px)] !max-w-none !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl lg:h-[min(65vh,600px)] lg:w-[calc(100%-2rem)] lg:!max-w-4xl"
        mobileBodyClassName="px-0 pt-0"
      >
        <ResponsiveDialogTitle className="sr-only">
          {title}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          {description}
        </ResponsiveDialogDescription>
        <div className="relative flex size-full flex-col overflow-hidden rounded-xl border border-border bg-background">
          <button
            type="button"
            aria-label={title}
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-3.5" />
          </button>
          <AssetPickerBrowser
            mode={multiSelect ? 'multi' : 'single'}
            mediaType={mediaType}
            maxSelection={maxSelection}
            initialGenerations={initialGenerations}
            initialTotal={initialTotal}
            initialHasMore={initialHasMore}
            initialNextCursor={initialNextCursor}
            title={title}
            onSelect={(generation) => {
              onSelect?.(generation)
              onOpenChange(false)
            }}
            onConfirmMany={(generations) => {
              onConfirmMany?.(generations)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
