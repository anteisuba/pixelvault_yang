// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { THEME_STORAGE_KEY } from '@/constants/theme'

import { AccountMenu } from './AccountMenu'

/**
 * 账号菜单的回归闸（D11 ④ 画板，2026-09-20 owner 确认）。
 *
 * 钉这几件事：
 *  ① 菜单内容自上而下 = 头部（名字 + @用户名）· 语言 · 外观 · 设置 · 退出登录；
 *  ② ⭐ 语言是一行分段条（owner 2026-10-08 侧栏原型 v1，复用 `LiquidSegmented`），
 *     只有 en / ja / zh 三档，⛔ 不再展二级子菜单；
 *  ③ ⭐ 语言与设置 → 偏好**同一条路**：落点是当前地址 + 原样带回 query，
 *     切换走 next-intl 的 `router.replace(href, { locale })`，⛔ 菜单里没有第二份状态；
 *  ④ ⭐ 当前语言不只靠颜色：`aria-checked`（分段条的选中块之外）；
 *  ⑤ ⭐ 退出登录走 `/settings` 同一条路（Clerk `signOut` + 回首页），
 *     ⛔ 没有二次确认；
 *  ⑥ ⛔ 菜单里没有额度、没有 key 数——那两样各有各的落点；
 *  ⑥' ⭐ 外观是语言下面同一种分段条（素 | 暗房，暗色主题模块 owner 2026-10-24），
 *     记在本机、换档不关菜单、←/→ 换档；
 *  ⑦ ⭐ 浮层是 `grow` 档（从触发行长出来）并带 `motion-reduce:` 降级 ——
 *     这条浏览器工具模拟不了（2026-09-20 实测缺口），只能在这里钉住；
 *  ⑧ ⭐ 浮层带视口夹取 —— 375 档没验到（Chrome 最窄 ~500），
 *     夹取写死在代码里，窄屏溢出就不可能。
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

const replace = vi.hoisted(() => vi.fn())

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ replace }),
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

afterEach(async () => {
  // 菜单一关，Radix 焦点圈会在下一拍（setTimeout 0）派一次事件：先卸掉、等它派完，
  // ⛔ 让它落到这份文件的 jsdom 拆掉之后（CI 上报「not of type 'Event'」）。
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 0))
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

/** 语言那一行（整行一颗 menuitem）与里面的三格，按 DOM 顺序。 */
async function findLanguageRow() {
  const row = await screen.findByText('LocaleSwitcher:label')
  const item = row.closest<HTMLElement>('[data-slot="account-menu-language"]')
  if (!item) throw new Error('language row not found')
  return {
    item,
    options: Array.from(item.querySelectorAll<HTMLElement>('[role="radio"]')),
  }
}

/** 外观那一行与里面的两格（素 | 暗房），按 DOM 顺序。 */
async function findAppearanceRow() {
  const row = await screen.findByText('ThemeSwitcher:label')
  const item = row.closest<HTMLElement>('[data-slot="account-menu-appearance"]')
  if (!item) throw new Error('appearance row not found')
  return {
    item,
    options: Array.from(item.querySelectorAll<HTMLElement>('[role="radio"]')),
  }
}

