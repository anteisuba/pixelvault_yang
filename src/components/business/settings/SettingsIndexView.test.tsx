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
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})
