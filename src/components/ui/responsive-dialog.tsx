'use client'

import * as React from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

/**
 * ResponsiveDialog — Dialog on desktop, vaul Drawer (bottom sheet) on mobile.
 *
 * Same API surface as `Dialog`. Pick this over `Dialog` whenever the dialog
 * has more than a confirmation message — forms, lists, multi-step flows,
 * anything where keyboard or scroll matters on small screens. See
 * docs/ai/responsive-workflow.md §7.
 *
 * Mobile-only behaviors handled here so callers do not have to repeat them:
 *   - Drawer content caps at `max-h-[95dvh]` so it never gets clipped by the
 *     URL bar.
 *   - Inner scroll container with safe-area-aware bottom padding so the home
 *     indicator never sits on top of the last button.
 *
 * Hydration note: `useIsMobile()` returns false on the server. That is fine
 * because all callers in this repo open dialogs from user interaction — the
 * dialog is closed when hydration runs, so the swap from Dialog to Drawer is
 * invisible. Do not pass `defaultOpen={true}` to a ResponsiveDialog.
 */

const ResponsiveDialogContext = React.createContext<{ isMobile: boolean }>({
  isMobile: false,
})

function ResponsiveDialog({
  children,
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const isMobile = useIsMobile()
  const Component = isMobile ? Drawer : Dialog
  return (
    <ResponsiveDialogContext.Provider value={{ isMobile }}>
      <Component {...props}>{children}</Component>
    </ResponsiveDialogContext.Provider>
  )
}

function ResponsiveDialogTrigger({
  children,
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  const Component = isMobile ? DrawerTrigger : DialogTrigger
  return <Component {...props}>{children}</Component>
}

function ResponsiveDialogContent({
  className,
  children,
  showCloseButton,
  closeLabel,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  if (isMobile) {
    return (
      <DrawerContent className={cn('max-h-[95dvh]', className)} {...props}>
        <div
          className="flex-1 overflow-y-auto px-4 pt-2"
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)',
          }}
        >
          {children}
        </div>
      </DrawerContent>
    )
  }
  return (
    <DialogContent
      className={className}
      showCloseButton={showCloseButton}
      closeLabel={closeLabel}
      {...props}
    >
      {children}
    </DialogContent>
  )
}

function ResponsiveDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  const Component = isMobile ? DrawerHeader : DialogHeader
  return <Component className={className} {...props} />
}

function ResponsiveDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  const Component = isMobile ? DrawerFooter : DialogFooter
  return <Component className={className} {...props} />
}

function ResponsiveDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  const Component = isMobile ? DrawerTitle : DialogTitle
  return <Component className={className} {...props} />
}

function ResponsiveDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  const Component = isMobile ? DrawerDescription : DialogDescription
  return <Component className={className} {...props} />
}

// Note: no ResponsiveDialogClose. The Dialog/Drawer Close primitives have
// incompatible ref types (HTMLDivElement vs HTMLButtonElement) and a wrapper
// would need an unsafe cast. All current Tier 1 callers use programmatic
// open/onOpenChange, so the close button is unused. If you ever need one,
// import DialogClose / DrawerClose directly and branch on useIsMobile().

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
}
