import { render, screen } from '@testing-library/react'

import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'

const mockNavigationState = vi.hoisted(() => ({
  locale: 'zh',
  pathname: '/studio',
  query: 'view=compact',
}))

vi.mock('next-intl', () => ({
  useLocale: () => mockNavigationState.locale,
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      label: 'Language',
      'options.en': 'EN',
      'options.ja': 'JA',
      'options.zh': 'ZH',
      'names.en': 'English',
      'names.ja': 'Japanese',
      'names.zh': 'Chinese',
    }

    return messages[key] ?? key
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    toString: () => mockNavigationState.query,
  }),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => mockNavigationState.pathname,
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    href === '/' ? `/${locale}` : `/${locale}${href}`,
}))

describe('LocaleSwitcher', () => {
  it('renders all supported locale options', () => {
    render(<LocaleSwitcher />)

    expect(screen.getByRole('navigation', { name: 'Language' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'English' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Japanese' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Chinese' })).toBeVisible()
  })

  it('marks the current locale and preserves the current path and query string', () => {
    render(<LocaleSwitcher />)

    expect(screen.getByRole('link', { name: 'Chinese' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Japanese' })).toHaveAttribute(
      'href',
      '/ja/studio?view=compact',
    )
  })

  it('switches with a full-page navigation (plain <a>), not a soft next-intl Link', () => {
    // 软导航在 `/library/*` 上会被 `(.)library/*` 拦截路由接走：地址换了界面没换。
    render(<LocaleSwitcher />)

    const japanese = screen.getByRole('link', { name: 'Japanese' })
    expect(japanese).toHaveAttribute('hreflang', 'ja')
    expect(japanese).not.toHaveAttribute('data-locale')
  })

  it('can render as a vertical switcher for collapsed navigation', () => {
    render(<LocaleSwitcher orientation="vertical" />)

    expect(
      screen.getByRole('navigation', { name: 'Language' }),
    ).toHaveAttribute('data-orientation', 'vertical')
  })

  it('can render compact options for sidebar footer use', () => {
    render(<LocaleSwitcher size="compact" />)

    expect(screen.getByRole('link', { name: 'English' })).toHaveClass('h-7')
  })

  it('can render a quieter sidebar tone', () => {
    render(<LocaleSwitcher tone="sidebar" size="compact" />)

    expect(
      screen.getByRole('navigation', { name: 'Language' }),
    ).toHaveAttribute('data-tone', 'sidebar')
    expect(screen.getByRole('link', { name: 'Chinese' })).toHaveClass(
      'text-sidebar-foreground',
    )
  })
})
