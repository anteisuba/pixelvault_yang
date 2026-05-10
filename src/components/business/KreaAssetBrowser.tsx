'use client'

import { useMemo, useState } from 'react'
import {
  Folder,
  FolderOpen,
  FolderX,
  Heart,
  Image as ImageIcon,
  Loader2,
  Mic,
  Plus,
  Search,
  Video,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import NextImage from 'next/image'

import { Input } from '@/components/ui/input'
import { ProjectCreateDialog } from '@/components/business/ProjectCreateDialog'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useProjects } from '@/hooks/use-projects'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface KreaAssetBrowserProps {
  initialGenerations: GenerationRecord[]
  initialPage: number
  initialHasMore: boolean
  initialTotal: number
  initialFilters: GalleryFilters
}

type Section =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'type'; type: 'image' | 'video' | 'audio' }
  | { kind: 'unassigned' }
  | { kind: 'project'; id: string }

function sectionFromFilters(filters: GalleryFilters): Section {
  if (filters.liked) return { kind: 'favorites' }
  if (filters.projectId === 'none') return { kind: 'unassigned' }
  if (filters.projectId) return { kind: 'project', id: filters.projectId }
  if (
    filters.type === 'image' ||
    filters.type === 'video' ||
    filters.type === 'audio'
  ) {
    return { kind: 'type', type: filters.type }
  }
  return { kind: 'all' }
}

/**
 * KreaAssetBrowser — full-page asset browser with a Krea-style right sidebar.
 *
 * Right sidebar has four sections (All / Favorites / Tools / Folders) that
 * collapse into existing useGallery filters: type for Tools, liked for
 * Favorites, projectId for Folders. Selecting a section resets the other
 * filter dimensions so the user can't end up in an "ANDed" filter state
 * they didn't ask for.
 */
