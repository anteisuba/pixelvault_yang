import { Suspense } from 'react'

import { LoraStackProvider } from '@/hooks/use-active-lora-stack'
import { ActiveLoraBar } from '@/components/business/studio-shared/chrome/ActiveLoraBar'

/**
 * Top-level Studio layout — wraps every /studio/* route in
 * <LoraStackProvider>, which exposes a session-wide ActiveLoraStack
 * (localStorage-persisted, ?style=<code> aware). ActiveLoraBar then
 * renders a sticky chip strip whenever the stack is non-empty so the
 * user can see which LoRA(s) will be applied across image, edit,
 * video, and the lora workbench itself.
 *
 * The (workspace) and edit sub-layouts continue to own their own
 * StudioProvider / EditWorkspaceShell — this layer sits above them.
 *
 * <Suspense> is required because `useSearchParams()` inside
 * LoraStackProvider opts the subtree into client-side rendering for
 * the search-param boundary.
 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={null}>
      <LoraStackProvider>
        <ActiveLoraBar />
        {children}
      </LoraStackProvider>
    </Suspense>
  )
}
