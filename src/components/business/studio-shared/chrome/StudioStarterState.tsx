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
  /** 输入不是文字的台（3D 吃图）：放一颗动作药丸替代例子。 */
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
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="max-w-md text-2sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {examples.length > 0 || action ? (
        <div className="mt-2.5 flex w-full max-w-lg flex-wrap justify-center gap-2">
          {examples.map((example) => (
            <Button
              key={example.id}
              type="button"
              variant="secondary"
              size="sm"
              data-starter-example={example.id}
              onClick={() => onPickExample?.(example.text)}
              className="max-w-full bg-muted/85 text-foreground shadow-none ring-1 ring-border transition-all duration-fast ease-standard hover:bg-fill-strong hover:ring-input"
            >
              <span className="truncate">{example.text}</span>
            </Button>
          ))}
          {action}
        </div>
      ) : null}
    </div>
  )
}
