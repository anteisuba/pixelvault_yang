'use client'

import { useTranslations } from 'next-intl'

import type { LoraContentType } from '@/constants/lora'
import { LibraryFilterChipRow } from './LibraryFilterChipRow'

// S2 内容类型筛选（docs/references/pages/lora-workbench.md §3.4）：与 S1 的
// `FamilyChipRow` 同一套形制，走共用基座 `LibraryFilterChipRow`。'all' 不是
// `LORA_CONTENT_TYPES` 表里的一项（表只描述 7 个具体类型的检索契约），标签
// 单独在这里补一条。
const TYPE_LABEL_KEYS: Record<LoraContentType, string> = {
  all: 'typeAll',
  character: 'typeCharacter',
  clothing: 'typeClothing',
  expression: 'typeExpression',
  pose: 'typePose',
  style: 'typeStyle',
  concept: 'typeConcept',
  scene: 'typeScene',
}

interface ContentTypeChipRowProps {
  value: LoraContentType
  /** 已按源过滤好的可选值集合（LORA_CONTENT_TYPE_VALUES_BY_SOURCE[source]）
   *  ——某源完全无供给的类型在调用方就被剔除，不在这里判断。 */
  availableValues: readonly LoraContentType[]
  onChange: (value: LoraContentType) => void
}

export function ContentTypeChipRow({
  value,
  availableValues,
  onChange,
}: ContentTypeChipRowProps) {
  const t = useTranslations('LoraWorkbench')

  return (
    <LibraryFilterChipRow
      rowLabel={t('libraryTypeFilter')}
      groupAriaLabel={t('typeFilterLabel')}
      value={value}
      options={availableValues.map((option) => ({
        value: option,
        label: t(TYPE_LABEL_KEYS[option]),
      }))}
      onChange={onChange}
    />
  )
}
