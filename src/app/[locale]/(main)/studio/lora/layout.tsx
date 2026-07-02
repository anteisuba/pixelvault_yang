import { Suspense } from 'react'

import { LoraStackProvider } from '@/hooks/use-active-lora-stack'

/**
 * LoraStackProvider exposes a session-wide ActiveLoraStack
 * (localStorage-persisted, ?style=<code> aware) scoped to the LoRA
 * workbench — moved down from the top-level studio layout now that LoRA
 * generation lives entirely at /studio/lora (Image Studio no longer reads
 * this stack).
 *
 * <Suspense> is required because `useSearchParams()` inside
 * LoraStackProvider opts the subtree into client-side rendering for the
 * search-param boundary.
 */
export default function StudioLoraLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={null}>
      <LoraStackProvider>{children}</LoraStackProvider>
    </Suspense>
  )
}
