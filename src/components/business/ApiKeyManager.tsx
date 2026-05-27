'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getAvailableModels, isBuiltInModel } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
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
  providerLabel: string
  isCustom: boolean
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
  const availableModels = getAvailableModels()
  const activeRouteCount = keys.filter((key) => key.isActive).length

  const allBuiltInGroups: ProviderRouteGroup[] = availableModels.map(
    (model) => ({
      groupId: model.id,
      modelId: model.id,
      providerLabel: getProviderLabel(model.providerConfig),
      isCustom: false,
      keys: sortRouteRecords(keys.filter((key) => key.modelId === model.id)),
    }),
  )

  const savedBuiltInGroups = allBuiltInGroups.filter(
    (group) => group.keys.length > 0,
  )
  const displayedBuiltInGroups = showAllBuiltIn
    ? allBuiltInGroups
    : savedBuiltInGroups

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
  ).map(([groupId, groupKeys]) => {
    const firstKey = groupKeys[0]

    return {
      groupId,
      modelId: firstKey?.modelId ?? '',
      providerLabel: firstKey ? getProviderLabel(firstKey.providerConfig) : '',
      isCustom: true,
      keys: sortRouteRecords(groupKeys),
    }
  })

  const displayedRouteGroups = [...displayedBuiltInGroups, ...allCustomGroups]

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
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-base font-medium text-foreground">
              {t('title')}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {t('summary.activeRoutesValue', { count: activeRouteCount })}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {t('summary.routeCount', { count: keys.length })}
              </Badge>
            </div>
          </div>

          <Button
            type="button"
            variant={showAddForm ? 'outline' : 'default'}
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
        <div>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-sm font-medium text-foreground">
                  {t('sections.builtInTitle')}
                </h3>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t('summary.routeCount', { count: keys.length })}
                </Badge>
              </div>
            </div>

            {displayedRouteGroups.length > 0 ? (
              <div className="space-y-3">
                {displayedRouteGroups.map((group) => (
                  <article
                    key={group.groupId}
                    className="rounded-2xl border border-border/70 bg-card/84 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-display text-sm font-medium text-foreground">
                          {group.isCustom
                            ? group.modelId
                            : getTranslatedModelLabel(tModels, group.modelId)}
                        </h4>
                        <Badge
                          variant="outline"
                          className="rounded-full px-3 py-1"
                        >
                          {group.providerLabel}
                        </Badge>
                        {group.isCustom ? (
                          <Badge
                            variant="secondary"
                            className="rounded-full px-3 py-1"
                          >
                            <Sparkles className="size-3" />
                            {t('customBadge')}
                          </Badge>
                        ) : null}
                        <Badge
                          variant="secondary"
                          className="rounded-full px-3 py-1"
                        >
                          {t('summary.routeCount', {
                            count: group.keys.length,
                          })}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
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
                        <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
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

            {allBuiltInGroups.length > savedBuiltInGroups.length ? (
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
        </div>
      )}
    </div>
  )
}
