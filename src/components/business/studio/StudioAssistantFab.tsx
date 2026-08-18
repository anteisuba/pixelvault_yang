'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { studioToolTriggerClass } from '@/components/business/studio-shared/primitives/tool-surface'
import { cn } from '@/lib/utils'

/**
 * StudioAssistantFab —— 工作台右上角的助手浮标（owner 2026-08-14）。
 *
 * 助手本体 `StudioAssistantDock` **早就是覆盖式**（`fixed top-4 right-4
 * bottom-4`，开合只改自身宽度），所以「不挤压空间」这条本来就成立；这里补的
 * 只是那个入口 —— 一颗常驻的浮标，而不是藏在工具条里的一颗丸。
 *
 * ⚠ 开合状态挂在 `panels.enhance` 上（`use-studio-assistant-panel-inputs`
 * 读的就是它），所以这里 dispatch 而不是自己存一份 —— 两份状态必然漂。
 *
 * 视觉沿用 `studioToolTriggerClass`（就是参数栏「模板 / 图像」那两颗），只补
 * 一层浮层必需的底 + 边 + 阴影。**不用 `bg-primary` 实心**：整屏唯一的最高
 * 强调留给「生成」，助手是辅助入口，一屏两个同级实心块等于没有强调。
 *
 * 只在 lg 以上显示：dock 自己也是 `lg:flex`，小屏走的是抽屉那条路（宿主长在
 * `StudioEnhanceButton` 里，参数栏留了它的 `lg:hidden` 那份），这里跟着它，
 * 免得小屏上出现一颗点了没反应的浮标。
 */
export function StudioAssistantFab() {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const open = state.panels.enhance

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'enhance' })}
      aria-pressed={open}
      className={cn(
        studioToolTriggerClass,
        'fixed right-4 top-4 z-50 hidden pl-3 pr-4 lg:inline-flex',
        'border border-border/70 bg-background/85 text-foreground shadow-sm backdrop-blur-sm',
        'hover:bg-muted/60',
        'transition-[transform,opacity,background-color] duration-fast ease-standard',
        // 打开时让位：dock 的标题栏就落在这个角上，浮标留在原地会压住它。
        // 关闭入口由面板头的「收起助手」承担 —— 它跟这颗几乎同坐标，读起来
        // 是「浮标展开成了面板」，不是「入口消失了」。
        open && 'pointer-events-none scale-95 opacity-0',
      )}
    >
      <Sparkles className="size-4" />
      {t('enhance')}
    </button>
  )
}
