import { StudioLibraryLoading } from '@/components/business/studio/shell/StudioLibraryOverlay'

/** 换到这一类、页面还没到的那一拍（见 `StudioLibraryLoading`）。 */
export default function Loading() {
  return <StudioLibraryLoading category="cards" />
}
