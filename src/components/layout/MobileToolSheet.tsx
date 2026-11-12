'use client'

import { useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'

import {
  SHELL_NAV_TOOLS,
  isShellNavItemActive,
  type ShellNavItem,
} from '@/constants/navigation'
import { studioImageGeneratePath } from '@/constants/routes'
import { ArrowUp } from '@/components/icons'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Link, useRouter } from '@/i18n/navigation'
import { useLastStudioToolId } from '@/hooks/use-mobile-nav-memory'
import { cn } from '@/lib/utils'

/**
 * 手机上「拉起一张卡」选台（owner 2026-11-03 手机方向：点黑 ＋ 从底下拉起一张卡；台上点台名
 * 拉起同一张卡换台）。底部抽屉，往下拖即关、系统返回先关它（`Drawer` 自带）。
 *
 * - `create`（底栏 ＋）：顶上一句话出图（提交 = 带 `?prompt=&generate=1` 进图片台直接出图），
 *   下面七个台。
 * - `switch`（台上点台名）：只有七个台，当前那个灰底。
 *
 * 两处同一张卡、同一份台的清单（`SHELL_NAV_TOOLS`），⛔ 各写一套菜单。
 */
export function MobileToolSheet({
  open,
  onOpenChange,
  pathname,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathname: string
  mode: 'create' | 'switch'
}) {
  const tMobile = useTranslations('MobileNav')
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-24 border-0 bg-popover pb-safe-bottom shadow-pop lg:hidden">
        <DrawerTitle className="sr-only">
          {mode === 'create' ? tMobile('create') : tMobile('switchTool')}
        </DrawerTitle>
        <DrawerDescription className="sr-only">
          {tMobile('sheetHint')}
        </DrawerDescription>
        <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
          {mode === 'create' ? (
            <QuickPrompt onDone={() => onOpenChange(false)} />
          ) : null}
          <ul className="grid grid-cols-4 gap-2">
            {SHELL_NAV_TOOLS.map((item) => (
              <li key={item.id}>
                <ToolTile
                  item={item}
                  pathname={pathname}
                  onPick={() => onOpenChange(false)}
                />
              </li>
            ))}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function ToolTile({
  item,
  pathname,
  onPick,
}: {
  item: ShellNavItem
  pathname: string
  onPick: () => void
}) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const lastToolId = useLastStudioToolId()
  const Icon = item.icon
  const isActive = isShellNavItemActive(item, pathname)
  return (
    <Link
      href={item.href}
      onClick={onPick}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-16 bg-muted text-2sm text-foreground',
        'transition-[background-color,scale] duration-fast ease-standard active:scale-[.98] active:bg-fill-strong motion-reduce:transition-none',
        'aria-[current=page]:bg-fill-strong aria-[current=page]:font-semibold',
      )}
    >
      <Icon className="size-6 shrink-0" />
      <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
      {item.id === lastToolId && !isActive ? (
        <span className="absolute top-1.5 right-1.5 rounded-full bg-background px-1.5 text-3xs font-medium text-muted-foreground">
          {tMobile('last')}
        </span>
      ) : null}
    </Link>
  )
}

/** 一句话出图：打一句、回车 / 点箭头就进图片台直接出图（缺 key 等闸门照常拦）。 */
function QuickPrompt({ onDone }: { onDone: () => void }) {
  const tMobile = useTranslations('MobileNav')
  const router = useRouter()
  const [prompt, setPrompt] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = prompt.trim()
    if (!text) return
    onDone()
    router.push(studioImageGeneratePath(text))
  }

  return (
    <form
      onSubmit={submit}
      className="flex h-12 items-center gap-2 rounded-full bg-muted pr-1.5 pl-4"
    >
      {/* 16px 字号：iOS 低于它聚焦会整页放大。 */}
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={tMobile('quickPlaceholder')}
        aria-label={tMobile('quickPlaceholder')}
        enterKeyHint="go"
        className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        aria-label={tMobile('quickGo')}
        disabled={!prompt.trim()}
        className="touch-target flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity duration-fast ease-standard disabled:opacity-30"
      >
        <ArrowUp className="size-4" />
      </button>
    </form>
  )
}
