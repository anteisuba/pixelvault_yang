import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import bundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'
import createWithVercelToolbar from '@vercel/toolbar/plugins/next'
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
      // Inspiration library source — curated prompt thumbnails imported
      // from MeiGen-AI-Design's trending-prompts dataset. Phase 1 uses
      // external hot-linking; a future PR will mirror to R2.
      { protocol: 'https', hostname: 'images.meigen.ai' },
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
    //                             https:// before the request fires. Keep it
    //                             production-only: mobile browser emulation
    //                             otherwise upgrades localhost dev assets and
    //                             leaves the page permanently unstyled.
    const cspDirectives = [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(process.env.NODE_ENV === 'development'
        ? []
        : ['upgrade-insecure-requests']),
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
      {
        // Studio onboarding guide images under /public/tutorials rarely change.
        // Vercel serves public assets with `max-age=0, must-revalidate` by
        // default, forcing a revalidation round-trip on every Studio empty-
        // state view and mode switch. Pin them immutable so repeat views hit
        // the browser cache. Filenames are semantic (not content-hashed), so
        // when a guide image is updated, rename it (e.g. bump a suffix) to bust
        // the cache — overwriting in place would leave clients on the old one.
        source: '/tutorials/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

const withNextIntl = createNextIntlPlugin()
const withVercelToolbar =
  process.env.NEXT_PUBLIC_ENABLE_VERCEL_TOOLBAR === 'true'
    ? createWithVercelToolbar()
    : (config: NextConfig) => config

export default withSentryConfig(
  withBundleAnalyzer(withNextIntl(withVercelToolbar(nextConfig))),
  {
    // Suppress source map upload logs in CI
    silent: !process.env.CI,

    // Upload source maps for better stack traces
    widenClientFileUpload: true,

    // Hide source maps from browser devtools in production
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
  },
)
