import { LoraLibrarySkeleton } from '@/features/lora'
import { StudioLibraryLoading } from '@/components/business/studio/shell/StudioLibraryOverlay'

/** 换到这一类、页面还没到的那一拍（见 `StudioLibraryLoading`）：与库同形的骨架瓦片。 */
export default function Loading() {
  return (
    <StudioLibraryLoading category="lora">
      <LoraLibrarySkeleton />
    </StudioLibraryLoading>
  )
}
