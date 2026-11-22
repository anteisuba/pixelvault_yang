import {
  LibraryPageSkeleton,
  LibraryTileSkeletonGrid,
} from '@/components/ui/library-kit'
import { StudioLibraryLoading } from '@/components/business/studio/shell/StudioLibraryOverlay'

/** 换到这一类、页面还没到的那一拍（见 `StudioLibraryLoading`）：工具行 + 素材格灰块（素材格没有名字）。 */
export default function Loading() {
  return (
    <StudioLibraryLoading category="assets">
      <LibraryPageSkeleton>
        <LibraryTileSkeletonGrid caption={false} />
      </LibraryPageSkeleton>
    </StudioLibraryLoading>
  )
}
