import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

import { PAGINATION } from '@/constants/config'
import { ROUTES } from '@/constants/routes'

import { KreaAssetBrowser } from '@/components/business/KreaAssetBrowser'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { GallerySearchSchema } from '@/types'
import {
  getGenerationByIdForUser,
  getPublicGenerationPage,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const AssetsPageSearchSchema = GallerySearchSchema.extend({
  generationId: z.string().trim().max(64).optional(),
})

interface AssetsPageProps {
  params: Promise<{ locale: AppLocale }>
  searchParams: Promise<{
    search?: string
    model?: string
    sort?: string
    type?: string
    projectId?: string
    published?: string
    generationId?: string
  }>
}

export async function generateMetadata({
  params,
}: AssetsPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('assets.title'),
    description: t('assets.description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * /assets — Krea-style asset browser for signed-in asset management.
 * It uses the same user-scoped generation source as the legacy private
 * works feed, with sections for favorites, published assets, tools, and folders.
 */
export default async function AssetsPage({
  params,
  searchParams,
}: AssetsPageProps) {
  const { locale: _locale } = await params
  void _locale
  const rawSearchParams = await searchParams
  const filterResult = AssetsPageSearchSchema.safeParse(rawSearchParams)
  const shouldDefaultToImages =
    !rawSearchParams.type &&
    !rawSearchParams.search &&
    !rawSearchParams.model &&
    !rawSearchParams.projectId &&
    !rawSearchParams.published &&
    !rawSearchParams.generationId
  const initialFilters = filterResult.success
    ? {
        search: filterResult.data.search ?? '',
        model: filterResult.data.model ?? '',
        sort: filterResult.data.sort,
        type: shouldDefaultToImages ? 'image' : filterResult.data.type,
        timeRange: filterResult.data.timeRange,
        liked: false,
        published: filterResult.data.published === '1',
        projectId: filterResult.data.projectId ?? '',
      }
    : {
        search: '',
        model: '',
        sort: 'newest' as const,
        type: 'image' as const,
        timeRange: 'all' as const,
        liked: false,
        published: false,
        projectId: '',
      }

  const t = await getTranslations({ locale: _locale, namespace: 'AssetsPage' })
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    // Mirror KreaAssetBrowser's layout so the unauth user sees exactly the
    // page shape they'll get after signing in — blurred grid + real sidebar
    // structure with disabled rows + glass CTA in the middle. Far more
    // legible than a single centred panel over 80% black void.
    const tileGradients = [
      'from-violet-500/30 via-fuchsia-500/20 to-rose-400/30',
      'from-sky-500/30 via-cyan-400/20 to-indigo-500/30',
      'from-amber-400/30 via-orange-500/25 to-rose-500/25',
      'from-emerald-500/30 via-teal-400/20 to-cyan-500/25',
      'from-pink-500/30 via-rose-400/20 to-orange-400/25',
      'from-slate-400/25 via-zinc-500/20 to-slate-700/30',
      'from-lime-400/25 via-emerald-500/20 to-teal-600/25',
      'from-indigo-500/30 via-purple-500/20 to-fuchsia-500/25',
    ]
    const previewTiles = Array.from({ length: 24 }, (_, i) => ({
      key: i,
      gradient: tileGradients[i % tileGradients.length],
      // Pseudo-random aspect-affecting glow so the grid doesn't read as a
      // uniform stamp. Same index → same look (SSR-safe, hydration-safe).
      angle: (i * 37) % 360,
    }))

    type SidebarRow = { key: string; label: string; icon: string }
    const sidebarSections: SidebarRow[] = [
      { key: 'all', label: t('sidebarAll'), icon: '▦' },
      { key: 'favorites', label: t('sidebarFavorites'), icon: '♡' },
      { key: 'published', label: t('sidebarPublished'), icon: '◌' },
      { key: 'uploads', label: t('sidebarUploads'), icon: '↑' },
    ]
    const sidebarTools: SidebarRow[] = [
      { key: 'image', label: t('sidebarImages'), icon: '▢' },
      { key: 'video', label: t('sidebarVideos'), icon: '▷' },
      { key: 'audio', label: t('sidebarAudio'), icon: '◉' },
    ]

    return (
      <div className="flex h-[calc(100dvh-3rem)] flex-col bg-background">
        <div className="relative flex min-h-0 flex-1 gap-4 px-2 sm:px-6">
          {/* ─── Main grid preview (blurred) ──────────────────── */}
          <main
            className="flex-1 min-w-0 overflow-hidden py-4"
            aria-hidden="true"
          >
            <div className="pointer-events-none mb-4 flex items-center gap-3 opacity-50">
              <div className="relative h-10 max-w-md flex-1 rounded-md border border-border/60 bg-muted/20">
                <div className="absolute left-9 top-1/2 h-3 w-32 -translate-y-1/2 rounded bg-muted/60" />
                <div className="absolute left-3 top-1/2 size-4 -translate-y-1/2 rounded-sm bg-muted/60" />
              </div>
              <div className="hidden h-10 w-24 shrink-0 rounded-full border border-border/60 bg-muted/10 sm:block" />
              <div className="hidden h-10 w-10 shrink-0 rounded-full border border-border/60 bg-muted/10 sm:block" />
            </div>

            <div className="pointer-events-none grid grid-cols-2 gap-2 opacity-60 blur-[6px] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {previewTiles.map((tile) => (
                <div
                  key={tile.key}
                  className={`relative aspect-square overflow-hidden rounded-md border border-border/40 bg-gradient-to-br ${tile.gradient}`}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `conic-gradient(from ${tile.angle}deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.08) 90deg, transparent 180deg)`,
                    }}
                  />
                </div>
              ))}
            </div>
          </main>

          {/* ─── Right sidebar preview (disabled) ─────────────── */}
          <aside
            className="hidden w-64 shrink-0 overflow-hidden border-l border-border/60 py-4 pl-4 opacity-50 lg:block"
            aria-hidden="true"
          >
            <div className="space-y-1">
              {sidebarSections.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="inline-block w-4 text-center text-xs">
                      {row.icon}
                    </span>
                    {row.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground/60">
                    —
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {t('sidebarTools')}
            </div>
            <div className="mt-1 space-y-1">
              {sidebarTools.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="inline-block w-4 text-center text-xs">
                      {row.icon}
                    </span>
                    {row.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground/60">
                    —
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {t('sidebarFolders')}
            </div>
            <div className="mt-1 space-y-1">
              <div className="h-7 rounded-md bg-muted/20" />
              <div className="h-7 w-3/4 rounded-md bg-muted/20" />
              <div className="h-7 w-2/3 rounded-md bg-muted/20" />
            </div>
          </aside>

          {/* ─── Centered CTA overlay ─────────────────────────── */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
            <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border/70 bg-background/70 p-8 text-center shadow-2xl backdrop-blur-xl">
              <h1 className="font-display text-2xl font-medium tracking-tight">
                {t('signedOutTitle')}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('signedOutDescription')}
              </p>
              <div className="mt-5 flex flex-col items-center gap-2">
                <Button asChild size="lg" className="h-11 rounded-full px-6">
                  <Link href={ROUTES.SIGN_IN}>{t('signedOutAction')}</Link>
                </Button>
                <Link
                  href={ROUTES.STUDIO}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t('signedOutSecondary')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const user = await ensureUser(clerkId)
  const initialSelectedGeneration =
    filterResult.success && filterResult.data.generationId
      ? await getGenerationByIdForUser(filterResult.data.generationId, user.id)
      : null

  const initialPage = await getPublicGenerationPage({
    page: PAGINATION.DEFAULT_PAGE,
    limit: PAGINATION.DEFAULT_LIMIT,
    search: initialFilters.search || undefined,
    model: initialFilters.model || undefined,
    sort: initialFilters.sort,
    type: initialFilters.type,
    published: initialFilters.published,
    userId: user.id,
    projectId: initialFilters.projectId || undefined,
  })
  const filteredTotal = initialPage.total ?? initialPage.generations.length

  return (
    <KreaAssetBrowser
      initialGenerations={initialPage.generations}
      initialPage={PAGINATION.DEFAULT_PAGE}
      initialHasMore={initialPage.hasMore}
      initialNextCursor={initialPage.nextCursor}
      initialTotal={filteredTotal}
      initialFilters={initialFilters}
      initialSelectedGeneration={initialSelectedGeneration}
    />
  )
}
