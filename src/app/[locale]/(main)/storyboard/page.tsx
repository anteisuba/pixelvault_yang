'use client'

import { useState } from 'react'
import { BookOpen, Loader2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StoryCard } from '@/components/business/StoryCard'
import { useStoryList } from '@/hooks/use-storyboard'

export default function StoryboardPage() {
  const t = useTranslations('StoryBoard')
  const { stories, loading, createStory, removeStory } = useStoryList()
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [generationIds, setGenerationIds] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!title.trim() || !generationIds.trim()) return
    setIsCreating(true)
    const ids = generationIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    await createStory(title, ids)
    setTitle('')
    setGenerationIds('')
    setShowCreate(false)
    setIsCreating(false)
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
          {/* Create form */}
          {showCreate && (
            <div className="mb-6 space-y-3 rounded-2xl border border-primary/20 bg-primary/3 p-4">
              <Input
                placeholder={t('titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl"
              />
              <Input
                placeholder={t('idsPlaceholder')}
                value={generationIds}
                onChange={(e) => setGenerationIds(e.target.value)}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">{t('idsHint')}</p>
              <Button
                onClick={handleCreate}
                disabled={!title.trim() || !generationIds.trim() || isCreating}
                className="gap-2 rounded-full"
              >
                {isCreating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {t('createAction')}
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
