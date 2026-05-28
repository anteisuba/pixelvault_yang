import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { FileText, Sparkles } from 'lucide-react'
import { z } from 'zod'

import { ROUTES } from '@/constants/routes'
import { PromptTemplateCreatePanel } from '@/components/business/prompts/PromptTemplateCreatePanel'
import { InspirationGrid } from '@/components/business/prompts/inspiration/InspirationGrid'
import {
  PromptLibraryTabs,
  type PromptLibraryTab,
} from '@/components/business/prompts/inspiration/PromptLibraryTabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { listRecipes } from '@/services/recipe.service'

const PromptCreateQuerySchema = z.object({
  tab: z.enum(['mine', 'inspiration']).optional(),
  create: z.enum(['1']).optional(),
  name: z.string().trim().max(200).optional(),
  prompt: z.string().trim().max(5000).optional(),
  negativePrompt: z.string().trim().max(1000).optional(),
  model: z.string().trim().max(100).optional(),
  provider: z.string().trim().max(100).optional(),
  outputType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'MODEL_3D']).optional(),
  generationId: z.string().trim().max(64).optional(),
})

interface PromptsPageProps {
  params: Promise<{ locale: AppLocale }>
  searchParams: Promise<{
    tab?: string
    create?: string
    name?: string
    prompt?: string
    negativePrompt?: string
    model?: string
    provider?: string
    outputType?: string
    generationId?: string
  }>
}

export async function generateMetadata({
  params,
}: PromptsPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('prompts.title'),
    description: t('prompts.description'),
    robots: 'noindex, nofollow',
  }
}

export default async function PromptsPage({
  params,
  searchParams,
}: PromptsPageProps) {
  const { locale } = await params
  const queryResult = PromptCreateQuerySchema.safeParse(await searchParams)
  const query = queryResult.success ? queryResult.data : undefined
  const t = await getTranslations({ locale, namespace: 'PromptLibrary' })
  const { userId: clerkId } = await auth()

  const currentTab: PromptLibraryTab =
    query?.tab === 'inspiration' ? 'inspiration' : 'mine'

  return (
    <main className="editorial-page">
      <div className="editorial-container space-y-8">
        <PromptLibraryTabs currentTab={currentTab} />

        {currentTab === 'inspiration' ? (
          <InspirationGrid />
        ) : (
          <MineTab
            clerkId={clerkId}
            createQuery={query}
            locale={locale}
            t={t}
          />
        )}
      </div>
    </main>
  )
}

type MineTabProps = {
  clerkId: string | null
  createQuery:
    | {
        create?: '1'
        name?: string
        prompt?: string
        negativePrompt?: string
        model?: string
        provider?: string
        outputType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D'
        generationId?: string
      }
    | undefined
  locale: AppLocale
  t: Awaited<ReturnType<typeof getTranslations>>
}

async function MineTab({ clerkId, createQuery, locale, t }: MineTabProps) {
  const getOutputTypeLabel = (outputType: string) => {
    if (outputType === 'VIDEO') return t('outputTypeVideo')
    if (outputType === 'AUDIO') return t('outputTypeAudio')
    if (outputType === 'MODEL_3D') return t('outputType3d')
    return t('outputTypeImage')
  }

  if (!clerkId) {
    return (
      <div className="editorial-panel text-center">
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="font-display text-3xl font-medium tracking-tight">
            {t('emptyTitle')}
          </h1>
          <p className="font-serif text-sm leading-7 text-muted-foreground">
            {t('emptyDescription')}
          </p>
          <Button asChild className="rounded-full px-5">
            <Link href={ROUTES.STUDIO}>{t('openStudio')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  const { recipes } = await listRecipes(clerkId, 1, 50)

  return (
    <>
      <PromptTemplateCreatePanel
        initialOpen={createQuery?.create === '1'}
        initialValues={{
          name: createQuery?.name,
          compiledPrompt: createQuery?.prompt,
          negativePrompt: createQuery?.negativePrompt,
          modelId: createQuery?.model,
          provider: createQuery?.provider,
          outputType: createQuery?.outputType,
          parentGenerationId: createQuery?.generationId,
        }}
      />

      {recipes.length === 0 ? (
        <section className="editorial-panel">
          <div className="mx-auto max-w-xl space-y-4 text-center">
            <FileText className="mx-auto size-10 text-primary/75" />
            <h2 className="font-display text-2xl font-medium">
              {t('emptyTitle')}
            </h2>
            <p className="font-serif text-sm leading-7 text-muted-foreground">
              {t('emptyDescription')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild className="rounded-full px-5">
                <Link href={ROUTES.ASSETS}>{t('openAssets')}</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full px-5">
                <Link href={ROUTES.STUDIO}>{t('openStudio')}</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              href={`${ROUTES.PROMPTS}/${recipe.id}`}
              className="group rounded-2xl border border-border/60 bg-card/80 p-5 transition-colors hover:border-primary/25 hover:bg-card"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <h2 className="line-clamp-2 font-display text-xl font-medium tracking-tight">
                    {recipe.name || recipe.modelId}
                  </h2>
                  <p className="line-clamp-3 whitespace-pre-wrap font-serif text-sm leading-7 text-muted-foreground">
                    {recipe.compiledPrompt}
                  </p>
                </div>
                <Sparkles className="size-5 shrink-0 text-primary/70 transition-transform group-hover:scale-105" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="rounded-full">
                  {getOutputTypeLabel(recipe.outputType)}
                </Badge>
                <span>
                  {t('templateMeta', {
                    model: recipe.modelId,
                    version: recipe.version,
                  })}
                </span>
                <span>
                  {new Intl.DateTimeFormat(locale, {
                    month: 'short',
                    day: 'numeric',
                  }).format(recipe.createdAt)}
                </span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </>
  )
}
