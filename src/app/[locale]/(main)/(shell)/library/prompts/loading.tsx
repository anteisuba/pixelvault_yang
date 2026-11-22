import { LibraryPageSkeleton } from '@/components/ui/library-kit'
import { StudioLibraryLoading } from '@/components/business/studio/shell/StudioLibraryOverlay'

/** 换到这一类、页面还没到的那一拍（见 `StudioLibraryLoading`）：工具行 + 与库同形的格子灰块。 */
export default function Loading() {
  return (
    <StudioLibraryLoading category="prompts">
      <LibraryPageSkeleton />
    </StudioLibraryLoading>
  )
}
