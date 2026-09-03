'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  LORA_LIBRARY_FILTER_SHEET_CLASS,
  LORA_LIBRARY_MOBILE_CHIP_CLASS,
  LORA_LIBRARY_MOBILE_CHIP_ROW_CLASS,
  LORA_LIBRARY_SHEET_OPTION_CLASS,
  LORA_LIBRARY_SOURCES,
  type LoraContentType,
  type LoraLibraryFamily,
  type LoraLibrarySource,
  type LoraNsfwFilter,
} from '@/constants/lora'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'

// <1024 的库筛选（ui-defaults.md §6「LoRA 降级」＋ pages/lora-library.md
// 「移动端」）：桌面上散在顶栏和结果区上方的 来源 / 排序 / 类型 / 底模 / 安全 /
// 刷新 六个控件，在手机上收成**一行 chip**，全部选项进底部 sheet。
//
// 为什么不是「每个 chip 一个自己的小浮层」：三个浮层 = 三套开合状态 + 三种
// 命中区，而它们本来就是同一件事（缩小结果集）。一个 sheet 里分区呈现更简单，
// 也与 2026-08-07「排序/筛选分层，不混排」的拍板一致。
//
// ⚠ 状态**不归本组件所有**：所有值和 setter 都是 library hook 的，点即生效
// （没有本地草稿态），所以 footer 的「显示 N 条结果」是活的真实计数。

interface LoraLibraryFilterOptionItem<T extends string> {
  value: T
  label: string
}

export interface LoraLibraryMobileFiltersProps {
  source: LoraLibrarySource
  onSourceChange: (value: LoraLibrarySource) => void
  /** 排序值域按源不同（civitai 是字符串枚举，HF 是另一套），这里只走字符串。 */
  sortValue: string
  sortOptions: readonly LoraLibraryFilterOptionItem<string>[]
  onSortChange: (value: string) => void
  contentType: LoraContentType
  typeOptions: readonly LoraLibraryFilterOptionItem<LoraContentType>[]
  onContentTypeChange: (value: LoraContentType) => void
  familySlug: LoraLibraryFamily
  familyOptions: readonly LoraLibraryFilterOptionItem<LoraLibraryFamily>[]
  onFamilyChange: (value: LoraLibraryFamily) => void
  /** null = 该源没有分级数据（HF），整个「安全」分区不渲染。 */
  nsfwFilter: LoraNsfwFilter | null
  nsfwOptions: readonly LoraLibraryFilterOptionItem<LoraNsfwFilter>[]
  onNsfwFilterChange: (value: LoraNsfwFilter) => void
  /** 结果总数，未知时 footer 退化成「显示结果」。 */
  total: number | null
  /** chip 上的 ●N：类型/底模/安全里非默认值的个数，0 时不渲染角标。 */
  activeFilterCount: number
  onClearFilters: () => void
  onRefresh: () => void
}

function SheetSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-2xs font-medium uppercase tracking-nav text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  )
}

function OptionChip({
  label,
  isSelected,
  onClick,
}: {
  label: string
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onClick}
      className={cn(
        LORA_LIBRARY_SHEET_OPTION_CLASS,
        isSelected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/60 bg-background text-foreground',
      )}
    >
      {label}
    </button>
  )
}

