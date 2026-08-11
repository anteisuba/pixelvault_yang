'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { isTouchPrimary } from '@/lib/touch'
import { createProjectAPI } from '@/lib/api-client'
import type { ProjectRecord } from '@/types'

interface ProjectCreateDialogProps {
  /**
   * Custom trigger element (rendered as the DialogTrigger child).
   * 受控用法（传 `open`）下可以省略 —— 门牌行/总览页的「新建文件夹」卡是自己
   * 布局里的一格，塞不进 `DialogTrigger`，改由调用方直接开。
   */
  trigger?: React.ReactNode
  /** 受控开关；不传就走内部状态（trigger 用法）。 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Optional parent folder for nested asset folders. */
  parentId?: string | null
  /** Optional callback fired with the created project after a successful create. */
  onCreated?: (project: ProjectRecord) => void
}

/**
 * ProjectCreateDialog — minimal create-project flow used wherever the user
 * starts a new project (asset browser chip filter, Studio sidebar future, etc).
 *
 * Calls createProjectAPI directly instead of useProjects so any caller's
 * own useProjects instance can react to onCreated and refresh — sharing
 * a single useProjects hook between callers wouldn't work because each
 * call to useProjects gets its own independent state.
 */
export function ProjectCreateDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  parentId = null,
  onCreated,
}: ProjectCreateDialogProps) {
  const t = useTranslations('LibraryPage')
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !isCreating

  const reset = () => {
    setName('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setIsCreating(true)
    const response = await createProjectAPI({
      name: trimmedName,
      parentId,
    })
    setIsCreating(false)
    if (response.success && response.data) {
      toast.success(t('projectCreated'))
      setOpen(false)
      reset()
      onCreated?.(response.data)
    } else {
      toast.error(response.error ?? t('projectCreateFailed'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projectCreateTitle')}</DialogTitle>
          <DialogDescription>{t('projectCreateDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoFocus={!isTouchPrimary()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projectNamePlaceholder')}
            maxLength={64}
            disabled={isCreating}
            required
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isCreating}
            >
              {t('cancelSelect')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isCreating ? (
                <>
                  <Spinner size="md" />
                  {t('projectCreating')}
                </>
              ) : (
                t('projectCreateSubmit')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
