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
  Link: ({
    href,
    locale,
    children,
    ...props
  }: {
    href: string
    locale?: string
    children: React.ReactNode
    [key: string]: unknown
  }) => {
    const normalizedHref =
      href === '/' ? `/${locale ?? ''}` : `/${locale ?? ''}${href}`

    return (
      <a href={normalizedHref} data-locale={locale} {...props}>
        {children}
      </a>
    )
  },
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
})
