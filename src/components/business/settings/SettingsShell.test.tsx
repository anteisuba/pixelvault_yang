import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsLayoutFrame, SettingsShell } from './SettingsShell'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  segment: 'keys' as string | null,
  search: new URLSearchParams(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.search,
  useSelectedLayoutSegment: () => navigation.segment,
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
  Link: ({
    href,
    children,
    ref,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} ref={ref} {...props}>
      {children}
    </a>
  ),
}))

const signOut = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-sign-out', () => ({ useSignOut: () => signOut }))

beforeEach(() => {
  vi.clearAllMocks()
  navigation.segment = 'keys'
  navigation.search = new URLSearchParams()
})

function navLink(name: string) {
  return screen
    .getAllByRole('link', { name })
    .find((link) => link.hasAttribute('data-settings-nav-item'))!
}

describe('SettingsShell', () => {
  it('draws one sliding block for the current section instead of a per-row background', () => {
    render(
      <SettingsShell section="usage">
        <p>content</p>
      </SettingsShell>,
    )
    const current = navLink('Settings:sections.usage')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.className).not.toContain('bg-muted')
    expect(screen.getByTestId('settings-nav-active')).toBeInTheDocument()
  })

  it('switches sections with the arrow keys, wrapping at the ends', () => {
    render(
      <SettingsShell section="keys">
        <p>content</p>
      </SettingsShell>,
    )
    fireEvent.keyDown(navLink('Settings:sections.keys'), { key: 'ArrowDown' })
    expect(navigation.push).toHaveBeenLastCalledWith('/settings/usage')
    fireEvent.keyDown(navLink('Settings:sections.keys'), { key: 'ArrowUp' })
    expect(navigation.push).toHaveBeenLastCalledWith('/settings/connections')
    expect(navLink('Settings:sections.connections')).toHaveFocus()
  })

  it('keeps ?from= on the arrow-key route', () => {
    navigation.search = new URLSearchParams('from=/studio/video')
    render(
      <SettingsShell section="keys">
        <p>content</p>
      </SettingsShell>,
    )
    fireEvent.keyDown(navLink('Settings:sections.keys'), { key: 'ArrowDown' })
    expect(navigation.push).toHaveBeenLastCalledWith(
      `/settings/usage?from=${encodeURIComponent('/studio/video')}`,
    )
  })

  it('shows 正在退出 inside the sign-out button once pressed', () => {
    render(
      <SettingsShell section="keys">
        <p>content</p>
      </SettingsShell>,
    )
    const button = screen.getByRole('button', { name: 'Settings:signOut' })
    fireEvent.click(button)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('data-feedback', 'progress')
    expect(button).toHaveAccessibleName('Settings:signingOut')
    expect(button).toBeDisabled()
  })
})

describe('SettingsLayoutFrame', () => {
  it('wraps a section page in the shell', () => {
    render(
      <SettingsLayoutFrame>
        <p>section body</p>
      </SettingsLayoutFrame>,
    )
    expect(screen.getByTestId('settings-section-content')).toHaveTextContent(
      'section body',
    )
  })

  it('leaves the mobile list (/settings) and unknown segments alone', () => {
    navigation.segment = null
    const { rerender } = render(
      <SettingsLayoutFrame>
        <p>list</p>
      </SettingsLayoutFrame>,
    )
    expect(screen.queryByRole('navigation')).toBeNull()
    navigation.segment = 'nope'
    rerender(
      <SettingsLayoutFrame>
        <p>list</p>
      </SettingsLayoutFrame>,
    )
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
