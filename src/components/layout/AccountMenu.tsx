'use client'

import { Globe, LogOut, Settings } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { ROUTES, settingsPath } from '@/constants/routes'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { useLocaleSwitch, type AppLocale } from '@/hooks/use-locale-switch'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useSignOut } from '@/hooks/use-sign-out'

/**
 * 账号菜单（D11 ④，2026-09-20 owner 确认画板）。侧栏最底那一行和手机顶栏
 * 胶囊右端那颗头像都挂它 —— 两处同一颗菜单，⛔ 不各写一份。
 *
 * 内容自上而下：头部（头像 · 名字 · @用户名）→ 语言（一行分段条）
 * → 设置 → 退出登录（红字，上有分隔线）。从触发行**长出来**（`grow` 档：
 * 侧栏展开往上、收起往右、手机顶栏往下）。
 *
 * ⛔ 菜单里不放额度、不放 key 数、不挂红点 / 角标 —— 那三样各有各的页
 * （`/settings/usage` · `/settings/keys`），是 D3 ④ 的既有收口结论。
 * ⛔ 也没有「外观」：这个应用没有主题切换机制（无 next-themes / setTheme /
 * 任何挂 `.dark` 的开关），画板上那一行本轮不做 —— ⛔ 不许画一颗点了没反应的。
 *
 * ⚠ 菜单内容只在打开后才挂载，语言那一段因此才敢读 `useSearchParams()`
 * （见 `use-locale-switch.ts` 的告诫）。⛔ 别把它提到触发器上去。
 */
export function AccountMenu({
  children,
  side = 'top',
  align = 'start',
  tooltip,
}: {
  /** 触发器。必须是一颗真的可聚焦控件 —— 收起 40 档它是唯一的账号入口。 */
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom'
  align?: 'start' | 'center' | 'end'
  /** 只在触发器没有可见文字时传（收起 40 档）。 */
  tooltip?: string
}) {
  const trigger = <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>

  return (
    <DropdownMenu>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={8}
        motionPreset="grow"
        /* ⚠ 视口夹取不是装饰：手机档这颗菜单从顶栏右端往下开，216 的固定宽在
           窄屏会顶出右边缘。夹取写在代码里，窄屏溢出就不可能（仓库先例：
           `LoraLibraryFilterCombobox`）。 */
        className="w-58 max-w-[calc(100vw-2rem)] rounded-xl p-1.5 shadow-overlay"
      >
        <AccountMenuHeader />
        <DropdownMenuSeparator />
        <AccountMenuLanguage />
        <AccountMenuSettings />
        <DropdownMenuSeparator />
        <AccountMenuSignOut />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountMenuHeader() {
  const { profile } = useMyProfile()
  const name = profile?.displayName ?? profile?.username

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <ProfileAvatar
        avatarUrl={profile?.avatarUrl}
        size={32}
        className="size-8"
      />
      <span className="flex min-w-0 flex-col">
        {name ? (
          <span className="truncate text-sm font-medium text-foreground">
            {name}
          </span>
        ) : null}
        {profile?.username ? (
          // @handle 是机器串，走等宽槽（ui-defaults.md §1）。
          <span className="truncate font-mono text-xs text-muted-foreground">
            @{profile.username}
          </span>
        ) : null}
      </span>
    </div>
  )
}

/**
 * 语言 —— 一行分段条（en / ja / zh，⛔ 不多不少；owner 2026-10-08 侧栏原型 v1），
 * 复用 `LiquidSegmented`：选中块两条边各一根弹簧滑过去，⛔ 不再展二级子菜单。
 *
 * 当前值、落点和名册全部来自 `useLocaleSwitch()`，与设置 → 偏好**同一条路**：
 * ⛔ 这里不另存一份当前值、⛔ 不另写一遍落点，否则「界面显示的」和
 * 「服务端认得的」会开始漂（判据三）。切换 = next-intl 的 `router.replace(href,
 * { locale })`，与 `<Link locale>` 重写的是同一个地址前缀。
 *
 * ⚠ 整行是一颗 `menuitem`：Radix 菜单里 Tab 被吃掉、方向键只在菜单项之间走，
 *   分段条里的按钮键盘到不了。所以键盘落在这一行上，←/→ 换语言；鼠标直接点格子。
 *   `onSelect` 拦掉默认的「选完就关」—— 换语言不是一个关菜单的动作。
 */
function AccountMenuLanguage() {
  const t = useTranslations('LocaleSwitcher')
  const { locale, href, locales } = useLocaleSwitch()
  const router = useRouter()

  const switchTo = (next: AppLocale) => {
    if (next !== locale) router.replace(href, { locale: next })
  }

  const step = (delta: number) => {
    const index = locales.indexOf(locale)
    const next = locales[(index + delta + locales.length) % locales.length]
    switchTo(next)
  }

  return (
    <DropdownMenuItem
      data-slot="account-menu-language"
      aria-label={`${t('label')} · ${t(`names.${locale}`)}`}
      onSelect={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault()
          step(event.key === 'ArrowRight' ? 1 : -1)
        }
      }}
      className="h-9 cursor-default rounded-lg px-2 focus:bg-accent"
    >
      <Globe />
      <span className="flex-1 truncate">{t('label')}</span>
      <LiquidSegmented
        size="xs"
        semantics="radio"
        ariaLabel={t('label')}
        value={locale}
        onChange={switchTo}
        items={locales.map((option) => ({
          value: option,
          label: t(`options.${option}`),
          title: t(`names.${option}`),
        }))}
      />
    </DropdownMenuItem>
  )
}

function AccountMenuSettings() {
  const t = useTranslations('Navbar')
  const pathname = usePathname()

  return (
    <DropdownMenuItem asChild className="h-8 rounded-lg px-2">
      {/* ⚠ 引导第 4 步的锚点 `data-onboarding="apiKey"` **不在这里** ——
          菜单内容只在打开后才挂载，挂在这儿就是个死锚点。它挂在常驻的那颗
          触发器上（侧栏底行 / 手机顶栏头像）。 */}
      <Link
        href={settingsPath(ROUTES.SETTINGS, pathname)}
        aria-label={t('settings')}
      >
        <Settings />
        <span className="flex-1 truncate">{t('settings')}</span>
      </Link>
    </DropdownMenuItem>
  )
}

function AccountMenuSignOut() {
  const t = useTranslations('Settings')
  const signOut = useSignOut()

  return (
    <DropdownMenuItem
      variant="destructive"
      onSelect={signOut}
      className="h-8 rounded-lg px-2"
    >
      <LogOut />
      <span className="flex-1 truncate">{t('signOut')}</span>
    </DropdownMenuItem>
  )
}
