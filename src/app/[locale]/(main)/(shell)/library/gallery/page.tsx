import GalleryPage, {
  generateMetadata,
} from '@/app/[locale]/(main)/gallery/page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/** `/library/gallery`：同一页叠在外壳中间（第 9f 步 9f-2a），旧地址那一页原样复用。 */
export default function LibraryGalleryPage(
  props: Parameters<typeof GalleryPage>[0],
) {
  return (
    <StudioLibraryOverlay category="gallery">
      <GalleryPage {...props} />
    </StudioLibraryOverlay>
  )
}
