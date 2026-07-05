import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HOMEPAGE_FEATURE_SECTIONS } from '@/constants/homepage'

import { HomepageFeatureSection } from './HomepageFeatureSection'

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => `${namespace ?? ''}.${key}`
    return t
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('HomepageFeatureSection', () => {
  it('renders the standard split layout for compact rhythm', () => {
    render(
      <HomepageFeatureSection
        id="video"
        ctaHref="/studio"
        tone="forest"
        rhythm="compact"
        reverse
        showEyebrow={false}
        showCta
      />,
    )

    const section = document.getElementById('video')
    expect(section).not.toBeNull()
    expect(section).toHaveClass('homepage-feature-section')
    expect(section).toHaveClass('homepage-feature-section-compact')
    // eyebrow suppressed — no micro-kicker rendered above the headline
    expect(
      screen.queryByText('Homepage.featureSections.video.eyebrow'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Homepage.featureSections.video.title',
      }),
    ).toBeInTheDocument()
  })

  it('renders the full-bleed panorama band for panorama rhythm', () => {
    render(
      <HomepageFeatureSection
        id="workflow"
        ctaHref="/studio/node"
        tone="ink"
        rhythm="panorama"
        showEyebrow={false}
        showCta
      />,
    )

    const section = document.getElementById('workflow')
    expect(section).not.toBeNull()
    expect(section).toHaveClass('homepage-feature-panorama')
    expect(section).not.toHaveClass('homepage-feature-section')
    expect(
      screen.getByRole('heading', {
        name: 'Homepage.featureSections.workflow.title',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: 'Homepage.featureSections.workflow.cta',
      }),
    ).toHaveAttribute('href', '/studio/node')
  })

  it('renders the full-bleed audio band for band rhythm', () => {
    render(
      <HomepageFeatureSection
        id="tts"
        ctaHref="/studio"
        tone="sky"
        rhythm="band"
        showEyebrow={false}
        showCta
      />,
    )

    const section = document.getElementById('tts')
    expect(section).not.toBeNull()
    expect(section).toHaveClass('homepage-feature-band')
    expect(section).not.toHaveClass('homepage-feature-section')
    expect(
      screen.getByRole('heading', {
        name: 'Homepage.featureSections.tts.title',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Homepage.featureSections.tts.cta' }),
    ).toHaveAttribute('href', '/studio')
  })

  it('keeps every configured section eyebrow-free (anti-slop guard)', () => {
    for (const section of HOMEPAGE_FEATURE_SECTIONS) {
      expect(section.showEyebrow).toBe(false)
    }
    // exactly one panorama (canvas) and one band (audio) break the split run
    expect(
      HOMEPAGE_FEATURE_SECTIONS.filter((s) => s.rhythm === 'panorama'),
    ).toHaveLength(1)
    expect(
      HOMEPAGE_FEATURE_SECTIONS.filter((s) => s.rhythm === 'band'),
    ).toHaveLength(1)
    // no 3 consecutive left/right splits (the anti-slop reason for band+panorama)
    const isSplit = (r: string) => r === 'feature' || r === 'compact'
    let run = 0
    for (const s of HOMEPAGE_FEATURE_SECTIONS) {
      run = isSplit(s.rhythm) ? run + 1 : 0
      expect(run).toBeLessThanOrEqual(2)
    }
  })
})
