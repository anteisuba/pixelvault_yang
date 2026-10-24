import { Suspense } from 'react'

import { LoraLibraryOverlayView } from '@/components/business/studio/lora/library/LoraLibraryOverlayView'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

/**
 * `/library/lora`（第 9f 步 9f-2b）：LoRA 台原来那两格「库 / 收藏」叠在外壳中间。
 * `<Suspense>`：来源 / 筛选 / 哪一格都记在网址里（`useSearchParams`）。
 */
export default function LibraryLoraPage() {
  return (
    <StudioLibraryOverlay category="lora">
      <Suspense fallback={null}>
        <LoraLibraryOverlayView />
      </Suspense>
    </StudioLibraryOverlay>
  )
}