export function KreaAssetBrowser({
  initialGenerations,
  initialPage,
  initialHasMore,
  initialTotal,
  initialFilters,
}: KreaAssetBrowserProps) {
  const t = useTranslations('AssetsPage')

  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const {
    generations,
    total,
    isLoading,
    hasMore,
    sentinelRef,
    filters,
    setFilters,
  } = useGallery({
    initialGenerations,
    initialPage,
    initialHasMore,
    initialTotal,
    initialFilters,
    mine: true,
    limit: 24,
  })

  const { projects, refresh: refreshProjects } = useProjects()
  const section = useMemo(() => sectionFromFilters(filters), [filters])

  const setSection = (next: Section) => {
    const base: GalleryFilters = {
      ...filters,
      // Reset orthogonal dimensions when navigating sections to keep the
      // mental model simple — sections are mutually exclusive in Krea.
      liked: false,
      projectId: '',
      type: 'all',
    }
    switch (next.kind) {
      case 'all':
        setFilters(base)
        return
      case 'favorites':
        setFilters({ ...base, liked: true })
        return
      case 'type':
        setFilters({ ...base, type: next.type })
        return
      case 'unassigned':
        setFilters({ ...base, projectId: 'none' })
        return
      case 'project':
        setFilters({ ...base, projectId: next.id })
        return
    }
  }

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFilters({ ...filters, search: searchInput.trim() })
  }

  const isEmpty = !isLoading && generations.length === 0

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-background">
      <div className="flex flex-1 min-h-0 gap-4 px-2 sm:px-6">
        {/* ─── Main grid area ────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto py-4">
          <form
            onSubmit={handleSearchSubmit}
            className="relative mb-4 max-w-md"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('search')}
              className="h-10 pl-9 text-sm"
            />
          </form>

          {isEmpty ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {generations.length === 0 && isLoading
                ? Array.from({ length: 12 }).map((_, idx) => (
                    <div
                      key={`s-${idx}`}
                      className="aspect-square animate-pulse rounded-md bg-muted/40"
                    />
                  ))
                : generations.map((gen) => (
                    <Link
                      key={gen.id}
                      href={`${ROUTES.GALLERY}/${gen.id}`}
                      className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted/40 transition-all duration-200 hover:border-primary/40 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      aria-label={gen.prompt || gen.id}
                      title={gen.prompt || undefined}
                    >
                      {gen.outputType === 'VIDEO' ? (
                        <video
                          src={`${gen.url}#t=0.1`}
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : gen.outputType === 'AUDIO' ? (
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                          <Mic className="size-8" />
                        </div>
                      ) : (
                        <NextImage
                          src={gen.url}
                          alt={gen.prompt || ''}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                          className="object-cover"
                          loading="lazy"
                        />
                      )}
                    </Link>
                  ))}
              {hasMore && (
                <div ref={sentinelRef} className="col-span-full h-2" />
              )}
            </div>
          )}

          {isLoading && generations.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
        </main>

        {/* ─── Right sidebar ─────────────────────────────────────── */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-border/60 py-4 pl-4 lg:block">
          <SidebarItem
            active={section.kind === 'all'}
            icon={<FolderOpen className="size-4" />}
            label={t('sidebarAll')}
            count={total}
            onClick={() => setSection({ kind: 'all' })}
          />
          <SidebarItem
            active={section.kind === 'favorites'}
            icon={<Heart className="size-4" />}
            label={t('sidebarFavorites')}
            onClick={() => setSection({ kind: 'favorites' })}
          />

          <SidebarHeading label={t('sidebarTools')} />
          <SidebarItem
            active={section.kind === 'type' && section.type === 'image'}
            icon={<ImageIcon className="size-4" />}
            label={t('sidebarImages')}
            onClick={() => setSection({ kind: 'type', type: 'image' })}
          />
          <SidebarItem
            active={section.kind === 'type' && section.type === 'video'}
            icon={<Video className="size-4" />}
            label={t('sidebarVideos')}
            onClick={() => setSection({ kind: 'type', type: 'video' })}
          />
          <SidebarItem
            active={section.kind === 'type' && section.type === 'audio'}
            icon={<Mic className="size-4" />}
            label={t('sidebarAudio')}
            onClick={() => setSection({ kind: 'type', type: 'audio' })}
          />

          <div className="mt-4 mb-1 flex items-center justify-between">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
              {t('sidebarFolders')}
            </span>
            <ProjectCreateDialog
              onCreated={(project) => {
                void refreshProjects()
                setSection({ kind: 'project', id: project.id })
              }}
              trigger={
                <button
                  type="button"
                  aria-label="Create folder"
                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </button>
              }
            />
          </div>
          <SidebarItem
            active={section.kind === 'unassigned'}
            icon={<FolderX className="size-4" />}
            label={t('sidebarUnassigned')}
            onClick={() => setSection({ kind: 'unassigned' })}
          />
          {projects.map((project) => (
            <SidebarItem
              key={project.id}
              active={section.kind === 'project' && section.id === project.id}
              icon={<Folder className="size-4" />}
              label={project.name}
              onClick={() => setSection({ kind: 'project', id: project.id })}
            />
          ))}
        </aside>
      </div>
    </div>
  )
}

// ─── Sidebar primitives ────────────────────────────────────────

interface SidebarItemProps {
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  onClick: () => void
}

function SidebarItem({
  active,
  icon,
  label,
  count,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/80 hover:bg-muted/40 hover:text-foreground',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'shrink-0',
            active ? 'text-primary' : 'text-muted-foreground/70',
          )}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      {typeof count === 'number' && (
        <span className="shrink-0 text-2xs text-muted-foreground/70 tabular-nums">
          {count}
        </span>
      )}
    </button>
  )
}

function SidebarHeading({ label }: { label: string }) {
  return (
    <div className="mt-4 mb-1 px-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
      {label}
    </div>
  )
}

function EmptyState() {
  const t = useTranslations('AssetsPage')
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
        <ImageIcon className="size-6" />
      </div>
      <h2 className="font-display text-xl font-medium">{t('emptyTitle')}</h2>
      <p className="font-serif text-sm text-muted-foreground">
        {t('emptyDescription')}
      </p>
      <Link
        href={ROUTES.STUDIO_IMAGE}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        {t('emptyAction')}
      </Link>
    </div>
  )
}
