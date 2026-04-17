import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...props} />
  ),
}))

import { PrivateProfileView } from '@/components/business/PrivateProfileView'

const MESSAGES = {
  CreatorProfile: {
    privateProfile: 'This profile is private',
    privateProfileHint:
      'This user has set their profile to private. Their works are not visible.',
  },
}

function renderView(
  props: Partial<React.ComponentProps<typeof PrivateProfileView>> = {},
) {
  const defaults = {
    username: 'alice',
    displayName: 'Alice W.',
    avatarUrl: null,
    ...props,
  }
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <PrivateProfileView {...defaults} />
    </NextIntlClientProvider>,
  )
}

describe('PrivateProfileView', () => {
  it('renders username with @ prefix', () => {
    renderView()
    expect(screen.getByText('@alice')).toBeInTheDocument()
  })

  it('renders displayName as heading', () => {
    renderView()
    expect(
      screen.getByRole('heading', { name: 'Alice W.' }),
    ).toBeInTheDocument()
  })

  it('falls back to username when displayName is null', () => {
    renderView({ displayName: null })
    expect(screen.getByRole('heading', { name: 'alice' })).toBeInTheDocument()
  })

  it('shows private profile message', () => {
    renderView()
    expect(screen.getByText('This profile is private')).toBeInTheDocument()
  })

  it('renders avatar image when avatarUrl provided', () => {
    renderView({ avatarUrl: 'https://r2.example.com/alice.png' })
    expect(screen.getByAltText('Alice W.')).toBeInTheDocument()
  })

  it('renders initial letter when no avatar', () => {
    renderView({ avatarUrl: null })
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
