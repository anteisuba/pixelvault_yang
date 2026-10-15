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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * ResponsiveMenu —「⋯ 更多」这类动作菜单：细指针是锚定的下拉菜单，触屏手机是从底部
 * 升起的一列大行（手机操作习惯第 1 条，owner 2026-10-15）。
 *
 * 与 `ResponsivePopover` 同一套判据（窄屏 + 触屏才换抽屉），⛔ 手机上裸用
 * `DropdownMenu`。API 照 `DropdownMenu*` 的子集：
 * - `ResponsiveMenuContent` 的 `label` 必填（抽屉的隐藏标题）；`className` / `style`
 *   只给桌面菜单，`mobileClassName` 给抽屉里那一列。
 * - `ResponsiveMenuItem` 的 `onSelect(event)` 两边同一个签名：`event.preventDefault()`
 *   = 菜单不关（删除点两下那种）。
 */

const ResponsiveMenuContext = React.createContext<{
  useDrawer: boolean
  close: () => void
}>({ useDrawer: false, close: () => {} })

function ResponsiveMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu>) {
  const isMobile = useIsMobile()
  const useDrawer = isMobile && isTouchPrimary()
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
      <DrawerContent>
        <DrawerTitle className="sr-only">{label}</DrawerTitle>
        <div
          role="menu"
          aria-label={label}
          className={cn('flex flex-col gap-0.5 px-2 pt-2', mobileClassName)}
          style={{
            paddingBottom:
              'max(var(--keyboard-safe-area-bottom, 0px), 0.75rem)',
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

/** 抽屉里一行：高 48、字 16，按下变灰底（拇指点得准，⛔ 照搬桌面 32 高的行）。 */
const DRAWER_ITEM_CLASS =
  "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium text-foreground transition-colors duration-fast ease-standard active:bg-muted disabled:pointer-events-none disabled:opacity-50 data-[variant=destructive]:text-status-risk [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-status-risk!"

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
        'h-12 rounded-xl',
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

export {
  ResponsiveMenu,
  ResponsiveMenuTrigger,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
}
