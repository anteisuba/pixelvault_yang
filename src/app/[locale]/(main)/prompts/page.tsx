import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { FileText } from 'lucide-react'
import { z } from 'zod'

import { ROUTES } from '@/constants/routes'
import { PromptTemplateCreatePanel } from '@/components/business/prompts/PromptTemplateCreatePanel'
import { PromptTemplateList } from '@/components/business/prompts/PromptTemplateList'
import { InspirationGrid } from '@/components/business/prompts/inspiration/InspirationGrid'
import {
  PromptLibraryTabs,
  type PromptLibraryTab,
} from '@/components/business/prompts/inspiration/PromptLibraryTabs'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { listRecipeSummaries } from '@/services/prompts/recipe.service'

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
  const [t, authState] = await Promise.all([
    getTranslations({ locale, namespace: 'PromptLibrary' }),
    auth(),
  ])
  const { userId: clerkId } = authState

  const currentTab: PromptLibraryTab =
    query?.tab === 'inspiration' ? 'inspiration' : 'mine'

  return (
    <main className="editorial-page">
      <div className="editorial-container editorial-container--wide">
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

  const recipes = await listRecipeSummaries(clerkId, 1, 50)

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
        <PromptTemplateList
          locale={locale}
          recipes={recipes.map((recipe) => ({
            id: recipe.id,
            outputType: recipe.outputType,
            name: recipe.name,
            compiledPrompt: recipe.compiledPrompt,
            modelId: recipe.modelId,
            version: recipe.version,
            createdAt: recipe.createdAt.toISOString(),
            outputTypeLabel: getOutputTypeLabel(recipe.outputType),
            coverThumbnailUrl: recipe.coverThumbnailUrl,
          }))}
        />
      )}
    </>
  )
}
