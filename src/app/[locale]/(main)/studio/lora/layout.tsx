import { Suspense } from 'react'

import { LoraStackProvider } from '@/hooks/use-active-lora-stack'
import { PromptTagProvider } from '@/hooks/use-prompt-tag-stack'

/**
 * LoRA workbench providers, both scoped to /studio/lora:
 *   - LoraStackProvider — session-wide ActiveLoraStack (localStorage-
 *     persisted, ?style=<code> aware).
 *   - PromptTagProvider — the tavern-style prompt-tag stack. The workbench
 *     is the only surface with an add-UI for it; keeping it here stops the
 *     selected tags from leaking into the Image Studio compose bar. Both
 *     moved down from the top-level studio layout now that LoRA generation
 *     lives entirely at /studio/lora (Image Studio reads neither).
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
      <LoraStackProvider>
        <PromptTagProvider>{children}</PromptTagProvider>
      </LoraStackProvider>
    </Suspense>
  )
}
