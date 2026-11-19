'use client'

import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface StudioStarterExample {
  /** 稳定键（三语共用，⛔ 拿文案当键）。 */
  readonly id: string
  /** 药丸上写的字 = 点了填进输入的那一段。 */
  readonly text: string
}

export interface StudioStarterStateProps {
  /** 一句标题（ui-spec §4 `head` 20 / 600，桌面原位不动）。 */
  title: string
  /** 一行：这个台能做什么。 */
  description: string
  /** 2–3 个能直接点的起手例子：点了只填进这个台的输入，⛔ 直接生成。 */
  examples?: readonly StudioStarterExample[]
  onPickExample?: (text: string) => void
  /**
   * 动作药丸，排在例子前面：输入不是文字的台（3D 吃图）用它替代例子；
   * 第一步不是写字的台（LoRA 台没挂 LoRA 时）用它给出第一步，例子照样跟着。
   */
  action?: ReactNode
  className?: string
}

/**
 * 工作台的起手屏（图片 / 标签 / 视频 / LoRA / 配音 / 3D 共用，手机桌面同一个）。
 *
 * 一句标题 + 一行「这个台能做什么」+ 2–3 颗起手例子（白药丸）。点例子 = 把那段字填进
 * 这个台的输入框，⛔ 直接生成、⛔ 抢焦点（触屏上会弹键盘）。有结果后宿主不再渲染它。
 *
 * ⚠ 根元素的 `.studio-empty-state` 是 src/styles/studio.css 里
 * `.studio-workbench-stage:has(...)` 的锚点（图片 / 视频台空态时结果区吃满剩余高度、
 * 内容垂直居中），⛔ 改名。
 * ⚠ 它不是 `ui/empty-state.tsx` 那张柔影白卡：那张回答「这一块为什么空」并给一颗主钮，
 * 这里回答「从哪下手」，⛔ 黑色主钮（台上唯一的主钮是生成键）。
 */
export function StudioStarterState({
  title,
  description,
  examples = [],
  onPickExample,
  action,
  className,
}: StudioStarterStateProps) {
  return (
    <div
      data-testid="studio-starter"
      className={cn(
        'studio-empty-state flex w-full grow flex-col items-center justify-center gap-2.5 px-3 py-4 text-center lg:px-4 lg:py-6',
        className,
      )}
    >
      <h2 className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
        {title}
      </h2>
      <p className="max-w-md text-2sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {/* 动作单独一行排在前：它是这个台的第一步（LoRA 台 = 挂一个 LoRA），例子在下一行。 */}
      {action ? (
        <div className="mt-4 flex w-full max-w-xl flex-wrap justify-center gap-2">
          {action}
        </div>
      ) : null}
      {examples.length > 0 ? (
        <div
          className={cn(
            'flex w-full max-w-xl flex-wrap justify-center gap-2',
            action ? 'mt-1' : 'mt-4',
          )}
        >
          {examples.map((example) => (
            <Button
              key={example.id}
              type="button"
              variant="secondary"
              size="sm"
              data-starter-example={example.id}
              onClick={() => onPickExample?.(example.text)}
              className="h-9 max-w-full rounded-full border border-border/80 bg-surface-companion px-4 text-2sm font-normal text-foreground shadow-ring transition-[background-color,border-color,transform,box-shadow] duration-fast ease-standard hover:-translate-y-0.5 hover:border-input hover:bg-card hover:shadow-soft active:translate-y-0 dark:bg-muted/80 dark:hover:bg-raise motion-reduce:transform-none"
            >
              <span className="truncate">{example.text}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
