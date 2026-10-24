import AssetsPage, { generateMetadata } from './assets-page'
import { STUDIO_LIBRARY_PICK_PARAM } from '@/constants/studio-shell'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { StudioLibraryPickSlot } from '@/components/business/studio/shell/StudioLibraryPickSlot'

export { generateMetadata }

type LibraryAssetsPageProps = Parameters<typeof AssetsPage>[0]

/**
 * `/library/assets`：同一页叠在外壳中间（第 9f 步 9f-2a），页面本体在旁边的 `assets-page.tsx`（旧地址 `/assets` 已 308 到这里，9f-2e）。
 * `?pick=1` = 台叫来挑参考图（9f-2d）：只留落点，台把自己那份挑选传送进来，
 * ⛔ 再取整页素材库的数据。
 */
export default async function LibraryAssetsPage(props: LibraryAssetsPageProps) {
  const { [STUDIO_LIBRARY_PICK_PARAM]: pick } = (await props.searchParams) as {
    [STUDIO_LIBRARY_PICK_PARAM]?: string
  }
  const picking = pick === '1'
  return (
    <StudioLibraryOverlay category="assets">
      {picking ? (
        <StudioLibraryPickSlot category="assets" />
      ) : (
        <AssetsPage {...props} />
      )}
    </StudioLibraryOverlay>
  )
}
