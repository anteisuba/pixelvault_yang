'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

interface PopoverInteractionGuard {
  markInternalInteraction: () => void
}

const PopoverInteractionGuardContext =
  React.createContext<PopoverInteractionGuard | null>(null)

function getRadixOriginalEventTarget(event: Event): EventTarget | null {
  const detail = (event as { detail?: unknown }).detail

  if (detail && typeof detail === 'object' && 'originalEvent' in detail) {
    const originalEvent = (detail as { originalEvent?: unknown }).originalEvent
    if (originalEvent instanceof Event) {
      return originalEvent.target
    }
  }

  return event.target
}

function eventPathContains(event: Event, node: Node): boolean {
  return event.composedPath().includes(node)
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return

  if (typeof ref === 'function') {
    ref(value)
    return
  }

  ref.current = value
}

function Popover({
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false,
  )
  const ignoreNextCloseRef = React.useRef(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const markInternalInteraction = React.useCallback(() => {
    ignoreNextCloseRef.current = true
    window.setTimeout(() => {
      ignoreNextCloseRef.current = false
    }, 0)
  }, [])
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && ignoreNextCloseRef.current) return
      if (!isControlled) {
        setUncontrolledOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange],
  )
  const guard = React.useMemo(
    () => ({ markInternalInteraction }),
    [markInternalInteraction],
  )

  return (
    <PopoverInteractionGuardContext.Provider value={guard}>
      <PopoverPrimitive.Root
        data-slot="popover"
        {...props}
        open={open}
        onOpenChange={handleOpenChange}
      />
    </PopoverInteractionGuardContext.Provider>
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  ref,
  className,
  align = 'center',
  sideOffset = 4,
  onFocusCapture,
  onPointerDownCapture,
  onFocusOutside,
  onInteractOutside,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const guard = React.useContext(PopoverInteractionGuardContext)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const keepOpenForInternalOutsideEvent = React.useCallback(
    (event: Event) => {
      const target = getRadixOriginalEventTarget(event)
      const content = contentRef.current
      if (!content) {
        return false
      }

      if (
        (!(target instanceof Node) || !content.contains(target)) &&
        !eventPathContains(event, content)
      ) {
        return false
      }

      guard?.markInternalInteraction()
      event.preventDefault()
      return true
    },
    [guard],
  )
  const setContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node
      assignRef(ref, node)
    },
    [ref],
  )

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        onFocusCapture={(event) => {
          guard?.markInternalInteraction()
          onFocusCapture?.(event)
        }}
        onPointerDownCapture={(event) => {
          guard?.markInternalInteraction()
          onPointerDownCapture?.(event)
        }}
        ref={setContentRef}
        onFocusOutside={(event) => {
          if (keepOpenForInternalOutsideEvent(event)) return
          onFocusOutside?.(event)
        }}
        onInteractOutside={(event) => {
          if (keepOpenForInternalOutsideEvent(event)) return
          onInteractOutside?.(event)
        }}
        onPointerDownOutside={(event) => {
          if (keepOpenForInternalOutsideEvent(event)) return
          onPointerDownOutside?.(event)
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-1 text-sm', className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <div
      data-slot="popover-title"
      className={cn('font-medium', className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
