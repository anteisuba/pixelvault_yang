'use client'

import * as React from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

import { cn } from '@/lib/utils'

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
)
Drawer.displayName = 'Drawer'

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<'button'>
>(({ className, ...props }, ref) => (
  <button
    ref={ref as React.Ref<HTMLButtonElement>}
    className={cn('', className)}
    {...props}
  />
))
DrawerClose.displayName = 'DrawerClose'

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/80', className)}
    {...props}
  />
))
DrawerOverlay.displayName = 'DrawerOverlay'

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-2xl border bg-background',
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = 'DrawerContent'

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('grid gap-1.5 p-4 text-center sm:text-left', className)}
    {...props}
  />
)
DrawerHeader.displayName = 'DrawerHeader'

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('mt-auto flex flex-col gap-2 p-4', className)}
    {...props}
  />
)
DrawerFooter.displayName = 'DrawerFooter'

// Must wrap DrawerPrimitive.Title (vaul re-exports Radix Dialog's primitive
// under the hood). A plain `<h2>` doesn't satisfy Radix's a11y check and
// triggers the dev-time "DialogContent requires a DialogTitle" warning,
// because Radix walks for `DialogPrimitive.Title` specifically — not just
// any heading element. Same applies to DrawerDescription.
const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className,
    )}
    {...props}
  />
))
DrawerTitle.displayName = 'DrawerTitle'

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DrawerDescription.displayName = 'DrawerDescription'

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
