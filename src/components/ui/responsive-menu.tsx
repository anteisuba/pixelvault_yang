'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { useIsMobile } from '@/hooks/use-mobile'
import { isTouchPrimary } from '@/lib/touch'
import { cn } from '@/lib/utils'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * ResponsiveMenu — 动作 / 排序 / 分组菜单：
 * - 默认走 Apple iOS `UIMenu` 锚定浮层（紧凑磨砂圆角卡片就地从触发键展开，44px 触控行高，
 *   避免 2-5 个选项强行从屏底弹出占满屏幕、让视线与拇指来回跳）。
 * - 需要完整底部动作表时传 `mobilePresentation="sheet"`，触屏窄屏走 S1 暖石底部抽屉。
 */

const ResponsiveMenuContext = React.createContext<{
  useDrawer: boolean
  close: () => void
}>({ useDrawer: false, close: () => {} })

function ResponsiveMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  mobilePresentation = 'menu',
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu> & {
  /** 触屏手机上的呈现方式：默认 `menu`（Apple UIMenu 就地锚定浮层），需要底部动作表时传 `sheet`。 */
  mobilePresentation?: 'menu' | 'sheet'
}) {
  const isMobile = useIsMobile()
  const useDrawer =
    mobilePresentation === 'sheet' && isMobile && isTouchPrimary()
  const [innerOpen, setInnerOpen] = React.useState(defaultOpen)
  const open = openProp ?? innerOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInnerOpen(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )
  const context = React.useMemo(
    () => ({ useDrawer, close: () => setOpen(false) }),
    [useDrawer, setOpen],
  )
  return (
    <ResponsiveMenuContext.Provider value={context}>
      {useDrawer ? (
        <Drawer open={open} onOpenChange={setOpen}>
          {children}
        </Drawer>
      ) : (
        <DropdownMenu open={open} onOpenChange={setOpen} {...props}>
          {children}
        </DropdownMenu>
      )}
    </ResponsiveMenuContext.Provider>
  )
}

function ResponsiveMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuTrigger>,
) {
  const { useDrawer } = React.useContext(ResponsiveMenuContext)
  return useDrawer ? (
    <DrawerTrigger {...props} />
  ) : (
    <DropdownMenuTrigger {...props} />
  )
}

interface ResponsiveMenuContentProps extends React.ComponentProps<
  typeof DropdownMenuContent
> {
  /** 抽屉的隐藏标题（读屏用），桌面端作 aria-label。 */
  label: string
  /** 抽屉里那一列的样式（`className` 只给桌面菜单）。 */
  mobileClassName?: string
}

function ResponsiveMenuContent({
  label,
  className,
  mobileClassName,
  style,
  children,
  ...props
}: ResponsiveMenuContentProps) {
  const { useDrawer } = React.useContext(ResponsiveMenuContext)
  if (useDrawer) {
    return (
      <DrawerContent className="bg-bubble dark:bg-background">
        <DrawerTitle className="shrink-0 px-4 pt-2.5 pb-2 text-center text-xs font-semibold text-muted-foreground">
          {label}
        </DrawerTitle>
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'scrollbar-none mx-3 mb-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-2xl bg-card p-1.5 shadow-ring',
            mobileClassName,
          )}
          style={{
            marginBottom: 'max(var(--keyboard-safe-area-bottom, 0px), 0.75rem)',
          }}
        >
          {children}
        </div>
      </DrawerContent>
    )
  }
  return (
    <DropdownMenuContent
      aria-label={label}
      className={className}
      style={style}
      {...props}
    >
      {children}
    </DropdownMenuContent>
  )
}

/** 抽屉里一行：高 44、不压缩（shrink-0）、字 14，按下变灰底（Apple iOS Action Sheet 质感）。 */
const DRAWER_ITEM_CLASS =
  "flex h-11 shrink-0 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-foreground transition-colors duration-fast ease-standard active:bg-muted disabled:pointer-events-none disabled:opacity-50 data-[variant=destructive]:text-status-risk [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-status-risk!"

interface ResponsiveMenuItemProps extends Omit<
  React.ComponentProps<typeof DropdownMenuItem>,
  'onSelect'
> {
  onSelect?: (event: Event) => void
}

function ResponsiveMenuItem({
  onSelect,
  disabled,
  asChild,
  variant,
  className,
  children,
  ...props
}: ResponsiveMenuItemProps) {
  const { useDrawer, close } = React.useContext(ResponsiveMenuContext)
  if (!useDrawer) {
    return (
      <DropdownMenuItem
        onSelect={onSelect}
        disabled={disabled}
        asChild={asChild}
        variant={variant}
        className={className}
        {...props}
      >
        {children}
      </DropdownMenuItem>
    )
  }
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      {...(props as React.ComponentProps<'button'>)}
      role="menuitem"
      type={asChild ? undefined : 'button'}
      disabled={asChild ? undefined : disabled}
      aria-disabled={disabled || undefined}
      data-variant={variant}
      className={cn(
        DRAWER_ITEM_CLASS,
        className,
        // 桌面行的圆角 / 高度写在调用方 className 里，抽屉这边以大行为准。
        'h-11 rounded-xl',
      )}
      onClick={() => {
        if (disabled) return
        const event = new Event('select', { cancelable: true })
        onSelect?.(event)
        if (!event.defaultPrevented) close()
      }}
    >
      {children}
    </Component>
  )
}

function ResponsiveMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuSeparator>) {
  const { useDrawer } = React.useContext(ResponsiveMenuContext)
  if (useDrawer) {
    return <div role="separator" className="mx-3 my-1 h-px bg-border" />
  }
  return <DropdownMenuSeparator className={className} {...props} />
}

function ResponsiveMenuLabel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuLabel>) {
  const { useDrawer } = React.useContext(ResponsiveMenuContext)
  if (useDrawer) {
    return (
      <p
        className={cn(
          'px-3 pt-2 pb-1 text-2xs font-semibold text-muted-foreground',
          className,
        )}
      >
        {children}
      </p>
    )
  }
  return (
    <DropdownMenuLabel className={className} {...props}>
      {children}
    </DropdownMenuLabel>
  )
}

export {
  ResponsiveMenu,
  ResponsiveMenuTrigger,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuLabel,
  ResponsiveMenuSeparator,
}
