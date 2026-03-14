'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { API_KEY_ADAPTER_OPTIONS } from '@/constants/api-keys'
import {
  AI_MODELS,
  getAvailableModels,
  getModelMessageKey,
  isBuiltInModel,
} from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getAdapterCustomModelExample,
  getAdapterKeyHint,
  getDefaultProviderConfig,
  getProviderLabel,
} from '@/constants/providers'
import type {
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  UserApiKeyRecord,
} from '@/types'
import { useApiKeysContext } from '@/contexts/api-keys-context'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type EntryMode = 'preset' | 'custom'
type MessageGetter = (
  key: string,
  values?: Record<string, string | number>,
) => string

interface ProviderRouteGroup {
  groupId: string
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  keys: UserApiKeyRecord[]
}

function getModelDisplayLabel(tModels: MessageGetter, modelId: string): string {
  if (isBuiltInModel(modelId)) {
    return tModels(`${getModelMessageKey(modelId)}.label`)
  }

  return modelId
}

interface AddKeyFormProps {
  onAdd: (data: CreateApiKeyRequest) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

function AddKeyForm({ onAdd, onCancel, isSubmitting }: AddKeyFormProps) {
  const t = useTranslations('StudioApiKeys')
  const tModels = useTranslations('Models')
  const availableModels = getAvailableModels()
  const [adapterType, setAdapterType] = useState<AI_ADAPTER_TYPES>(
    AI_ADAPTER_TYPES.HUGGINGFACE,
  )
  const [entryMode, setEntryMode] = useState<EntryMode>('preset')
  const modelsForAdapter = availableModels.filter(
    (model) => model.adapterType === adapterType,
  )
  const firstAdapterModelId = modelsForAdapter[0]?.id ?? AI_MODELS.SDXL
  const defaultProviderConfig = getDefaultProviderConfig(adapterType)
  const [presetModelId, setPresetModelId] =
    useState<AI_MODELS>(firstAdapterModelId)
  const [customModelId, setCustomModelId] = useState('')
  const [providerLabel, setProviderLabel] = useState(
    defaultProviderConfig.label,
  )
  const [providerBaseUrl, setProviderBaseUrl] = useState(
    defaultProviderConfig.baseUrl,
  )
  const [label, setLabel] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)

  const resolvedPresetModelId = modelsForAdapter.some(
    (model) => model.id === presetModelId,
  )
    ? presetModelId
    : firstAdapterModelId

  const resolvedModelId =
    entryMode === 'preset' ? resolvedPresetModelId : customModelId.trim()
  const resolvedProviderLabel =
    providerLabel.trim() || defaultProviderConfig.label
  const resolvedProviderBaseUrl =
    providerBaseUrl.trim() || defaultProviderConfig.baseUrl
  const isSubmitDisabled =
    isSubmitting ||
    !resolvedModelId ||
    !resolvedProviderLabel ||
    !resolvedProviderBaseUrl ||
    !label.trim() ||
    !keyValue.trim()

  const handleAdapterChange = (nextAdapterType: AI_ADAPTER_TYPES) => {
    setAdapterType(nextAdapterType)
    const nextProviderConfig = getDefaultProviderConfig(nextAdapterType)
    const nextModels = availableModels.filter(
      (model) => model.adapterType === nextAdapterType,
    )

    setProviderLabel(nextProviderConfig.label)
    setProviderBaseUrl(nextProviderConfig.baseUrl)
    setPresetModelId(nextModels[0]?.id ?? AI_MODELS.SDXL)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitDisabled) return

