import AssetsPage, { generateMetadata } from '@/app/[locale]/(main)/assets/page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/** `/library/assets`：同一页叠在外壳中间（第 9f 步 9f-2a），旧地址那一页原样复用。 */
export default function LibraryAssetsPage(
  props: Parameters<typeof AssetsPage>[0],
) {
  return (
    <StudioLibraryOverlay category="assets">
      <AssetsPage {...props} />
    </StudioLibraryOverlay>
  )
}
