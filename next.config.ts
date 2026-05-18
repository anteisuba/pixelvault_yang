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
    // Tree-shake barrel imports for heavy icon/UI packages. Without this, a
    // single `import { Foo } from 'lucide-react'` drags in the entire icon
    // set on the client bundle.
    optimizePackageImports: [
      'lucide-react',
      'radix-ui',
      '@radix-ui/react-toolbar',
      'motion',
      'cmdk',
    ],
  },
  outputFileTracingRoot: PROJECT_ROOT,
  turbopack: {
    root: PROJECT_ROOT,
  },
  images: {
    // AI outputs are already served from R2/CDN/provider media hosts. Routing
    // them through `/_next/image` makes the Next server re-fetch large remote
    // files and can turn a slow CDN probe into a 500 during Studio browsing.
    unoptimized: true,
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
    // Defence-in-depth CSP. `script-src` / `style-src` are intentionally
    // omitted because the app embeds Clerk, Sentry, and `<script
    // type="application/ld+json">` blocks that would require nonce or
    // hash plumbing to keep working. The directives below cover the
    // attack surface that nosniff + X-Frame-Options don't:
    //
    //   - object-src 'none'     — blocks <object>/<embed>/<applet> from
    //                             loading attacker-controlled SVG/SWF.
    //   - base-uri 'self'       — prevents <base href> injection from
    //                             rewriting the resolution of every
    //                             relative URL on the page.
    //   - form-action 'self'    — caps where forms can POST to.
    //   - frame-ancestors 'none' — modern equivalent of X-Frame-Options
    //                             that browsers honour over the legacy
    //                             header.
    //   - upgrade-insecure-requests — coerces any stray http:// URL to
    //                             https:// before the request fires.
    const cspDirectives = [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives,
          },
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
