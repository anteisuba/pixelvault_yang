import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsIndexView } from './SettingsIndexView'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

const mockReplace = vi.hoisted(() => vi.fn())
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({
    profile: { username: 'yining', displayName: 'YINIG', avatarUrl: null },
  }),
}))

vi.mock('@/components/business/settings/SettingsPreferencesSection', () => ({
  SettingsPreferenceRows: () => <div data-testid="preference-rows" />,
}))

const mockUseProviderKeyRows = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-provider-key-rows', () => ({
  useProviderKeyRows: mockUseProviderKeyRows,
}))

describe('SettingsIndexView (mobile first level)', () => {
  it('summarises failing keys on the API key row', () => {
    mockUseProviderKeyRows.mockReturnValue({ invalidKeyCount: 2 })
    render(<SettingsIndexView />)

    expect(screen.getByText('Settings:keys.invalidSummary')).toBeTruthy()
  })

  it('leaves the row bare when nothing is failing', () => {
    mockUseProviderKeyRows.mockReturnValue({ invalidKeyCount: 0 })
    render(<SettingsIndexView />)

    expect(screen.queryByText('Settings:keys.invalidSummary')).toBeNull()
  })

  it('is the phone 我的 hub: profile, prompts, sections, preferences inline, sign out last', () => {
    mockUseProviderKeyRows.mockReturnValue({ invalidKeyCount: 0 })
    const { container } = render(<SettingsIndexView />)

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toEqual([
      '/u/me',
      '/prompts',
      '/settings/keys',
      '/settings/usage',
      '/settings/assistant',
      '/settings/connections',
    ])
    expect(screen.getByText('YINIG')).toBeTruthy()
    expect(screen.getByTestId('preference-rows')).toBeTruthy()
    const buttons = screen.getAllByRole('button')
    expect(buttons.at(-1)?.textContent).toContain('Settings:signOut')
  })
})