describe('AccountMenu（D11 ④）', () => {
  it('头部是名字 + @用户名，⛔ 不放额度 / key 数', async () => {
    openMenu()

    expect(await screen.findByText('福林')).toBeInTheDocument()
    expect(screen.getByText('@fulina')).toBeInTheDocument()
    expect(screen.queryByText('Navbar:apiKeys')).toBeNull()
    expect(screen.queryByText('Navbar:requestsLoading')).toBeNull()
  })

  it('外观在语言下面、设置上面：一行分段条，只有素 / 暗房两档，默认素', async () => {
    openMenu()

    const { item, options } = await findAppearanceRow()
    const language = (await findLanguageRow()).item
    const settings = screen.getByLabelText('Navbar:settings')
    expect(item.getAttribute('role')).toBe('menuitem')
    expect(
      language.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      item.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(options.map((option) => option.textContent)).toEqual([
      'ThemeSwitcher:options.light',
      'ThemeSwitcher:options.dark',
    ])
    expect(
      options.map((option) => option.getAttribute('aria-checked')),
    ).toEqual(['true', 'false'])
  })

  it('点暗房：记在本机、菜单不关，当前那一格跟着换', async () => {
    openMenu()

    const { options } = await findAppearanceRow()
    fireEvent.click(options[1])
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getByText('ThemeSwitcher:label')).toBeInTheDocument()
    expect(
      (await findAppearanceRow()).options.map((option) =>
        option.getAttribute('aria-checked'),
      ),
    ).toEqual(['false', 'true'])
  })

  it('键盘落在外观行上：←/→ 换档，到头绕回来', async () => {
    openMenu()

    const { item } = await findAppearanceRow()
    fireEvent.keyDown(item, { key: 'ArrowRight' })
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    fireEvent.keyDown(item, { key: 'ArrowRight' })
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    fireEvent.keyDown(item, { key: 'ArrowLeft' })
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('语言是一行分段条：只有 en / ja / zh 三档，⛔ 不再展子菜单', async () => {
    openMenu()

    const { item, options } = await findLanguageRow()
    expect(item.getAttribute('role')).toBe('menuitem')
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
      'LocaleSwitcher:names.en',
      'LocaleSwitcher:names.ja',
      'LocaleSwitcher:names.zh',
    ])
    expect(
      document.querySelector('[data-slot="dropdown-menu-sub-trigger"]'),
    ).toBeNull()
  })

  it('当前语言不只靠颜色：aria-checked 标出当前那一格', async () => {
    openMenu()

    const { options } = await findLanguageRow()
    expect(
      options.map((option) => option.getAttribute('aria-checked')),
    ).toEqual(['false', 'false', 'true'])
  })

  it('语言切换与设置 → 偏好同一条路：当前地址 + 原样带回 query', async () => {
    replace.mockClear()
    openMenu()

    const { options } = await findLanguageRow()
    fireEvent.click(options[1])
    // 选中块先滑到新格，滑完才换地址。
    expect(options[1]).toHaveAttribute('aria-checked', 'true')
    expect(replace).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/studio/image?tab=lora', {
        locale: 'ja',
      }),
    )
    // 换语言不是关菜单的动作：菜单还开着。
    expect(screen.getByText('LocaleSwitcher:label')).toBeInTheDocument()

    // 点当前那一格什么都不做。
    replace.mockClear()
    fireEvent.click(options[1])
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(replace).not.toHaveBeenCalled()
  })

  it('键盘落在语言行上：←/→ 换语言（分段条里的格子在菜单里键盘到不了）', async () => {
    replace.mockClear()
    openMenu()

    const { item } = await findLanguageRow()
    fireEvent.keyDown(item, { key: 'ArrowRight' })
    await waitFor(() =>
      expect(replace).toHaveBeenLastCalledWith('/studio/image?tab=lora', {
        locale: 'en',
      }),
    )
    // 从刚滑到的那一格（en）往左 = zh。
    fireEvent.keyDown(item, { key: 'ArrowLeft' })
    await waitFor(() =>
      expect(replace).toHaveBeenLastCalledWith('/studio/image?tab=lora', {
        locale: 'zh',
      }),
    )
  })

  it('「设置」带上来处，与旧的最底一行同一个去处', async () => {
    openMenu()

    const settings = await screen.findByLabelText('Navbar:settings')
    expect(settings.getAttribute('href')).toBe(
      '/settings?from=%2Fstudio%2Fimage',
    )
  })

  it('浮层从触发行长出来（grow 档），带 motion-reduce 降级、⛔ 不缩放', async () => {
    openMenu()
    await findLanguageRow()

    const content = document.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-content"]',
    )
    expect(content?.dataset.menuMotion).toBe('grow')
    expect(content?.className).toContain('data-[state=open]:animate-menu-grow')
    expect(content?.className).toContain('motion-reduce:animate-none')
    expect(content?.className).not.toContain('zoom-in')
    expect(content?.className).not.toContain('zoom-out')
  })

  it('浮层带视口夹取 —— 窄屏溢出在代码层就不可能', async () => {
    openMenu()
    await findLanguageRow()

    const content = document.querySelector(
      '[data-slot="dropdown-menu-content"]',
    )
    expect(content?.className).toContain('max-w-[calc(100vw-2rem)]')
  })

  it('退出登录走 Clerk 同一条路，⛔ 没有二次确认', async () => {
    openMenu()

    fireEvent.click(await screen.findByText('Settings:signOut'))
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
