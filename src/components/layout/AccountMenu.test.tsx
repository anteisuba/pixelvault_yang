// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AccountMenu } from './AccountMenu'

/**
 * 账号菜单的回归闸（D11 ④ 画板，2026-09-20 owner 确认）。
 *
 * 钉六件事：
 *  ① 菜单内容自上而下 = 头部（名字 + @用户名）· 语言 · 设置 · 退出登录；
 *  ② ⭐ 语言行**带当前值**，子菜单只有 en / ja / zh 三档；
 *  ③ ⭐ 语言与设置 → 偏好**同一条路**：落点是当前地址 + 原样带回 query，
 *     切换由 `<Link locale>` 做，⛔ 菜单里没有第二份状态；
 *  ④ ⭐ 当前语言不只靠颜色：`aria-current` + 圆点 + 字重；
 *  ⑤ ⭐ 退出登录走 `/settings` 同一条路（Clerk `signOut` + 回首页），
 *     ⛔ 没有二次确认；
 *  ⑥ ⛔ 菜单里没有额度、没有 key 数、没有「外观」——那三样各有各的落点，
 *     主题切换这个应用根本没有。
 */

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}:${key}` : key,
  useLocale: () => 'zh',
}))

const signOut = vi.hoisted(() => vi.fn())
vi.mock('@clerk/nextjs', () => ({ useClerk: () => ({ signOut }) }))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({
    profile: { username: 'fulina', displayName: '福林', avatarUrl: null },
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tab=lora'),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  Link: ({
    href,
    locale,
    children,
    ...props
  }: {
    href: string
    locale?: string
    children: React.ReactNode
  }) => (
    <a href={href} data-locale={locale} {...props}>
      {children}
    </a>
  ),
}))

function openMenu() {
  render(
    <AccountMenu>
      <button type="button">trigger</button>
    </AccountMenu>,
  )
  fireEvent.pointerDown(screen.getByRole('button', { name: 'trigger' }), {
    button: 0,
    ctrlKey: false,
  })
}

async function openLanguageSubmenu() {
  openMenu()
  fireEvent.click(await screen.findByText('LocaleSwitcher:label'))
}

/** 子菜单里那三颗，按 DOM 顺序。 */
async function findLocaleOptions() {
  await screen.findAllByText('LocaleSwitcher:names.en')
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[data-locale]'),
  )
}

describe('AccountMenu（D11 ④）', () => {
  it('头部是名字 + @用户名，⛔ 不放额度 / key 数 / 外观', async () => {
    openMenu()

    expect(await screen.findByText('福林')).toBeInTheDocument()
    expect(screen.getByText('@fulina')).toBeInTheDocument()
    expect(screen.queryByText('Navbar:apiKeys')).toBeNull()
    expect(screen.queryByText('Navbar:requestsLoading')).toBeNull()
    expect(screen.queryByText(/appearance|外观/i)).toBeNull()
  })

  it('语言行带当前值；展开只有 en / ja / zh 三档', async () => {
    openMenu()

    // 行上那个当前值和子菜单里的选项文案是同一条 key —— 行上的先出现。
    const row = (await screen.findByText('LocaleSwitcher:label')).closest(
      '[data-slot="dropdown-menu-sub-trigger"]',
    )
    expect(row?.textContent).toContain('LocaleSwitcher:names.zh')

    fireEvent.click(screen.getByText('LocaleSwitcher:label'))
    const options = await findLocaleOptions()
    expect(options.map((option) => option.dataset.locale)).toEqual([
      'en',
      'ja',
      'zh',
    ])
  })

  it('语言切换与设置 → 偏好同一条路：当前地址 + 原样带回 query', async () => {
    await openLanguageSubmenu()

    const [, japanese] = await findLocaleOptions()
    expect(japanese.getAttribute('href')).toBe('/studio/image?tab=lora')
    expect(japanese.textContent).toContain('LocaleSwitcher:names.ja')
  })

  it('当前语言不只靠颜色：aria-current + 字重 + 圆点', async () => {
    await openLanguageSubmenu()

    const [english, , current] = await findLocaleOptions()
    expect(current.getAttribute('aria-current')).toBe('page')
    expect(current.querySelector('span[aria-hidden]')).not.toBeNull()
    expect(current.className).toContain('font-medium')
    expect(english.getAttribute('aria-current')).toBeNull()
  })

  it('「设置」带上来处，与旧的最底一行同一个去处', async () => {
    openMenu()

    const settings = await screen.findByLabelText('Navbar:settings')
    expect(settings.getAttribute('href')).toBe(
      '/settings?from=%2Fstudio%2Fimage',
    )
  })

  it('退出登录走 Clerk 同一条路，⛔ 没有二次确认', async () => {
    openMenu()

    fireEvent.click(await screen.findByText('Settings:signOut'))
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
