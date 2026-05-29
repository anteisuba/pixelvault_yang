'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface ProjectNameDialogProps {
  open: boolean
  title: string
  placeholder: string
  submitLabel: string
  cancelLabel: string
  defaultValue: string
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}

/**
 * Controlled text-entry dialog for naming Node Studio projects (create +
 * rename). Replaces the native window.prompt() flow, which throws
 * NotAllowedError in sandboxed iframes that lack the allow-modals token.
 */
export function ProjectNameDialog({
  open,
  title,
  placeholder,
  submitLabel,
  cancelLabel,
  defaultValue,
  onOpenChange,
  onSubmit,
}: ProjectNameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Mounts fresh each time the dialog opens, so the input re-seeds from
            defaultValue (next "Untitled project N" / current name) without an
            effect. */}
        <ProjectNameForm
          placeholder={placeholder}
          submitLabel={submitLabel}
          cancelLabel={cancelLabel}
          defaultValue={defaultValue}
          onCancel={() => onOpenChange(false)}
          onSubmit={(name) => {
            onSubmit(name)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

interface ProjectNameFormProps {
  placeholder: string
  submitLabel: string
  cancelLabel: string
  defaultValue: string
  onCancel: () => void
  onSubmit: (name: string) => void
}

function ProjectNameForm({
  placeholder,
  submitLabel,
  cancelLabel,
  defaultValue,
  onCancel,
  onSubmit,
}: ProjectNameFormProps) {
  const [value, setValue] = useState(defaultValue)

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }
    onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        maxLength={64}
        required
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
