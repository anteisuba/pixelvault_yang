import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'

import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '@/lib/design-tokens'
import { isAppLocale } from '@/i18n/routing'

export const runtime = 'edge'
export const alt = 'PixelVault — Personal AI Gallery'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  let tagline = 'Generate with multiple AI models. Archive every result.'
  if (isAppLocale(locale)) {
    const t = await getTranslations({ locale, namespace: 'Metadata' })
    tagline = t('description')
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        backgroundColor: BRAND_BG,
        padding: '72px 80px',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Accent gradient blob */}
      <div
        style={{
          position: 'absolute',
          top: -120,
          right: -80,
          width: 520,
          height: 520,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(217,119,87,0.18) 0%, transparent 70%)',
        }}
      />

      {/* Brand mark — dot */}
      <div
        style={{
          position: 'absolute',
          top: 72,
          left: 80,
          width: 14,
          height: 14,
          borderRadius: '50%',
          backgroundColor: BRAND_ACCENT,
        }}
      />

      {/* Site name */}
      <div
        style={{
          position: 'absolute',
          top: 62,
          left: 108,
          fontSize: 28,
          fontWeight: 700,
          color: BRAND_FG,
          letterSpacing: '-0.03em',
        }}
      >
        PixelVault
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 44,
          fontWeight: 600,
          color: BRAND_FG,
          letterSpacing: '-0.03em',
          lineHeight: 1.15,
          maxWidth: 780,
          marginBottom: 32,
        }}
      >
        {tagline}
      </div>

      {/* Bottom accent bar */}
      <div
        style={{
          width: 48,
          height: 4,
          borderRadius: 2,
          backgroundColor: BRAND_ACCENT,
        }}
      />
    </div>,
    {
      ...size,
    },
  )
}
