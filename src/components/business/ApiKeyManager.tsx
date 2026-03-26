'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  getAvailableModels,
  getModelMessageKey,
  isBuiltInModel,
} from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
  getProviderLabel,
} from '@/constants/providers'
import type {
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  UserApiKeyRecord,
} from '@/types'

import { ApiKeyForm } from '@/components/business/ApiKeyForm'
import { ApiKeyRow } from '@/components/business/ApiKeyRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { getTranslatedModelLabel } from '@/lib/model-options'

interface ProviderRouteGroup {
  groupId: string
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  keys: UserApiKeyRecord[]
}

function sortRouteRecords(records: UserApiKeyRecord[]): UserApiKeyRecord[] {
  return [...records].sort((left, right) => {
    if (left.isActive === right.isActive) {
      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      )
    }

    return left.isActive ? -1 : 1
  })
}

export function ApiKeyManager() {
  const { keys, isLoading, error, healthMap, create, update, remove, verify } =
    useApiKeysContext()
  const t = useTranslations('StudioApiKeys')
  const tModels = useTranslations('Models')
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAllBuiltIn, setShowAllBuiltIn] = useState(false)
  const [showAllCustom, setShowAllCustom] = useState(false)
  const availableModels = getAvailableModels()
  const activeRouteCount = keys.filter((key) => key.isActive).length
  const customRouteCount = keys.filter(
    (key) => !isBuiltInModel(key.modelId),
  ).length

  // Group built-in models
  const allBuiltInGroups = availableModels.map((model) => ({
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: model.providerConfig,
    keys: sortRouteRecords(keys.filter((key) => key.modelId === model.id)),
  }))

  // Only show models with active routes unless expanded
  const activeBuiltInGroups = allBuiltInGroups.filter((group) =>
    group.keys.some((k) => k.isActive),
  )
  const displayedBuiltInGroups = showAllBuiltIn
    ? allBuiltInGroups
    : activeBuiltInGroups

  // Group custom routes
  const customGroupMap = new Map<string, UserApiKeyRecord[]>()
  keys
    .filter((key) => !isBuiltInModel(key.modelId))
    .forEach((key) => {
      const groupId = `${key.adapterType}::${key.modelId}`
      const existingGroup = customGroupMap.get(groupId) ?? []
      customGroupMap.set(groupId, [...existingGroup, key])
    })

  const allCustomGroups: ProviderRouteGroup[] = Array.from(
    customGroupMap.entries(),
  ).map(([groupId, groupKeys]) => ({
    groupId,
    modelId: groupKeys[0]?.modelId ?? '',
    adapterType: groupKeys[0]?.adapterType ?? AI_ADAPTER_TYPES.HUGGINGFACE,
    keys: sortRouteRecords(groupKeys),
  }))

  const activeCustomGroups = allCustomGroups.filter((group) =>
    group.keys.some((k) => k.isActive),
  )
  const displayedCustomGroups = showAllCustom
    ? allCustomGroups
    : activeCustomGroups

  const handleAdd = async (data: CreateApiKeyRequest) => {
    setIsSubmitting(true)
    const isSuccessful = await create(data)
    setIsSubmitting(false)

    if (isSuccessful) {
      setShowAddForm(false)
    }
  }

  const handleUpdate = async (id: string, data: UpdateApiKeyRequest) => {
    await update(id, data)
  }

  const handleDelete = async (id: string) => {
    await remove(id)
  }

  const handleVerify = async (id: string) => {
    await verify(id)
  }

  return (
    <div className="space-y-6">
      {/* Header + Summary */}
      <div className="rounded-3xl border border-border/70 bg-secondary/18 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="font-display text-base font-medium text-foreground">
              {t('title')}
            </h2>
            <p className="max-w-xl font-serif text-sm leading-6 text-muted-foreground">
              {t('description')}
            </p>
          </div>

          <Button
            type="button"
            variant={showAddForm ? 'ghost' : 'default'}
            onClick={() => setShowAddForm((value) => !value)}
            className="rounded-full px-5"
          >
            {showAddForm ? (
              t('actions.hideComposer')
            ) : (
              <>
                <Plus className="size-4" />
                {t('actions.openComposer')}
              </>
            )}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-border/70 bg-background/76 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('summary.activeRoutesLabel')}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t('summary.activeRoutesValue', { count: activeRouteCount })}
            </p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-background/76 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('summary.builtInModelsLabel')}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t('summary.builtInModelsValue', {
                count: allBuiltInGroups.length,
              })}
            </p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-background/76 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('summary.customRoutesLabel')}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t('summary.customRoutesValue', { count: customRouteCount })}
            </p>
          </article>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm ? (
        <ApiKeyForm
          onAdd={handleAdd}
          onCancel={() => setShowAddForm(false)}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-3xl border border-border/70 bg-card/84 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('loading')}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Built-in Model Routes */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-display text-sm font-medium text-foreground">
                  {t('sections.builtInTitle')}
                </h3>
                <p className="font-serif text-sm leading-6 text-muted-foreground">
                  {t('sections.builtInDescription')}
                </p>
              </div>
            </div>

            {displayedBuiltInGroups.length > 0 ? (
              <div className="space-y-4">
                {displayedBuiltInGroups.map((group) => (
                  <article
                    key={group.modelId}
                    className="rounded-3xl border border-border/70 bg-card/84 p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-display text-sm font-medium text-foreground">
                            {getTranslatedModelLabel(tModels, group.modelId)}
                          </h4>
                          <Badge
                            variant="outline"
                            className="rounded-full px-3 py-1"
                          >
                            {getProviderLabel(group.providerConfig)}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="rounded-full px-3 py-1"
                          >
                            {t('summary.routeCount', {
                              count: group.keys.length,
                            })}
                          </Badge>
                        </div>
                        <p className="font-serif text-sm leading-6 text-muted-foreground">
                          {tModels(
                            `${getModelMessageKey(group.modelId)}.description`,
                          )}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {group.providerConfig.baseUrl}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {group.keys.length ? (
                        group.keys.map((record) => (
                          <ApiKeyRow
                            key={record.id}
                            record={record}
                            healthStatus={healthMap[record.id]}
                            onToggle={handleUpdate}
                            onDelete={handleDelete}
                            onVerify={handleVerify}
                          />
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                          {t('emptyModel', {
                            model: getTranslatedModelLabel(
                              tModels,
                              group.modelId,
                            ),
                          })}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : !showAllBuiltIn ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                {t('emptyModel', { model: t('sections.builtInTitle') })}
              </div>
            ) : null}

            {allBuiltInGroups.length > activeBuiltInGroups.length ? (
              <button
                type="button"
                onClick={() => setShowAllBuiltIn((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                {showAllBuiltIn ? (
                  <>
                    <ChevronDown className="size-4" />
                    {t('collapse.hideAll')}
                  </>
                ) : (
                  <>
                    <ChevronRight className="size-4" />
                    {t('collapse.showAll', {
                      count: allBuiltInGroups.length,
                    })}
                  </>
                )}
              </button>
            ) : null}
          </section>

          {/* Custom Model Routes */}
          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-sm font-medium text-foreground">
                {t('sections.customTitle')}
              </h3>
              <p className="font-serif text-sm leading-6 text-muted-foreground">
                {t('sections.customDescription')}
              </p>
            </div>

            {displayedCustomGroups.length > 0 ? (
              <div className="space-y-4">
                {displayedCustomGroups.map((group) => {
                  const adapterLabel = getProviderLabel(
                    getDefaultProviderConfig(group.adapterType),
                  )

                  return (
                    <article
                      key={group.groupId}
                      className="rounded-3xl border border-border/70 bg-card/84 p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-display text-sm font-medium text-foreground">
                              {group.modelId}
                            </h4>
                            <Badge
                              variant="outline"
                              className="rounded-full px-3 py-1"
                            >
                              {adapterLabel}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="rounded-full px-3 py-1"
                            >
                              <Sparkles className="size-3" />
                              {t('customBadge')}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="rounded-full px-3 py-1"
                            >
                              {t('summary.routeCount', {
                                count: group.keys.length,
                              })}
                            </Badge>
                          </div>
                          <p className="text-sm leading-6 text-muted-foreground">
                            {t('groupCustomDescription', {
                              adapter: adapterLabel,
                            })}
                          </p>
                        </div>

                        <div className="rounded-full border border-border/70 bg-background/70 px-3 py-2 font-mono text-xs text-foreground">
                          {group.modelId}
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {group.keys.map((record) => (
                          <ApiKeyRow
                            key={record.id}
                            record={record}
                            healthStatus={healthMap[record.id]}
                            onToggle={handleUpdate}
                            onDelete={handleDelete}
                            onVerify={handleVerify}
                          />
                        ))}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : !showAllCustom ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-card/70 px-4 py-6 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-secondary p-2 text-foreground">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      {t('emptyCustomTitle')}
                    </p>
                    <p>{t('emptyCustomDescription')}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {allCustomGroups.length > activeCustomGroups.length ? (
              <button
                type="button"
                onClick={() => setShowAllCustom((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                {showAllCustom ? (
                  <>
                    <ChevronDown className="size-4" />
                    {t('collapse.hideAll')}
                  </>
                ) : (
                  <>
                    <ChevronRight className="size-4" />
                    {t('collapse.showAll', {
                      count: allCustomGroups.length,
                    })}
                  </>
                )}
              </button>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