    await onAdd({
      adapterType,
      providerConfig: {
        label: resolvedProviderLabel,
        baseUrl: resolvedProviderBaseUrl,
      },
      modelId: resolvedModelId,
      label: label.trim(),
      keyValue: keyValue.trim(),
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">
          {t('addForm.title')}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('addForm.description')}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t('addForm.adapterLabel')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {API_KEY_ADAPTER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleAdapterChange(option)}
              className={cn(
                'rounded-[1.25rem] border px-4 py-3 text-left transition-colors',
                adapterType === option
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/70 bg-background hover:bg-secondary/30',
              )}
            >
              <p className="font-medium text-foreground">
                {t(`providers.${option}.label`)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(`providers.${option}.description`)}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-2">
          <label
            htmlFor="provider-label"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.providerNameLabel')}
          </label>
          <Input
            id="provider-label"
            value={providerLabel}
            onChange={(e) => setProviderLabel(e.target.value)}
            placeholder={defaultProviderConfig.label}
            maxLength={60}
            className="h-11 rounded-2xl border-border/70 bg-background/80"
            required
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="provider-base-url"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.providerBaseUrlLabel')}
          </label>
          <Input
            id="provider-base-url"
            type="url"
            value={providerBaseUrl}
            onChange={(e) => setProviderBaseUrl(e.target.value)}
            placeholder={defaultProviderConfig.baseUrl}
            className="h-11 rounded-2xl border-border/70 bg-background/80 font-mono"
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {t('addForm.providerBaseUrlHint')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t('addForm.modelModeLabel')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['preset', 'custom'] as EntryMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setEntryMode(mode)}
              className={cn(
                'rounded-[1.25rem] border px-4 py-3 text-left transition-colors',
                entryMode === mode
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/70 bg-background hover:bg-secondary/30',
              )}
            >
              <p className="font-medium text-foreground">
                {t(`addForm.modelModes.${mode}.label`)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(`addForm.modelModes.${mode}.description`)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {entryMode === 'preset' ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('addForm.presetModelLabel')}
          </label>
          <Select
            value={resolvedPresetModelId}
            onValueChange={(value) => setPresetModelId(value as AI_MODELS)}
          >
            <SelectTrigger className="h-11 rounded-2xl border-border/70 bg-background/80">
              <SelectValue placeholder={t('addForm.presetModelPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {modelsForAdapter.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {tModels(`${getModelMessageKey(model.id)}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <label
            htmlFor="custom-model-id"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.customModelLabel')}
          </label>
          <Input
            id="custom-model-id"
            value={customModelId}
            onChange={(e) => setCustomModelId(e.target.value)}
            placeholder={getAdapterCustomModelExample(adapterType)}
            className="h-11 rounded-2xl border-border/70 bg-background/80 font-mono"
            required
          />
          <p className="text-xs text-muted-foreground">
            {t('addForm.customModelHint', {
              provider: resolvedProviderLabel,
            })}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="api-key-label"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.labelLabel')}
          </label>
          <Input
            id="api-key-label"
            placeholder={t('addForm.labelPlaceholder')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={50}
            className="h-11 rounded-2xl border-border/70 bg-background/80"
            required
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="api-key-value"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.keyLabel')}
          </label>
          <div className="relative">
            <Input
              id="api-key-value"
              type={showKey ? 'text' : 'password'}
              placeholder={getAdapterKeyHint(adapterType)}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              className="h-11 rounded-2xl border-border/70 bg-background/80 pr-11 font-mono"
              required
            />
            <button
              type="button"
              onClick={() => setShowKey((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showKey ? t('addForm.hideKey') : t('addForm.showKey')}
            >
              {showKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={isSubmitDisabled}
          className="rounded-full px-5"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('addForm.savingAction')}
            </>
          ) : (
            <>
              <Plus className="size-4" />
              {t('addForm.saveAction')}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="rounded-full px-5"
        >
          {t('addForm.cancelAction')}
        </Button>
      </div>
    </form>
  )
}

interface KeyRowProps {
  record: UserApiKeyRecord
  onToggle: (id: string, data: UpdateApiKeyRequest) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function KeyRow({ record, onToggle, onDelete }: KeyRowProps) {
  const t = useTranslations('StudioApiKeys')
  const [isPending, setIsPending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleToggle = async () => {
    setIsPending(true)
    await onToggle(record.id, { isActive: !record.isActive })
    setIsPending(false)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    await onDelete(record.id)
    setIsDeleting(false)
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[1.25rem] border px-4 py-3 transition-colors',
        record.isActive
          ? 'border-primary/30 bg-primary/5'
          : 'border-border/70 bg-background/80',
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
        title={
          record.isActive ? t('actions.disableRoute') : t('actions.enableRoute')
        }
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : record.isActive ? (
          <CheckCircle2 className="size-4 text-primary" />
        ) : (
          <Circle className="size-4" />
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {record.label}
          </p>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {getProviderLabel(record.providerConfig)}
          </Badge>
          <Badge
            variant={record.isActive ? 'secondary' : 'outline'}
            className="rounded-full px-3 py-1"
          >
            {record.isActive ? t('status.enabled') : t('status.disabled')}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {record.maskedKey}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {record.providerConfig.baseUrl}
        </p>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            disabled={isDeleting}
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            title={t('actions.deleteKey')}
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.description', { label: record.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('deleteDialog.cancelAction')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('deleteDialog.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
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
  const { keys, isLoading, error, create, update, remove } = useApiKeysContext()
  const t = useTranslations('StudioApiKeys')
  const tModels = useTranslations('Models')
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const availableModels = getAvailableModels()
  const activeRouteCount = keys.filter((key) => key.isActive).length
  const customRouteCount = keys.filter(
    (key) => !isBuiltInModel(key.modelId),
  ).length

  const builtInGroups = availableModels.map((model) => ({
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: model.providerConfig,
    keys: sortRouteRecords(keys.filter((key) => key.modelId === model.id)),
  }))

  const customGroupMap = new Map<string, UserApiKeyRecord[]>()
  keys
    .filter((key) => !isBuiltInModel(key.modelId))
    .forEach((key) => {
      const groupId = `${key.adapterType}::${key.modelId}`
      const existingGroup = customGroupMap.get(groupId) ?? []
      customGroupMap.set(groupId, [...existingGroup, key])
    })

  const customGroups: ProviderRouteGroup[] = Array.from(
    customGroupMap.entries(),
  ).map(([groupId, groupKeys]) => ({
    groupId,
    modelId: groupKeys[0]?.modelId ?? '',
    adapterType: groupKeys[0]?.adapterType ?? AI_ADAPTER_TYPES.HUGGINGFACE,
    keys: sortRouteRecords(groupKeys),
  }))

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

  return (
    <div className="space-y-6">
      <div className="rounded-[1.5rem] border border-border/70 bg-secondary/25 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {t('title')}
            </h2>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
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
          <article className="rounded-[1.25rem] border border-border/70 bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('summary.activeRoutesLabel')}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t('summary.activeRoutesValue', { count: activeRouteCount })}
            </p>
          </article>
          <article className="rounded-[1.25rem] border border-border/70 bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('summary.builtInModelsLabel')}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t('summary.builtInModelsValue', { count: builtInGroups.length })}
            </p>
          </article>
          <article className="rounded-[1.25rem] border border-border/70 bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('summary.customRoutesLabel')}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t('summary.customRoutesValue', { count: customRouteCount })}
            </p>
          </article>
        </div>
      </div>

      {showAddForm ? (
        <AddKeyForm
          onAdd={handleAdd}
          onCancel={() => setShowAddForm(false)}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {error ? (
        <p className="rounded-[1.25rem] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-[1.5rem] border border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('loading')}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                {t('sections.builtInTitle')}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {t('sections.builtInDescription')}
              </p>
            </div>

            <div className="space-y-4">
              {builtInGroups.map((group) => (
                <article
                  key={group.modelId}
                  className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          {getModelDisplayLabel(tModels, group.modelId)}
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
                      <p className="text-sm leading-6 text-muted-foreground">
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
                        <KeyRow
                          key={record.id}
                          record={record}
                          onToggle={handleUpdate}
                          onDelete={handleDelete}
                        />
                      ))
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                        {t('emptyModel', {
                          model: getModelDisplayLabel(tModels, group.modelId),
                        })}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                {t('sections.customTitle')}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {t('sections.customDescription')}
              </p>
            </div>

            {customGroups.length ? (
              <div className="space-y-4">
                {customGroups.map((group) => {
                  const adapterLabel = getProviderLabel(
                    getDefaultProviderConfig(group.adapterType),
                  )

                  return (
                    <article
                      key={group.groupId}
                      className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground">
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
                          <KeyRow
                            key={record.id}
                            record={record}
                            onToggle={handleUpdate}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
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
            )}
          </section>
        </div>
      )}
    </div>
  )
}
