'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowUp } from '@/components/icons'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export interface ImageEditComposerControls {
  input: ReactNode
  onSubmit: () => void
  canSubmit: boolean
  submitLabel: string
}

export function ImageEditComposer({
  controls,
  tasks,
  settings,
  isRunning,
}: {
  controls: ImageEditComposerControls
  tasks: ReactNode
  settings: ReactNode
  isRunning: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const { onSubmit, canSubmit } = controls
  useEffect(() => {
    const submit = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.defaultPrevented ||
        event.key !== 'Enter' ||
        !(event.metaKey || event.ctrlKey)
      )
        return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        !formRef.current?.contains(target) &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      )
        return
      event.preventDefault()
      if (canSubmit && !isRunning) onSubmit()
    }
    window.addEventListener('keydown', submit)
    return () => window.removeEventListener('keydown', submit)
  }, [canSubmit, isRunning, onSubmit])

  // 与生成台输入条同一副骨架（owner 2026-10-03「任务收成一颗 chip」）：指令在上，
  // 一行 任务 ▾ · 模型 ▾ · 设置 · 价格 ……… 生成。
  return (
    <form
      ref={formRef}
      id="studio-prompt"
      data-testid="image-edit-composer"
      className="flex min-w-0 flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit && !isRunning) onSubmit()
      }}
    >
      {controls.input}
      <div className="flex min-w-0 items-center gap-2">
        <div className="studio-mobile-chip-row flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {tasks}
          {settings}
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!canSubmit || isRunning}
          aria-label={controls.submitLabel}
          aria-busy={isRunning}
          title={controls.submitLabel}
          className="touch-target-y size-9 shrink-0 rounded-full"
        >
          {isRunning ? <Spinner size="sm" /> : <ArrowUp className="size-4" />}
        </Button>
      </div>
    </form>
  )
}
