'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { createProjectAPI } from '@/lib/api-client'
import type { ProjectRecord } from '@/types'

interface ProjectCreateDialogProps {
  /** Custom trigger element (rendered as the DialogTrigger child). */
  trigger: React.ReactNode
  /** Optional callback fired with the created project after a successful create. */
  onCreated?: (project: ProjectRecord) => void
}

/**
 * ProjectCreateDialog — minimal create-project flow used wherever the user
 * starts a new project (Profile chip filter, Studio sidebar future, etc).
 *
 * Calls createProjectAPI directly instead of useProjects so any caller's
 * own useProjects instance can react to onCreated and refresh — sharing
 * a single useProjects hook between callers wouldn't work because each
 * call to useProjects gets its own independent state.
 */
export function ProjectCreateDialog({
  trigger,
  onCreated,
}: ProjectCreateDialogProps) {
  const t = useTranslations('LibraryPage')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !isCreating

  const reset = () => {
    setName('')
    setDescription('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setIsCreating(true)
    const trimmedDescription = description.trim()
    const response = await createProjectAPI({
      name: trimmedName,
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projectCreateTitle')}</DialogTitle>
          <DialogDescription>{t('projectCreateDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projectNamePlaceholder')}
              maxLength={64}
              disabled={isCreating}
              required
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('projectDescriptionPlaceholder')}
              maxLength={500}
              rows={3}
              disabled={isCreating}
              className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

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
                  <Loader2 className="size-4 animate-spin" />
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
