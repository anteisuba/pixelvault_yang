import AssetsPage, { generateMetadata } from './assets-page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

type LibraryAssetsPageProps = Parameters<typeof AssetsPage>[0]

/**
 * `/library/assets`：同一页叠在外壳中间（第 9f 步 9f-2a），页面本体在旁边的 `assets-page.tsx`（旧地址 `/assets` 已 308 到这里，9f-2e）。
 * 台上挑参考图不来这里：弹正中的挑选框（ui-spec ㉔，`ReferenceImageLibraryDialog`）。
 */
export default function LibraryAssetsPage(props: LibraryAssetsPageProps) {
  return (
    <StudioLibraryOverlay category="assets">
      <AssetsPage {...props} />
    </StudioLibraryOverlay>
  )
}
