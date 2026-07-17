'use client'

import { useTranslations } from 'next-intl'

import type { LoraLibraryFamily } from '@/constants/lora'
import { LibraryFilterChipRow } from './LibraryFilterChipRow'

// S1 统一外壳（docs/references/pages/lora-workbench.md §2.1/§2.2）：civitai
// 和 HuggingFace 两个 tab 各自保留独立的 hook/搜索/NSFW/排序，但「底模」筛选
// chip 行统一成同一个组件——slug 域（LoraLibraryFamily）+ 同一套形制（h-8 /
// 选中态 border-primary/40 bg-primary/10 text-primary / 触屏 44px 命中区，
// 现由 S2 抽出的 `LibraryFilterChipRow` 共用基座提供）。调用方负责把 slug
// 翻译成各自源的原始 baseModel 值（constants/lora.ts 的
// civitaiBaseModelToFamilySlug 等纯函数），本组件不碰任何 API 层值域。
const FAMILY_LABEL_KEYS: Record<LoraLibraryFamily, string> = {
  all: 'familyLabel.all',
  illustrious: 'familyLabel.illustrious',
  flux: 'familyLabel.flux',
  sdxl: 'familyLabel.sdxl',
  pony: 'familyLabel.pony',
  sd15: 'familyLabel.sd15',
  anima: 'familyLabel.anima',
  qwen: 'familyLabel.qwen',
  'z-image': 'familyLabel.zImage',
  chroma: 'familyLabel.chroma',
  other: 'familyLabel.other',
}

interface FamilyChipRowProps {
  value: LoraLibraryFamily
  /** 已按源过滤好的可选值集合（LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[source]）——
   *  某源不支持的 family 在调用方就被剔除，不在这里判断。 */
  availableValues: readonly LoraLibraryFamily[]
  onChange: (value: LoraLibraryFamily) => void
}

export function FamilyChipRow({
  value,
  availableValues,
  onChange,
}: FamilyChipRowProps) {
  const t = useTranslations('LoraWorkbench')

  return (
    <LibraryFilterChipRow
      rowLabel={t('libraryFamilyFilter')}
      groupAriaLabel={t('baseModelFilterLabel')}
      value={value}
      options={availableValues.map((option) => ({
        value: option,
        label: t(FAMILY_LABEL_KEYS[option]),
      }))}
      onChange={onChange}
    />
  )
}
