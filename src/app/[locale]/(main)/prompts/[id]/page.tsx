import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import NextImage from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft } from 'lucide-react'

import { assetGenerationPath, ROUTES } from '@/constants/routes'
import { PromptTemplateDetailEditor } from '@/components/business/PromptTemplateDetailEditor'
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

        <PromptTemplateDetailEditor
          locale={locale}
          recipe={{
            id: recipe.id,
            name: recipe.name,
            outputType: recipe.outputType,
            compiledPrompt: recipe.compiledPrompt,
            negativePrompt: recipe.negativePrompt,
            modelId: recipe.modelId,
            provider: recipe.provider,
            parentGenerationId: recipe.parentGenerationId,
            version: recipe.version,
            createdAt: recipe.createdAt.toISOString(),
          }}
        />

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
