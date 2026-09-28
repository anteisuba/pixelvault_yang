import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { FileText } from '@/components/icons'
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

  // 提示词页 A（pages/prompts.md）：灰底地台 + 顶行（标题 · 分段 · 新建）+ 一张白卡舞台，
  // 与 LoRA 台同一副外壳。
  return (
    <main className="workbench-ground h-page flex-col text-foreground">
      <div className="flex h-9 shrink-0 items-center gap-3.5">
        <h1 className="text-sm font-semibold text-muted-foreground">
          {t('pageTitle')}
        </h1>
        <PromptLibraryTabs currentTab={currentTab} />
        <span className="flex-1" />
        {clerkId && currentTab === 'mine' && (
          <PromptTemplateCreatePanel
            initialOpen={query?.create === '1'}
            initialValues={{
              name: query?.name,
              compiledPrompt: query?.prompt,
              negativePrompt: query?.negativePrompt,
              modelId: query?.model,
              provider: query?.provider,
              outputType: query?.outputType,
              parentGenerationId: query?.generationId,
            }}
          />
        )}
      </div>

      <section aria-label={t('title')} className="workbench-card">
        {currentTab === 'inspiration' ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <InspirationGrid />
          </div>
        ) : (
          <MineTab clerkId={clerkId} locale={locale} t={t} />
        )}
      </section>
    </main>
  )
}

type MineTabProps = {
  clerkId: string | null
  locale: AppLocale
  t: Awaited<ReturnType<typeof getTranslations>>
}

async function MineTab({ clerkId, locale, t }: MineTabProps) {
  if (!clerkId) {
    return (
      <div className="grid flex-1 place-items-center p-5 text-center">
        <div className="mx-auto max-w-xl space-y-4">
          <h2 className="text-2xl font-medium tracking-tight">
            {t('emptyTitle')}
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
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
      {recipes.length === 0 ? (
        <section className="grid flex-1 place-items-center p-5">
          <div className="mx-auto max-w-xl space-y-4 text-center">
            <FileText className="mx-auto size-10 text-primary/75" />
            <h2 className="text-2xl font-medium">{t('emptyTitle')}</h2>
            <p className="text-sm leading-7 text-muted-foreground">
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
            visibility: recipe.visibility,
            createdAt: recipe.createdAt.toISOString(),
            coverThumbnailUrl: recipe.coverThumbnailUrl,
            templateKind: recipe.templateKind,
            tagSource: recipe.tagSource,
            lora: recipe.lora,
            lastUsedAt: recipe.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      )}
    </>
  )
}
