'use client'

import TextareaAutosize from 'react-textarea-autosize'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { focusUnlessTouch } from '@/lib/touch'
import React, { createContext, useContext, useRef, useState } from 'react'

type PromptInputContextType = {
  isLoading: boolean
  value: string
  setValue: (value: string) => void
  maxHeight: number | string
  onSubmit?: () => void
  disabled?: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

const PromptInputContext = createContext<PromptInputContextType>({
  isLoading: false,
  value: '',
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
  textareaRef: React.createRef<HTMLTextAreaElement>(),
})

function usePromptInput() {
  return useContext(PromptInputContext)
}

export type PromptInputProps = {
  isLoading?: boolean
  value?: string
  onValueChange?: (value: string) => void
  maxHeight?: number | string
  onSubmit?: () => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
} & React.ComponentProps<'div'>

function PromptInput({
  className,
  isLoading = false,
  maxHeight = 240,
  value,
  onValueChange,
  onSubmit,
  children,
  disabled = false,
  onClick,
  ...props
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState(value || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = (newValue: string) => {
    setInternalValue(newValue)
    onValueChange?.(newValue)
  }

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    // Expand the tap target to the whole composer padding on desktop. On touch
    // this is skipped: a bubbled click from a toolbar chip / model picker / any
    // child control must NOT focus the textarea (that pops the keyboard). The
    // user can still tap the textarea directly — native focus handles that.
    if (!disabled) focusUnlessTouch(textareaRef.current)
    onClick?.(e)
  }

  const { style: incomingStyle, ...restProps } = props
  const resolvedMaxHeight =
    typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight

  return (
    <TooltipProvider>
      <PromptInputContext.Provider
        value={{
          isLoading,
          value: value ?? internalValue,
          setValue: onValueChange ?? handleChange,
          maxHeight,
          onSubmit,
          disabled,
          textareaRef,
        }}
      >
        <div
          onClick={handleClick}
          style={
            {
              '--prompt-max-h': resolvedMaxHeight,
              ...incomingStyle,
            } as React.CSSProperties
          }
          className={cn(
            'border-input bg-background cursor-text rounded-3xl border p-2 shadow-xs',
            disabled && 'cursor-not-allowed opacity-60',
            className,
          )}
          {...restProps}
        >
          {children}
        </div>
      </PromptInputContext.Provider>
    </TooltipProvider>
  )
}

export type PromptInputTextareaProps = Omit<
  React.ComponentProps<typeof TextareaAutosize>,
  'ref' | 'value' | 'onChange'
>

function PromptInputTextarea({
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onFocus,
  ...props
}: PromptInputTextareaProps) {
  const { value, setValue, onSubmit, disabled, textareaRef } = usePromptInput()
  const [isComposing, setIsComposing] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return

    if (e.key === 'Enter') {
      // IME guard: don't submit while composing CJK characters. Both the
      // tracked state and the native flag are checked because some browsers
      // (Safari) emit keydown without isComposing during the final commit.
      if (isComposing || e.nativeEvent.isComposing) return
      if (e.shiftKey) return
      e.preventDefault()
      onSubmit?.()
    }
  }

  const handleCompositionStart = (
    e: React.CompositionEvent<HTMLTextAreaElement>,
  ) => {
    setIsComposing(true)
    onCompositionStart?.(e)
  }

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLTextAreaElement>,
  ) => {
    setIsComposing(false)
    onCompositionEnd?.(e)
  }

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    onFocus?.(e)
    // On mobile, scroll the input into view when virtual keyboard appears.
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }

  return (
    <TextareaAutosize
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onFocus={handleFocus}
      disabled={disabled}
      minRows={1}
      className={cn(
        'text-primary placeholder:text-muted-foreground flex min-h-[44px] w-full resize-none border-none bg-transparent px-3 py-2 text-base shadow-none outline-none transition-[color,box-shadow] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        '[max-height:var(--prompt-max-h)]',
        className,
      )}
      {...props}
    />
  )
}

export type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>

function PromptInputActions({
  children,
  className,
  ...props
}: PromptInputActionsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {children}
    </div>
  )
}

export type PromptInputActionProps = {
  className?: string
  tooltip: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
} & React.ComponentProps<typeof Tooltip>

function PromptInputAction({
  tooltip,
  children,
  className,
  side = 'top',
  ...props
}: PromptInputActionProps) {
  const { disabled } = usePromptInput()

  return (
    <Tooltip {...props}>
      <TooltipTrigger
        asChild
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
}
