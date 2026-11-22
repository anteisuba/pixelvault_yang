import { StudioLibraryLoading } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { TagLibrarySkeleton } from '@/features/studio'

/** 换到这一类、页面还没到的那一拍（见 `StudioLibraryLoading`）：桌面左列表 + 右详情、手机等宽格的灰块。 */
export default function Loading() {
  return (
    <StudioLibraryLoading category="tags">
      <TagLibrarySkeleton />
    </StudioLibraryLoading>
  )
}
