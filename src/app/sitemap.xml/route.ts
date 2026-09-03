import { NextResponse } from 'next/server'

import { generateSitemaps } from '../sitemap'

// `sitemap.ts` exports `generateSitemaps`, which makes Next serve each
// segment at /sitemap/<id>.xml instead of a single /sitemap.xml (see
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap#generating-multiple-sitemaps).
// Next does not synthesize a sitemap index for that case, so this route
// fills the now-free /sitemap.xml path with one, listing every segment.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const dynamic = 'force-dynamic'

export async function GET() {
  const segments = await generateSitemaps()

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${segments.map((segment) => `  <sitemap><loc>${APP_URL}/sitemap/${segment.id}.xml</loc></sitemap>`).join('\n')}
</sitemapindex>`

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
