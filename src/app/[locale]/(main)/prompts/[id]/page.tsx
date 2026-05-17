import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import NextImage from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft, Sparkles } from 'lucide-react'

import { assetGenerationPath, ROUTES } from '@/constants/routes'
import { CopyPromptButton } from '@/components/business/CopyPromptButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import { getRecipe, listRecipeGenerations } from '@/services/recipe.service'

interface PromptDetailPageProps {
  params: Promise<{ locale: AppLocale; id: string }>
}

export async function generateMetadata({
  params,
}: PromptDetailPageProps): Promise<Metadata> {
  const { locale, id } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: `${id} — ${t('prompts.title')}`,
    robots: 'noindex, nofollow',
  }
}

export default async function PromptDetailPage({
  params,
}: PromptDetailPageProps) {
  const { locale, id } = await params
  const t = await getTranslations({ locale, namespace: 'PromptLibrary' })
  const { userId: clerkId } = await auth()
  const getOutputTypeLabel = (outputType: string) => {
    if (outputType === 'VIDEO') return t('outputTypeVideo')
    if (outputType === 'AUDIO') return t('outputTypeAudio')
    if (outputType === 'MODEL_3D') return t('outputType3d')
    return t('outputTypeImage')
  }

  if (!clerkId) notFound()

  const recipe = await getRecipe(clerkId, id)
  if (!recipe) notFound()

  const generations = await listRecipeGenerations(clerkId, id)

  return (
    <main className="editorial-page">
      <div className="editorial-container space-y-8">
        <div>
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href={ROUTES.PROMPTS}>
              <ArrowLeft className="size-4" />
              {t('title')}
            </Link>
          </Button>
        </div>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(18rem,0.55fr)]">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="editorial-eyebrow">{t('templatePicker')}</p>
              <h1 className="break-words font-display text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
                {recipe.name || recipe.modelId}
              </h1>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full">
                  {getOutputTypeLabel(recipe.outputType)}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {t('templateMeta', {
                    model: recipe.modelId,
                    version: recipe.version,
                  })}
                </Badge>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/82 p-5">
              <p className="whitespace-pre-wrap font-serif text-base leading-8 text-foreground">
                {recipe.compiledPrompt}
              </p>
            </div>

            {recipe.negativePrompt ? (
              <div className="rounded-2xl border border-border/60 bg-background/50 p-5">
                <p className="whitespace-pre-wrap font-serif text-sm leading-7 text-muted-foreground">
                  {recipe.negativePrompt}
                </p>
              </div>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-border/60 bg-card/78 p-5">
            <div className="space-y-4">
              <Button asChild className="w-full rounded-full">
                <Link href={ROUTES.STUDIO}>
                  <Sparkles className="size-4" />
                  {t('useInStudio')}
                </Link>
              </Button>
              <CopyPromptButton prompt={recipe.compiledPrompt} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t('sourceWork')}</dt>
                <dd className="break-all">
                  {recipe.parentGenerationId ?? '—'}
                </dd>
                <dt className="text-muted-foreground">{t('provider')}</dt>
                <dd>{recipe.provider}</dd>
                <dt className="text-muted-foreground">{t('createdAt')}</dt>
                <dd>
                  {new Intl.DateTimeFormat(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }).format(recipe.createdAt)}
                </dd>
              </dl>
            </div>
          </aside>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-medium">
                {t('generatedAssets')}
              </h2>
              <p className="font-serif text-sm leading-7 text-muted-foreground">
                {t('generatedAssetsDescription')}
              </p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full">
              {generations.length}
            </Badge>
          </div>

          {generations.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card/70 px-5 py-8 text-center font-serif text-sm text-muted-foreground">
              {t('noGeneratedAssets')}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {generations.map((generation) => (
                <Link
                  key={generation.id}
                  href={assetGenerationPath(generation.id)}
                  className="group overflow-hidden rounded-2xl border border-border/60 bg-card/80 transition-colors hover:border-primary/25"
                >
                  <div className="relative aspect-square bg-muted/40">
                    {generation.outputType === 'IMAGE' ||
                    generation.outputType === 'MODEL_3D' ? (
                      <NextImage
                        src={getGenerationPreviewUrl(generation)}
                        alt={generation.prompt || generation.id}
                        fill
                        sizes="(min-width: 1280px) 28vw, (min-width: 640px) 45vw, 90vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        {getOutputTypeLabel(generation.outputType)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="line-clamp-2 font-serif text-sm leading-6 text-foreground">
                      {generation.prompt}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="rounded-full">
                        {generation.model}
                      </Badge>
                      <span>
                        {new Intl.DateTimeFormat(locale, {
                          month: 'short',
                          day: 'numeric',
                        }).format(new Date(generation.createdAt))}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
