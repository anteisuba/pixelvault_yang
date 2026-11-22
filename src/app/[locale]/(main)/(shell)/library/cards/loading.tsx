import { LibraryPageSkeleton } from '@/components/ui/library-kit'
import { StudioLibraryLoading } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { CharacterOverviewSkeleton } from '@/features/cards'

/** 换到这一类、页面还没到的那一拍（见 `StudioLibraryLoading`）：工具行 + 角色分段格的灰块。 */
export default function Loading() {
  return (
    <StudioLibraryLoading category="cards">
      <LibraryPageSkeleton>
        <CharacterOverviewSkeleton />
      </LibraryPageSkeleton>
    </StudioLibraryLoading>
  )
}
