'use client'

import { useState } from 'react'
import NextImage from 'next/image'
import { BookOpen, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { StoryCard } from '@/components/business/StoryCard'
import { useStoryList } from '@/hooks/use-storyboard'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import type { GenerationRecord } from '@/types'

export default function StoryboardPage() {
  const t = useTranslations('StoryBoard')
  const { stories, loading, createStory, removeStory } = useStoryList()
  const [showCreate, setShowCreate] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [selectedGenerations, setSelectedGenerations] = useState<
    GenerationRecord[]
  >([])
  const [isCreating, setIsCreating] = useState(false)

  const handleSelectGeneration = (generation: GenerationRecord) => {
    setSelectedGenerations((prev) =>
      prev.some((item) => item.id === generation.id)
        ? prev
        : [...prev, generation],
    )
  }

  const handleRemoveGeneration = (generationId: string) => {
    setSelectedGenerations((prev) =>
      prev.filter((generation) => generation.id !== generationId),
    )
  }

  const handleCreate = async () => {
    const storyTitle = title.trim()
    if (!storyTitle || selectedGenerations.length === 0) return

    setIsCreating(true)
    try {
      const result = await createStory(
        storyTitle,
        selectedGenerations.map((generation) => generation.id),
      )
      if (result.success) {
        setTitle('')
        setSelectedGenerations([])
        setShowCreate(false)
      }
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span className="editorial-eyebrow">{t('heroEyebrow')}</span>
            <h1 className="editorial-title">{t('heroTitle')}</h1>
            <p className="editorial-copy max-w-2xl">{t('heroDescription')}</p>
          </div>

          <Button
            onClick={() => setShowCreate((v) => !v)}
            className="w-fit gap-2 rounded-full"
          >
            <Plus className="size-4" />
            {t('createButton')}
          </Button>
        </section>

        <section className="editorial-panel">
          {showCreate && (
            <div className="mb-6 space-y-4 rounded-2xl border border-border/75 bg-card/70 p-4 shadow-sm sm:p-5">
              <Input
                placeholder={t('titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl"
              />

              <div className="space-y-3 rounded-xl border border-dashed border-border/80 bg-background/50 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {t('panelPickerLabel')}
                    </p>
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {t('panelPickerHint')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAssetPickerOpen(true)}
                    className="w-fit gap-2 rounded-full"
                  >
                    <ImagePlus className="size-4" />
                    {selectedGenerations.length > 0
                      ? t('addMoreAssets')
                      : t('selectAssetsAction')}
                  </Button>
                </div>

                {selectedGenerations.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {selectedGenerations.map((generation, index) => (
                      <div
                        key={generation.id}
                        className="group relative overflow-hidden rounded-xl border border-border/75 bg-background"
                      >
                        <div className="relative aspect-square bg-muted/40">
                          <NextImage
                            src={getGenerationThumbnailUrl(generation)}
                            alt={t('selectedAssetAlt', {
                              index: index + 1,
                            })}
                            fill
                            sizes="(max-width: 640px) 50vw, 160px"
                            className="object-cover"
                          />
                        </div>
                        <div className="space-y-1 p-2">
                          <p className="line-clamp-2 text-xs leading-5 text-foreground">
                            {generation.prompt || t('untitledAsset')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('selectedAssetPosition', {
                              index: index + 1,
                            })}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemoveGeneration(generation.id)}
                          aria-label={t('removeSelectedAsset', {
                            index: index + 1,
                          })}
                          className="absolute right-1 top-1 rounded-full bg-background/85 text-muted-foreground opacity-100 shadow-sm hover:text-foreground sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-center">
                    <ImagePlus className="size-7 text-muted-foreground/60" />
                    <p className="text-sm font-medium">
                      {t('noAssetsSelected')}
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {t('noAssetsSelectedHint')}
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={handleCreate}
                disabled={
                  !title.trim() ||
                  selectedGenerations.length === 0 ||
                  isCreating
                }
                className="gap-2 rounded-full"
              >
                {isCreating ? (
                  <Spinner size="md" />
                ) : (
                  <Plus className="size-4" />
                )}
                {t('createAction')}
              </Button>
            </div>
          )}

          <AssetSelectorDialog
            open={assetPickerOpen}
            onOpenChange={setAssetPickerOpen}
            onSelect={handleSelectGeneration}
            title={t('assetPickerTitle')}
            description={t('assetPickerDescription')}
            mediaType="image"
          />

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!loading && stories.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <BookOpen className="size-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('emptySubtitle')}
              </p>
            </div>
          )}

          {/* Story grid */}
          {!loading && stories.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  onDelete={removeStory}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
