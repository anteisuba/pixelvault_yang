'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getAvailableModels } from '@/constants/models'
import {
  getDefaultProviderConfig,
  getProviderLabel,
  isAiAdapterType,
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
import { Spinner } from '@/components/ui/spinner'
import { useApiKeysContext } from '@/contexts/api-keys-context'

interface ProviderRouteGroup {
  adapterType: string
  providerLabel: string
  coverageCount: number
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

function labelOf(adapterType: string, sample?: UserApiKeyRecord): string {
  if (sample) return getProviderLabel(sample.providerConfig)
  if (isAiAdapterType(adapterType)) {
    return getProviderLabel(getDefaultProviderConfig(adapterType))
  }
  return adapterType
}

export function ApiKeyManager() {
  const { keys, isLoading, error, healthMap, create, update, remove, verify } =
    useApiKeysContext()
  const t = useTranslations('StudioApiKeys')
  const tCommon = useTranslations('Common')
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAllProviders, setShowAllProviders] = useState(false)
  const availableModels = getAvailableModels()
  const activeRouteCount = keys.filter((key) => key.isActive).length

  // How many built-in models each provider (company) can power — drives the
  // "covers N models" badge and the discovery list of providers without a key.
  const coverageByAdapter = new Map<string, number>()
  for (const model of availableModels) {
    coverageByAdapter.set(
      model.adapterType,
      (coverageByAdapter.get(model.adapterType) ?? 0) + 1,
    )
  }

  // Group every saved key by its provider (company) — one card per company,
  // mirroring step 1 of the model picker. A BYOK key for a company is what
  // unlocks all of that company's models.
  const keysByAdapter = new Map<string, UserApiKeyRecord[]>()
  for (const key of keys) {
    keysByAdapter.set(key.adapterType, [
      ...(keysByAdapter.get(key.adapterType) ?? []),
      key,
    ])
  }

  const configuredGroups: ProviderRouteGroup[] = Array.from(
    keysByAdapter.entries(),
  )
    .map(([adapterType, groupKeys]) => ({
      adapterType,
      providerLabel: labelOf(adapterType, groupKeys[0]),
      coverageCount: coverageByAdapter.get(adapterType) ?? 0,
      keys: sortRouteRecords(groupKeys),
    }))
    .sort(
      (left, right) =>
        right.keys.length - left.keys.length ||
        left.providerLabel.localeCompare(right.providerLabel),
    )

  // Providers that can power models but have no key yet — revealed under
  // "show all" so the user can add one without leaving the panel.
  const unconfiguredGroups: ProviderRouteGroup[] = Array.from(
    coverageByAdapter.keys(),
  )
    .filter((adapterType) => !keysByAdapter.has(adapterType))
    .map((adapterType) => ({
      adapterType,
      providerLabel: labelOf(adapterType),
      coverageCount: coverageByAdapter.get(adapterType) ?? 0,
      keys: [],
    }))
    .sort((left, right) =>
      left.providerLabel.localeCompare(right.providerLabel),
    )

  const displayedGroups = showAllProviders
    ? [...configuredGroups, ...unconfiguredGroups]
    : configuredGroups

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
          <Spinner size="md" />
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

            {displayedGroups.length > 0 ? (
              <div className="space-y-3">
                {displayedGroups.map((group) => (
                  <article
                    key={group.adapterType}
                    className="rounded-2xl border border-border/70 bg-card/84 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-display text-sm font-medium text-foreground">
                          {group.providerLabel}
                        </h4>
                        {group.coverageCount > 0 ? (
                          <Badge
                            variant="secondary"
                            className="rounded-full px-3 py-1"
                          >
                            {tCommon('modelCount', {
                              count: group.coverageCount,
                            })}
                          </Badge>
                        ) : null}
                        {group.keys.length > 0 ? (
                          <Badge
                            variant="secondary"
                            className="rounded-full px-3 py-1"
                          >
                            {t('summary.routeCount', {
                              count: group.keys.length,
                            })}
                          </Badge>
                        ) : null}
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
                          {t('emptyModel', { model: group.providerLabel })}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : !showAllProviders ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                {t('emptyModel', { model: t('sections.builtInTitle') })}
              </div>
            ) : null}

            {unconfiguredGroups.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllProviders((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                {showAllProviders ? (
                  <>
                    <ChevronDown className="size-4" />
                    {t('collapse.hideAll')}
                  </>
                ) : (
                  <>
                    <ChevronRight className="size-4" />
                    {t('collapse.showAll', {
                      count: unconfiguredGroups.length,
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
