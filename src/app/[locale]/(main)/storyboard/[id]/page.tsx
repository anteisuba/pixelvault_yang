'use client'

import { use, useRef } from 'react'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import type { NarrativeTone } from '@/types'
import { Button } from '@/components/ui/button'
import { StoryScrollRenderer } from '@/components/business/StoryScrollRenderer'
import { StoryComicRenderer } from '@/components/business/StoryComicRenderer'
import { StoryImagePicker } from '@/components/business/StoryImagePicker'
import { StoryExportButton } from '@/components/business/StoryExportButton'
import { useStoryEditor } from '@/hooks/use-storyboard'

const TONE_OPTIONS: { value: NarrativeTone; emoji: string }[] = [
  { value: 'humorous', emoji: '😄' },
  { value: 'dramatic', emoji: '🎭' },
  { value: 'poetic', emoji: '🌸' },
  { value: 'adventure', emoji: '⚔️' },
]

interface StoryDetailPageProps {
  params: Promise<{ id: string }>
}

export default function StoryDetailPage({ params }: StoryDetailPageProps) {
  const { id } = use(params)
  const t = useTranslations('StoryBoard')
  const contentRef = useRef<HTMLDivElement>(null)
  const {
    story,
    loading,
    isGeneratingNarrative,
    error,
    updateStory,
    generateNarrative,
    reorderPanels,
  } = useStoryEditor(id)

  if (loading) {
    return (
      <div className="editorial-page">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!story) {
    return (
      <div className="editorial-page">
        <div className="editorial-container">
          <p className="py-24 text-center text-muted-foreground">
            {t('notFound')}
          </p>
        </div>
      </div>
    )
  }

  const hasNarrative = story.panels.some((p) => p.narration)

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span className="editorial-eyebrow">{t('storyEyebrow')}</span>
            <h1 className="editorial-title">{story.title}</h1>
            <p className="editorial-copy">
              {t('panelCount', { count: story.panels.length })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={ROUTES.STORYBOARD}>
              <Button variant="outline" className="gap-2 rounded-full">
                <ArrowLeft className="size-4" />
                {t('backToList')}
              </Button>
            </Link>

            <Button
              variant="outline"
              className="rounded-full"
              onClick={() =>
                updateStory({
                  displayMode:
                    story.displayMode === 'scroll' ? 'comic' : 'scroll',
                })
              }
            >
              {story.displayMode === 'scroll'
                ? t('switchToComic')
                : t('switchToScroll')}
            </Button>

            <Button
              variant="outline"
              className="gap-1.5 rounded-full"
              onClick={() => updateStory({ isPublic: !story.isPublic })}
            >
              {story.isPublic ? (
                <>
                  <EyeOff className="size-3.5" />
                  {t('makePrivate')}
                </>
              ) : (
                <>
                  <Eye className="size-3.5" />
                  {t('makePublic')}
                </>
              )}
            </Button>

            <StoryExportButton
              storyTitle={story.title}
              contentRef={contentRef}
            />
          </div>
        </section>

        <section className="editorial-panel">
          {/* Panel reorder */}
          <div className="mb-6">
            <StoryImagePicker panels={story.panels} onReorder={reorderPanels} />
          </div>

          {/* Narrative generation */}
          {!hasNarrative && (
            <div className="mb-8 rounded-2xl border border-primary/20 bg-primary/3 p-4">
              <p className="mb-3 text-sm font-medium text-foreground">
                {t('generateNarrativePrompt')}
              </p>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant="outline"
                    size="sm"
                    disabled={isGeneratingNarrative}
                    onClick={() => generateNarrative(option.value)}
                    className="gap-1.5 rounded-full"
                  >
                    {isGeneratingNarrative ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <span>{option.emoji}</span>
                    )}
                    {t(`tones.${option.value}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {hasNarrative && (
            <div className="mb-6 flex items-center justify-end gap-2">
              <p className="text-xs text-muted-foreground">
                {t('regenerateHint')}
              </p>
              {TONE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant="ghost"
                  size="sm"
                  disabled={isGeneratingNarrative}
                  onClick={() => generateNarrative(option.value)}
                  className="size-8 rounded-full p-0"
                  title={t(`tones.${option.value}`)}
                >
                  {option.emoji}
                </Button>
              ))}
            </div>
          )}

          {/* Render story */}
          <div ref={contentRef}>
            {story.displayMode === 'comic' ? (
              <StoryComicRenderer panels={story.panels} />
            ) : (
              <StoryScrollRenderer panels={story.panels} />
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
