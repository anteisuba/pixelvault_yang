import { Suspense } from 'react'

import { LoraStackProvider } from '@/hooks/use-active-lora-stack'
import { PromptTagProvider } from '@/hooks/use-prompt-tag-stack'

/**
 * Top-level Studio layout — wraps every /studio/* route in
 * <LoraStackProvider>, which exposes a session-wide ActiveLoraStack
 * (localStorage-persisted, ?style=<code> aware). PromptTagProvider keeps
 * selected prompt tags scoped to the signed-in user. Visible LoRA state now
 * lives inside the prompt workspace instead of the top Studio chrome.
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
        <PromptTagProvider>{children}</PromptTagProvider>
      </LoraStackProvider>
    </Suspense>
  )
}
