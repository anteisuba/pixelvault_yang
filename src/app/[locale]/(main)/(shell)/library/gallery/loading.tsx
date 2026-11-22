import { LibraryPageSkeleton } from '@/components/ui/library-kit'
import { StudioLibraryLoading } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { GallerySkeletonGrid } from '@/features/gallery'

/** 换到这一类、页面还没到的那一拍（见 `StudioLibraryLoading`）：工具行 + 画廊自己的错落灰块。 */
export default function Loading() {
  return (
    <StudioLibraryLoading category="gallery">
      <LibraryPageSkeleton>
        <GallerySkeletonGrid rows={3} />
      </LibraryPageSkeleton>
    </StudioLibraryLoading>
  )
}
