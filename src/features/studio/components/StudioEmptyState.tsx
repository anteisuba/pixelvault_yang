'use client'

import { useTranslations } from 'next-intl'

type StudioEmptyMode = 'image' | 'video'

interface StudioEmptyStateProps {
  mode: StudioEmptyMode
}

/**
 * StudioEmptyState — 台的起手屏：**一句话**，输入框在下面（ui-spec §2，owner 2026-11-03）。
 *
 * ⛔ 示例按钮 / 示例卡、「继续创作」、「查看操作教程」与首访自动弹的教程都已删：先去掉，
 * 新的起手屏等 mock 定了再做（ui-defaults §7）。标签台与图片台同一句。
 *
 * 布局注意：根元素的 `.studio-empty-state` 类是 src/styles/studio.css 里
 * `.studio-workbench-stage:has(...)` 规则的锚点 —— 空态时结果区吃满剩余
 * 高度、内容垂直居中。
 */
export function StudioEmptyState({ mode }: StudioEmptyStateProps) {
  const t = useTranslations('StudioEmptyState')

  return (
    <div className="studio-empty-state flex w-full grow flex-col items-center justify-center px-3 py-4 lg:px-4 lg:py-6">
      <h2 className="text-center text-xl font-semibold text-foreground">
        {t(`title.${mode}`)}
      </h2>
    </div>
  )
}
