import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { HomeV3ModelRail } from './HomeV3ModelRail'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const labels = {
  canDo: 'What it can do',
  advantages: 'Advantages',
  provider: 'Provider',
  pricing: 'Reference price',
  modality: 'Modality',
  openStudio: 'Create with this model',
  officialDocs: 'Official model page',
  close: 'Close',
}

const models = [
  {
    id: 'gpt-image-2',
    name: 'OpenAI GPT Image 2',
    description: 'Generate and edit high-quality images.',
    shot: '/model.webp',
    shotKind: 'brand' as const,
    price: '$0.04 / image',
    provider: 'OpenAI',
    modality: 'Image model',
    advantages: ['Premium quality', 'Versatile creation', 'Image editing'],
    href: '/en/studio/image',
    officialUrl: 'https://example.com/model',
    viewDetailsLabel: 'Learn about OpenAI GPT Image 2',
  },
]

describe('HomeV3ModelRail', () => {
  it('opens an in-page model introduction instead of navigating from the card', () => {
    render(<HomeV3ModelRail railId="image" models={models} labels={labels} />)

    const card = screen.getByRole('button', {
      name: 'Learn about OpenAI GPT Image 2',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(card)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'OpenAI GPT Image 2' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Generate and edit high-quality images.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Premium quality')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: labels.openStudio }),
    ).toHaveAttribute('href', '/en/studio/image')
  })
})
