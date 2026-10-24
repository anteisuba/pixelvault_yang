import { Suspense } from 'react'

import { LoraStackStyleParamSync } from '@/hooks/use-active-lora-stack'
import { PromptTagProvider } from '@/hooks/use-prompt-tag-stack'

/**
 * LoRA 台这一层：
 *   - LoraStackStyleParamSync — 把 `?style=<code>` 分享链接解析进挂载栈（栈本身挂在
 *     外壳 `(shell)/layout.tsx`，库叠层也往里挂）。
 *   - PromptTagProvider — the tavern-style prompt-tag stack. The workbench
 *     is the only surface with an add-UI for it; keeping it here stops the
 *     selected tags from leaking into the Image Studio compose bar.
 *
 * <Suspense> is required because `useSearchParams()` inside the style sync
 * opts its subtree into client-side rendering for the search-param boundary.
 */
export default function StudioLoraLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={null}>
      <LoraStackStyleParamSync />
      <PromptTagProvider>{children}</PromptTagProvider>
    </Suspense>
  )
}