export function LoraLibraryMobileFilters({
  source,
  onSourceChange,
  sortValue,
  sortOptions,
  onSortChange,
  contentType,
  typeOptions,
  onContentTypeChange,
  familySlug,
  familyOptions,
  onFamilyChange,
  nsfwFilter,
  nsfwOptions,
  onNsfwFilterChange,
  total,
  activeFilterCount,
  onClearFilters,
  onRefresh,
}: LoraLibraryMobileFiltersProps) {
  const t = useTranslations('LoraWorkbench')
  const [open, setOpen] = useState(false)
  const [familyQuery, setFamilyQuery] = useState('')

  const sourceLabel =
    source === LORA_LIBRARY_SOURCES.HUGGINGFACE
      ? t('librarySourceHuggingFace')
      : t('librarySourceCivitai')
  const sortLabel = useMemo(
    () => sortOptions.find((option) => option.value === sortValue)?.label ?? '',
    [sortOptions, sortValue],
  )
  const filteredFamilyOptions = useMemo(() => {
    const term = familyQuery.trim().toLowerCase()
    if (!term) return familyOptions
    return familyOptions.filter((option) =>
      option.label.toLowerCase().includes(term),
    )
  }, [familyOptions, familyQuery])

  return (
    <>
      <div
        className={LORA_LIBRARY_MOBILE_CHIP_ROW_CLASS}
        role="group"
        aria-label={t('mobileFilterBar')}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${t('librarySourceLabel')}：${sourceLabel}`}
          className={LORA_LIBRARY_MOBILE_CHIP_CLASS}
        >
          {sourceLabel}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${t('communitySortFilter')}：${sortLabel}`}
          className={LORA_LIBRARY_MOBILE_CHIP_CLASS}
        >
          {sortLabel}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={
            activeFilterCount > 0
              ? t('mobileFilterActive', { count: activeFilterCount })
              : t('mobileFilters')
          }
          className={cn(
            LORA_LIBRARY_MOBILE_CHIP_CLASS,
            activeFilterCount > 0 && 'border-primary text-primary',
          )}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {t('mobileFilters')}
          {activeFilterCount > 0 ? (
            <span
              data-testid="lora-mobile-filter-badge"
              className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full bg-primary text-3xs font-semibold tabular-nums text-primary-foreground"
            >
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {/* 刷新不是筛选条件，但它在桌面那行的末尾，手机上不能整个丢掉——
            收成一颗图标 chip 排在最后。 */}
        <button
          type="button"
          onClick={onRefresh}
          aria-label={t('refresh')}
          className={cn(
            LORA_LIBRARY_MOBILE_CHIP_CLASS,
            'w-8 justify-center px-0',
          )}
        >
          <RefreshCw className="size-3.5" aria-hidden />
        </button>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          className={cn('flex flex-col', LORA_LIBRARY_FILTER_SHEET_CLASS)}
        >
          <DrawerTitle className="sr-only">{t('mobileFilters')}</DrawerTitle>
          <header className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="text-sm font-semibold text-foreground">
              {t('mobileFilters')}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-8 text-xs"
            >
              {t('mobileFilterClear')}
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-3">
            <SheetSection label={t('librarySourceLabel')}>
              <div className="grid grid-cols-2 gap-2">
                <OptionChip
                  label={t('librarySourceCivitai')}
                  isSelected={source === LORA_LIBRARY_SOURCES.CIVITAI}
                  onClick={() => onSourceChange(LORA_LIBRARY_SOURCES.CIVITAI)}
                />
                <OptionChip
                  label={t('librarySourceHuggingFace')}
                  isSelected={source === LORA_LIBRARY_SOURCES.HUGGINGFACE}
                  onClick={() =>
                    onSourceChange(LORA_LIBRARY_SOURCES.HUGGINGFACE)
                  }
                />
              </div>
            </SheetSection>

            <SheetSection label={t('communitySortFilter')}>
              <div className="flex flex-wrap gap-2">
                {sortOptions.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    isSelected={option.value === sortValue}
                    onClick={() => onSortChange(option.value)}
                  />
                ))}
              </div>
            </SheetSection>

            <SheetSection label={t('libraryTypeFilter')}>
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    isSelected={option.value === contentType}
                    onClick={() => onContentTypeChange(option.value)}
                  />
                ))}
              </div>
            </SheetSection>

            <SheetSection label={t('libraryFamilyFilter')}>
              <Input
                value={familyQuery}
                onChange={(event) => setFamilyQuery(event.target.value)}
                placeholder={t('baseModelSearchPlaceholder')}
                aria-label={t('baseModelSearchPlaceholder')}
                className="h-9 text-xs"
              />
              {filteredFamilyOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('baseModelSearchEmpty')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredFamilyOptions.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      isSelected={option.value === familySlug}
                      onClick={() => onFamilyChange(option.value)}
                    />
                  ))}
                </div>
              )}
            </SheetSection>

            {/* 安全分区只在有分级数据的源（Civitai）出现——HF 没有分级字段，
                渲染一个永远无效的开关比不渲染更糟。 */}
            {nsfwFilter !== null ? (
              <SheetSection label={t('safetyLabel')}>
                <div className="flex flex-wrap gap-2">
                  {nsfwOptions.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      isSelected={option.value === nsfwFilter}
                      onClick={() => onNsfwFilterChange(option.value)}
                    />
                  ))}
                </div>
              </SheetSection>
            ) : null}
          </div>

          <footer className="border-border/60 bg-background border-t px-4 pt-3 pb-safe-bottom">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 w-full text-sm"
            >
              {total === null
                ? t('mobileFilterApplyUnknown')
                : t('mobileFilterApply', { count: total })}
            </Button>
          </footer>
        </DrawerContent>
      </Drawer>
    </>
  )
}
