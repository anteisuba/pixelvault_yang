'use client'

import { useTranslations } from 'next-intl'

import { LORA_LIBRARY_SOURCES } from '@/constants/lora'
import type { LoraLibrarySource } from '@/constants/lora'
import { Button } from '@/components/ui/button'

// S2（docs/references/pages/lora-workbench.md §3.3）：类型筛选激活
// （type≠all）时的稀疏/空态承接。两者都是说明性内容——中性灰阶，不执行
// 琥珀警示色（§3.3「引导卡/空态均为中性灰阶」）。

interface LoraLibraryTypeSparseCardProps {
  source: LoraLibrarySource
  searchFallbackTerm: string
  onSearchFallback: () => void
}

/**
 * 稀疏态（本页 1–5 条）：R1 单列结果流尾部追加一条虚线引导行——civitai/HF
 * 标注不全，提示用户还可以用关键词兜底搜索。渲染条件由调用方判断（type≠all
 * 且本页结果数 1–5，不管家族/搜索/NSFW 是否同时激活——见 §3.3 验收「冷门
 * 类型+家族组合见引导卡」）。
 */
export function LoraLibraryTypeSparseCard({
  source,
  searchFallbackTerm,
  onSearchFallback,
}: LoraLibraryTypeSparseCardProps) {
  const t = useTranslations('LoraWorkbench')
  const bodyKey =
    source === LORA_LIBRARY_SOURCES.HUGGINGFACE
      ? 'typeSparseBodyHuggingFace'
      : 'typeSparseBody'

  return (
    <div className="mt-1 flex flex-col gap-1 rounded-xl border border-dashed border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          {t('typeSparseTitle')}
        </p>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          {t(bodyKey)}
        </p>
      </div>
      <button
        type="button"
        onClick={onSearchFallback}
        className="shrink-0 text-left text-2xs font-medium text-primary underline underline-offset-2 hover:text-primary/80 sm:text-right"
      >
        {t('typeSparseAction', { term: searchFallbackTerm })}
      </button>
    </div>
  )
}

interface LoraLibraryTypeEmptyStateProps {
  onSearchFallback: () => void
  onClearType: () => void
}

/**
 * 空态（本页 0 条）三件套：仅在 type 是唯一生效筛选时渲染（调用方判断，
 * §3.3「与其他筛选组合为空时走现有『清除筛选』空态」）——此时次要动作
 * 「清除类型筛选」在语义上等同于清空全部筛选（其它筛选本来就是默认值），
 * 调用方应把它接到与「清除筛选」相同的 handler 上，保持一套动作。主动作
 * 文案沿用 §8 参考值「用关键词搜索」（不像稀疏引导卡的行内文字链那样把
 * 词嵌进文案——这里是按钮，onSearchFallback 内部仍会把 searchFallbackTerm
 * 填进搜索框）。
 */
export function LoraLibraryTypeEmptyState({
  onSearchFallback,
  onClearType,
}: LoraLibraryTypeEmptyStateProps) {
  const t = useTranslations('LoraWorkbench')

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {t('typeEmptyTitle')}
        </p>
        <p className="text-xs text-muted-foreground">{t('typeEmptyBody')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onSearchFallback}
          className="h-8 text-xs"
        >
          {t('typeEmptySearch')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClearType}
          className="h-8 text-xs"
        >
          {t('typeEmptyClear')}
        </Button>
      </div>
    </div>
  )
}
