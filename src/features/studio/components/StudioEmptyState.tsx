'use client'

import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { StudioStarterState } from '@/components/business/studio-shared/chrome/StudioStarterState'

type StudioEmptyMode = 'image' | 'tags' | 'video'

/** 每台三颗起手例子（文案键 `StudioEmptyState.examples.<台>.<id>`）。 */
const STARTER_EXAMPLE_IDS = ['a', 'b', 'c'] as const

interface StudioEmptyStateProps {
  mode: StudioEmptyMode
}

/**
 * 图片 / 标签 / 视频台的起手屏：共用 `StudioStarterState`（一句标题 + 一行能做什么 +
 * 三颗例子）。点例子 = `SET_PROMPT` 填进输入框（标签台由 reducer 顺手切成 chip），
 * ⛔ 直接生成。有结果后 `GenerationPreview` 不再渲染它。
 */
export function StudioEmptyState({ mode }: StudioEmptyStateProps) {
  const t = useTranslations('StudioEmptyState')
  const { dispatch } = useStudioForm()

  return (
    <StudioStarterState
      title={t(`title.${mode}`)}
      description={t(`description.${mode}`)}
      examples={STARTER_EXAMPLE_IDS.map((id) => ({
        id,
        text: t(`examples.${mode}.${id}`),
      }))}
      onPickExample={(text) => dispatch({ type: 'SET_PROMPT', payload: text })}
    />
  )
}
