'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getProviderLabel } from '@/constants/providers'
import type {
  ApiKeyHealthStatus,
  UpdateApiKeyRequest,
  UserApiKeyRecord,
} from '@/types'

import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

interface ApiKeyRowProps {
  record: UserApiKeyRecord
  healthStatus: ApiKeyHealthStatus | undefined
  onToggle: (id: string, data: UpdateApiKeyRequest) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onVerify: (id: string) => Promise<void>
}

export function ApiKeyRow({
  record,
  healthStatus,
  onToggle,
  onDelete,
  onVerify,
}: ApiKeyRowProps) {
  const t = useTranslations('StudioApiKeys')
  const [isPending, setIsPending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const handleSaveKey = async () => {
    if (!editValue.trim() || editValue.trim().length < 10) return
    setIsPending(true)
    await onToggle(record.id, { keyValue: editValue.trim() })
    setIsPending(false)
    setIsEditing(false)
    setEditValue('')
  }

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

  const handleVerify = async () => {
    setIsVerifying(true)
    await onVerify(record.id)
    setIsVerifying(false)
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors',
        record.isActive
          ? 'border-primary/25 bg-primary/6'
          : 'border-border/70 bg-background/76',
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
          <ApiKeyHealthDot status={healthStatus} />
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={t('editKeyPlaceholder')}
              className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-xs focus:border-primary/40 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveKey()
                if (e.key === 'Escape') {
                  setIsEditing(false)
                  setEditValue('')
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handleSaveKey()}
              disabled={isPending || editValue.trim().length < 10}
              className="text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false)
                setEditValue('')
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            {record.maskedKey}
          </p>
        )}
        <p className="truncate font-mono text-xs text-muted-foreground">
          {record.providerConfig.baseUrl}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title={t('actions.editKey')}
        >
          <Pencil className="size-4" />
        </button>

        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title={t('actions.verifyKey')}
        >
          {isVerifying ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
        </button>

        <ConfirmDialog
          trigger={
            <button
              type="button"
              disabled={isDeleting}
              className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              title={t('actions.deleteKey')}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </button>
          }
          title={t('deleteDialog.title')}
          description={t('deleteDialog.description', { label: record.label })}
          cancelLabel={t('deleteDialog.cancelAction')}
          confirmLabel={t('deleteDialog.confirmAction')}
          onConfirm={handleDelete}
        />
      </div>
    </div>
  )
}
