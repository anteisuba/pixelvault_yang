'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react'

import { MODEL_KEY_LABELS, MODEL_KEY_HINT } from '@/constants/api-keys'
import { AI_MODELS, getAvailableModels } from '@/constants/models'
import type { UserApiKeyRecord } from '@/types'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Add Key Form ─────────────────────────────────────────────────

interface AddKeyFormProps {
  onAdd: (modelId: AI_MODELS, label: string, keyValue: string) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

function AddKeyForm({ onAdd, onCancel, isSubmitting }: AddKeyFormProps) {
  const availableModels = getAvailableModels()
  const [modelId, setModelId] = useState<AI_MODELS>(availableModels[0]?.id ?? AI_MODELS.SDXL)
  const [label, setLabel] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim() || !keyValue.trim()) return
    await onAdd(modelId, label.trim(), keyValue.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border bg-secondary/20 p-4">
      <p className="text-sm font-semibold text-foreground">Add New API Key</p>

      <Select value={modelId} onValueChange={(v) => setModelId(v as AI_MODELS)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {MODEL_KEY_LABELS[m.id]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        placeholder="Label (e.g. My personal key)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={50}
        className="h-9 text-sm"
        required
      />

      <div className="relative">
        <Input
          type={showKey ? 'text' : 'password'}
          placeholder={MODEL_KEY_HINT[modelId]}
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          className="h-9 pr-10 font-mono text-sm"
          required
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !label.trim() || !keyValue.trim()}
        >
          {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ─── Key Row ──────────────────────────────────────────────────────

interface KeyRowProps {
  record: UserApiKeyRecord
  onSelect: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function KeyRow({ record, onSelect, onDelete }: KeyRowProps) {
  const [isPending, setIsPending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleSelect = async () => {
    if (record.isActive) return
    setIsPending(true)
    await onSelect(record.id)
    setIsPending(false)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    await onDelete(record.id)
    setIsDeleting(false)
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
        record.isActive ? 'border-primary/40 bg-primary/5' : 'bg-card'
      }`}
    >
      {/* Radio select button */}
      <button
        type="button"
        onClick={handleSelect}
        disabled={isPending || record.isActive}
        className="shrink-0 transition-colors disabled:cursor-default"
        title={record.isActive ? 'Currently in use' : 'Use this key'}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : record.isActive ? (
          <CheckCircle2 className="size-4 text-primary" />
        ) : (
          <Circle className="size-4 text-muted-foreground hover:text-foreground" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{record.label}</p>
        <p className="font-mono text-xs text-muted-foreground">{record.maskedKey}</p>
      </div>

      {record.isActive && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          In use
        </span>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            disabled={isDeleting}
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            title="Delete"
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
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{record.label}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────

export function ApiKeyManager() {
  const { keys, isLoading, error, create, update, remove } = useApiKeysContext()
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAdd = async (modelId: AI_MODELS, label: string, keyValue: string) => {
    setIsSubmitting(true)
    const ok = await create({ provider: modelId, label, keyValue })
    setIsSubmitting(false)
    if (ok) setShowAddForm(false)
  }

  const handleSelect = async (id: string) => {
    await update(id, { isActive: true })
  }

  const handleDelete = async (id: string) => {
    await remove(id)
  }

  const availableModels = getAvailableModels()
  const keysByModel = availableModels.map((model) => ({
    modelId: model.id,
    label: MODEL_KEY_LABELS[model.id],
    keys: keys.filter((k) => k.provider === model.id),
  }))

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">API Keys</h2>
        <p className="text-sm text-muted-foreground">
          Select which key to use per provider. The key marked <strong>In use</strong> will be used during generation.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-5">
          {keysByModel.map(({ modelId, label, keys: modelKeys }) => (
            <div key={modelId} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              {modelKeys.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                  No keys added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {modelKeys.map((k) => (
                    <KeyRow
                      key={k.id}
                      record={k}
                      onSelect={handleSelect}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <AddKeyForm
          onAdd={handleAdd}
          onCancel={() => setShowAddForm(false)}
          isSubmitting={isSubmitting}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="size-4" />
          Add API Key
        </Button>
      )}
    </div>
  )
}
