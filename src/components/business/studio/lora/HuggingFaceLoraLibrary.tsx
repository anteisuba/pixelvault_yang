'use client'

import { useState } from 'react'
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileDown,
  Heart,
  Loader2,
  Search,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  HUGGINGFACE_LORA_FAMILY_VALUES,
  type HuggingFaceLoraFamily,
} from '@/constants/lora'
import { getCompatibleBases } from '@/constants/lora-base-models'
import { useHuggingFaceLoraLibrary } from '@/hooks/use-huggingface-lora-library'
import { cn } from '@/lib/utils'
import type {
  FavoriteLoraRequest,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'
import { LoraCoverTile } from './LoraCoverTile'

interface HuggingFaceLoraLibraryProps {
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  isFavorited: (loraUrl: string) => boolean
}

const HUGGINGFACE_FAMILY_LABEL_KEYS: Record<
  HuggingFaceLoraFamily,
  | 'huggingFaceFamilyAll'
  | 'huggingFaceFamilyAnima'
  | 'huggingFaceFamilyIllustrious'
  | 'huggingFaceFamilyPony'
  | 'huggingFaceFamilySdxl'
  | 'huggingFaceFamilyFlux'
  | 'huggingFaceFamilySd15'
  | 'huggingFaceFamilyQwenImage'
  | 'huggingFaceFamilyZImage'
  | 'huggingFaceFamilyOther'
> = {
  all: 'huggingFaceFamilyAll',
  'anima-dit': 'huggingFaceFamilyAnima',
  illustrious: 'huggingFaceFamilyIllustrious',
  pony: 'huggingFaceFamilyPony',
  sdxl: 'huggingFaceFamilySdxl',
  flux: 'huggingFaceFamilyFlux',
  sd15: 'huggingFaceFamilySd15',
  'qwen-image': 'huggingFaceFamilyQwenImage',
  'z-image': 'huggingFaceFamilyZImage',
  other: 'huggingFaceFamilyOther',
}

function fileLabel(filename: string): string {
  return filename.split('/').at(-1) ?? filename
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function HuggingFaceLoraCard({
  item,
  onImport,
  isFavorited,
}: {
  item: HuggingFaceLoraSearchItem
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  isFavorited: (loraUrl: string) => boolean
}) {
  const t = useTranslations('LoraWorkbench')
  const [selectedFilename, setSelectedFilename] = useState(
    item.files[0]?.filename ?? '',
  )
  const [importingUrl, setImportingUrl] = useState<string | null>(null)
  const selectedFile =
    item.files.find((file) => file.filename === selectedFilename) ??
    item.files[0]

  if (!selectedFile) return null

  const alreadyImported = isFavorited(selectedFile.downloadUrl)
  const isImporting = importingUrl === selectedFile.downloadUrl
  const hasAvailableBase = getCompatibleBases(
    selectedFile.baseModelFamily,
  ).some((base) => base.available)

  const handleImport = async () => {
    if (alreadyImported || isImporting) return
    setImportingUrl(selectedFile.downloadUrl)
    try {
      await onImport({
        name: item.name,
        triggerWord: item.triggerWord,
        loraUrl: selectedFile.downloadUrl,
        type: item.type,
        baseModelFamily: selectedFile.baseModelFamily,
        provider: 'huggingface',
        coverImageUrl: item.coverImageUrl,
      })
    } finally {
      setImportingUrl(null)
    }
  }

  return (
    <article className="min-w-0 rounded-xl border border-border/70 bg-card p-2.5 shadow-sm">
      <LoraCoverTile
        coverUrl={item.coverImageUrl}
        alt={item.name}
        fallbackIcon={<Boxes className="size-6" aria-hidden />}
        badgeLabel={selectedFile.baseModelFamily}
        badgeIcon={
          hasAvailableBase ? undefined : (
            <ExternalLink className="size-3" aria-hidden />
          )
        }
        badgeTitle={
          hasAvailableBase ? undefined : t('huggingFaceUnsupportedFamily')
        }
        topRight={
          <a
            href={item.modelPageUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t('huggingFaceOpenRepo')}
            title={t('huggingFaceOpenRepo')}
            className="inline-flex size-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        }
      />

      <div className="min-w-0 space-y-2 pt-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">
            {item.name}
          </h3>
          <p className="truncate text-2xs text-muted-foreground">
            {item.repoId}
          </p>
        </div>

        <div className="flex items-center gap-3 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Download className="size-3" aria-hidden />
            {formatCount(item.downloads)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" aria-hidden />
            {formatCount(item.likes)}
          </span>
          {item.license ? (
            <span className="truncate">{item.license}</span>
          ) : null}
        </div>

        <p
          className="truncate text-2xs text-muted-foreground"
          title={item.triggerWord || t('huggingFaceNoTrigger')}
        >
          {t('huggingFaceTrigger')}:{' '}
          {item.triggerWord || t('huggingFaceNoTrigger')}
        </p>

        {item.files.length > 1 ? (
          <div className="min-w-0 space-y-1">
            <label
              htmlFor={`hf-file-${item.repoId}`}
              className="text-2xs font-medium text-muted-foreground"
            >
              {t('huggingFaceSelectFile')}
            </label>
            <Select
              value={selectedFile.filename}
              onValueChange={setSelectedFilename}
            >
              <SelectTrigger
                id={`hf-file-${item.repoId}`}
                className="h-8 w-full min-w-0 max-w-full overflow-hidden text-xs [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
              >
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent className="max-w-[min(90vw,24rem)]">
                {item.files.map((file) => (
                  <SelectItem
                    key={file.filename}
                    value={file.filename}
                    className="max-w-[min(85vw,23rem)]"
                  >
                    <span
                      className="block max-w-[min(72vw,20rem)] truncate"
                      title={`${fileLabel(file.filename)} · ${file.baseModelFamily}`}
                    >
                      {fileLabel(file.filename)} · {file.baseModelFamily}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
            <FileDown className="size-3 shrink-0" aria-hidden />
            <span className="truncate" title={selectedFile.filename}>
              {fileLabel(selectedFile.filename)}
            </span>
          </p>
        )}

        <Button
          type="button"
          variant={alreadyImported ? 'secondary' : 'default'}
          size="sm"
          className="h-8 w-full text-xs"
          disabled={alreadyImported || isImporting}
          onClick={() => void handleImport()}
        >
          {isImporting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          {alreadyImported
            ? t('huggingFaceInLibrary')
            : isImporting
              ? t('huggingFaceImporting')
              : t('huggingFaceImport')}
        </Button>
      </div>
    </article>
  )
}

export function HuggingFaceLoraLibrary({
  onImport,
  isFavorited,
}: HuggingFaceLoraLibraryProps) {
  const t = useTranslations('LoraWorkbench')
  const library = useHuggingFaceLoraLibrary()

  return (
    <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t('huggingFacePublic')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('huggingFaceDescription')}
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={library.search}
            onChange={(event) => library.setSearch(event.target.value)}
            placeholder={t('huggingFaceSearchPlaceholder')}
            aria-label={t('huggingFaceSearchPlaceholder')}
            className="h-9 pl-8 pr-8 text-xs"
          />
          {library.isRevalidating ? (
            <Loader2
              className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>
      </div>

      <div
        className="mt-3 flex max-w-full gap-1.5 overflow-x-auto pb-1"
        role="group"
        aria-label={t('huggingFaceFamilyFilter')}
      >
        {HUGGINGFACE_LORA_FAMILY_VALUES.map((family) => (
          <button
            key={family}
            type="button"
            aria-pressed={library.baseModelFamily === family}
            onClick={() => library.setBaseModelFamily(family)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-xs font-medium transition-colors',
              library.baseModelFamily === family
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
            )}
          >
            {t(HUGGINGFACE_FAMILY_LABEL_KEYS[family])}
          </button>
        ))}
      </div>

      {library.error ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{t('huggingFaceLoadFailed')}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void library.refresh()}
          >
            {t('refresh')}
          </Button>
        </div>
      ) : null}

      {library.isLoading ? (
        <div
          className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          {t('huggingFaceLoading')}
        </div>
      ) : library.items.length > 0 ? (
        <div
          className={cn(
            'mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
            library.isRevalidating ? 'opacity-60' : 'opacity-100',
          )}
          aria-busy={library.isRevalidating}
        >
          {library.items.map((item) => (
            <HuggingFaceLoraCard
              key={item.repoId}
              item={item}
              onImport={onImport}
              isFavorited={isFavorited}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          {t('huggingFaceNoResults')}
        </div>
      )}

      <HuggingFacePagination
        page={library.page}
        total={library.total}
        hasNextPage={library.hasNextPage}
        isBusy={library.isRevalidating}
        onPreviousPage={library.previousPage}
        onNextPage={library.nextPage}
      />
    </section>
  )
}

function HuggingFacePagination({
  page,
  total,
  hasNextPage,
  isBusy,
  onPreviousPage,
  onNextPage,
}: {
  page: number
  total: number | null
  hasNextPage: boolean
  isBusy: boolean
  onPreviousPage: () => void
  onNextPage: () => void
}) {
  const t = useTranslations('LoraWorkbench')
  const pageStatus = total
    ? t('communityPageStatusKnown', { page, total })
    : t('communityPageStatus', { page })

  return (
    <nav
      aria-label={pageStatus}
      className="mt-3 flex shrink-0 flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1 || isBusy}
        onClick={onPreviousPage}
        className="h-9 justify-center text-xs sm:min-w-24"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {t('communityPrevious')}
      </Button>
      <span
        className="inline-flex h-9 items-center justify-center rounded-lg bg-background px-3 text-xs font-medium text-foreground ring-1 ring-border/60"
        aria-live="polite"
      >
        {pageStatus}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNextPage || isBusy}
        onClick={onNextPage}
        className="h-9 justify-center text-xs sm:min-w-24"
      >
        {t('communityNext')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Button>
    </nav>
  )
}
