'use client'

import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Switch } from '@/components/ui/switch'

/**
 * 设置页的分节与行（助手设置四页 · 角色记忆 · `/settings/preferences` 共用一份，11-22 收口）。
 *
 * - `SettingsSection`：一节 = 一行小标题（13 · semibold · 灰）+ 可选一句说明 + 右端一颗动作，下面是内容；
 *   节与节之间的距离归外层那一列（`gap-7`），⛔ 节自己加外边距。
 * - `SettingsRows`：几行设置排成一列，行与行之间一道细线（⛔ 各行自己画上 / 下边线）。
 * - `SettingsRow`：左边名字 + 一行说明，右边控件；窄了控件折到下一行。最矮 44（触屏够点）。
 *   `disabled` = 名字转灰、控件自己也要 `disabled`（行只管长相）。
 * - `SettingsSwitchRow`：右边是开关的那一行，名字就是开关的读屏名、说明挂 `aria-describedby`。
 *
 * ⛔ 不管「什么时候存」：每页照旧自己存（点选当场存、输入框失焦存），存的状态只在 `AssistantSaveStatus`。
 */

type SectionProps = Omit<ComponentProps<'section'>, 'title'> & {
  /** 小标题；没有就只给读屏（`aria-label`）。 */
  title?: ReactNode
  /** 小标题旁边那一句说明（或任何一小块：如角色记忆的「作品」那一栏）。 */
  description?: ReactNode
  /** 这一行右端（「+ 新建」「记一条」之类）。 */
  action?: ReactNode
}

export function SettingsSection({
  title,
  description,
  action,
  className,
  children,
  ...props
}: SectionProps) {
  const titleId = useId()
  const header = title || description || action
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={cn('flex flex-col gap-3.5', className)}
      {...props}
    >
      {header ? (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {title ? (
            <h2
              id={titleId}
              className="text-2sm font-semibold text-muted-foreground"
            >
              {title}
            </h2>
          ) : null}
          {description ? (
            <div className="min-w-0 text-2sm text-muted-foreground">
              {description}
            </div>
          ) : null}
          {action ? (
            <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function SettingsRows({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col divide-y divide-border', className)}
      {...props}
    />
  )
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  labelId,
  descriptionId,
  disabled = false,
  align = 'center',
  className,
  children,
}: {
  label: ReactNode
  /** 名字下面一行小字（说明 / 被拒的原因）。 */
  description?: ReactNode
  /** 名字指向哪颗控件（`<label for>`）；不给就是一段普通字。 */
  htmlFor?: string
  labelId?: string
  descriptionId?: string
  disabled?: boolean
  /** 控件比一行高（切换条下面还有说明）时用 `start`，名字顶对齐。 */
  align?: 'center' | 'start'
  className?: string
  children: ReactNode
}) {
  const Label = htmlFor ? 'label' : 'span'
  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        'flex min-h-11 flex-wrap justify-between gap-x-4 gap-y-2 py-3 text-sm',
        align === 'start' ? 'items-start' : 'items-center',
        // 名字转灰；控件自己的 `disabled` 再淡一档（`Switch` 45%），⛔ 整行再叠一层透明度。
        disabled && 'cursor-not-allowed text-muted-foreground',
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 basis-28 flex-col gap-0.5 md:basis-40">
        <Label id={labelId} htmlFor={htmlFor}>
          {label}
        </Label>
        {description ? (
          <span id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <div className="flex min-w-0 max-w-full flex-col gap-2">{children}</div>
    </div>
  )
}

export function SettingsSwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  testId,
  className,
}: {
  label: string
  description?: ReactNode
  checked: boolean
  onCheckedChange(next: boolean): void
  disabled?: boolean
  testId?: string
  className?: string
}) {
  const id = useId()
  const descriptionId = useId()
  return (
    <SettingsRow
      label={label}
      description={description}
      htmlFor={id}
      descriptionId={description ? descriptionId : undefined}
      disabled={disabled}
      className={className}
    >
      <Switch
        id={id}
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        onCheckedChange={onCheckedChange}
      />
    </SettingsRow>
  )
}
