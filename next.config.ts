import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import bundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'
import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

// LoRA training sends base64 images (up to 50 images), needs large body limit.
const PROXY_CLIENT_MAX_BODY_SIZE = '100mb'

const storageHost = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_STORAGE_BASE_URL).hostname
  : 'pub-5346558f8dc549f9ba5217489fe5395e.r2.dev'

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: PROXY_CLIENT_MAX_BODY_SIZE,
  },
  outputFileTracingRoot: PROJECT_ROOT,
  turbopack: {
    root: PROJECT_ROOT,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [32, 48, 64, 96, 200, 384],
    remotePatterns: [
      { protocol: 'https', hostname: storageHost },
      // Legacy R2 dev domain — existing images in DB still reference this
      {
        protocol: 'https',
        hostname: 'pub-5346558f8dc549f9ba5217489fe5395e.r2.dev',
      },
      // Production CDN domain — existing avatar/asset URLs in DB reference this
      { protocol: 'https', hostname: 'cdn.anteisuba.com' },
      { protocol: 'https', hostname: '*.fal.media' },
      { protocol: 'https', hostname: 'replicate.delivery' },
      { protocol: 'https', hostname: 'img.clerk.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

const withNextIntl = createNextIntlPlugin()

export default withSentryConfig(withBundleAnalyzer(withNextIntl(nextConfig)), {
  // Suppress source map upload logs in CI
  silent: !process.env.CI,

  // Upload source maps for better stack traces
  widenClientFileUpload: true,

  // Hide source maps from browser devtools in production
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
})
