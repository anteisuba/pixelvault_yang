'use client'

import { useCallback, useMemo } from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE,
  LORA_LIBRARY_SOURCES,
  LORA_TOAST_DURATION_MS,
  civitaiBaseModelToFamilySlug,
  familySlugToCivitaiBaseModel,
  isCivitaiBaseModelGeneratable,
} from '@/constants/lora'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
import type { CivitaiLoraLibraryItem } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { LoraLibraryCard } from './LoraLibraryCard'
import { LoraLibraryChipRow } from './LoraLibraryChipRow'
import {
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'
import { LoraLibraryPagination } from './LoraLibraryPagination'

interface LoraLibraryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// S3 库 modal（方向 B「＋添加 LoRA」唤起·配屏 3）：分类库以对话框覆盖生成页，
// 即筛即挂不离开创作。本轮 = Civitai 源（卡网格 + 分类/底模 chip 横排 + 安全模式
// + 分页），HF/我的 + 源 segmented 作后续增量。engine 直接跑 useCivitaiLoraLibrary
// （不做 URL sync——URL sync 是「库」tab pane 的职责，modal 用独立实例避免污染
// 生成页 URL），现有行 pane / 库 tab 零改动。安全模式 = nsfwFilter safe↔unrestricted
// 两态收敛（默认 safe·关→直显）。
export function LoraLibraryModal({
  open,
  onOpenChange,
}: LoraLibraryModalProps) {
  const t = useTranslations('LoraWorkbench')
  const stack = useActiveLoraStack()
  const library = useCivitaiLoraLibrary({})

  const typeOptions = useMemo(
    () =>
      LORA_CONTENT_TYPE_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI].map(
        (value) => ({ value, label: t(LORA_CONTENT_TYPE_LABEL_KEYS[value]) }),
      ),
    [t],
  )
  const familyOptions = useMemo(
    () =>
      LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI].map(
        (value) => ({ value, label: t(LORA_LIBRARY_FAMILY_LABEL_KEYS[value]) }),
      ),
    [t],
  )

  const mountedUrls = useMemo(
    () => new Set(stack.items.map((entry) => entry.asset.loraUrl)),
    [stack.items],
  )

  const safeMode = library.nsfwFilter === 'safe'
  const handleUse = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      // 不可 fal hosted 出图的族（如 Anima DiT）——挂载会必然失败，改开 Civitai
      // 来源页（与行 pane handleUse 同策略）。
      if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return
      }
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      // 已在生成页（＋添加从装配栏唤起）——挂完直接收起 modal，不跳页。
      onOpenChange(false)
    },
    [onOpenChange, stack, t],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="space-y-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="shrink-0 text-sm font-semibold">
              {t('tabs.library')}
            </DialogTitle>
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={library.search}
                onChange={(e) => library.setSearch(e.target.value)}
                placeholder={t('library.searchPlaceholder')}
                className="h-9 pl-8 text-sm"
                aria-label={t('library.searchPlaceholder')}
              />
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                size="sm"
                checked={safeMode}
                onCheckedChange={(v) =>
                  library.setNsfwFilter(v ? 'safe' : 'unrestricted')
                }
                aria-label={t('library.safeMode')}
              />
              {t('library.safeMode')}
            </label>
          </div>
          <LoraLibraryChipRow
            ariaLabel={t('typeFilterLabel')}
            options={typeOptions}
            value={library.contentType}
            onChange={(value) =>
              library.setContentType(
                value as (typeof typeOptions)[number]['value'],
              )
            }
          />
          <LoraLibraryChipRow
            label={t('libraryFamilyFilter')}
            ariaLabel={t('baseModelFilterLabel')}
            options={familyOptions}
            value={civitaiBaseModelToFamilySlug(library.baseModel)}
            onChange={(slug) =>
              library.setBaseModel(
                familySlugToCivitaiBaseModel(
                  slug as (typeof familyOptions)[number]['value'],
                ),
              )
            }
          />
        </DialogHeader>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-4 py-4 transition-opacity',
            library.isRevalidating && library.items.length > 0
              ? 'opacity-60'
              : 'opacity-100',
          )}
          aria-busy={library.isRevalidating}
        >
          {library.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          ) : library.error && library.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <AlertCircle className="size-4 text-destructive" aria-hidden />
                {t('communityLoadFailed')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void library.refresh()}
              >
                {t('refresh')}
              </Button>
            </div>
          ) : library.items.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-center text-xs text-muted-foreground">
              {t('communityEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {library.items.map((item) => (
                <LoraLibraryCard
                  key={item.id}
                  source="civitai"
                  item={item}
                  mounted={mountedUrls.has(item.loraUrl)}
                  onUse={() => handleUse(item)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5">
          <LoraLibraryPagination
            page={library.page}
            total={library.total}
            hasNextPage={library.hasNextPage}
            isBusy={library.isRevalidating}
            onPreviousPage={library.previousPage}
            onNextPage={library.nextPage}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
