import { Suspense } from 'react'

import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { TagLibraryView } from '@/components/business/studio/tags/library/TagLibraryView'

/**
 * `/library/tags`（第 9f 步 9f-2c）：Danbooru 标签像 LoRA 库那样摊开，叠在外壳中间。
 * `<Suspense>`：库 / 收藏、哪一类、搜索词、打开的详情都记在网址里（`useSearchParams`）。
 */
export default function LibraryTagsPage() {
  return (
    <StudioLibraryOverlay category="tags">
      <Suspense fallback={null}>
        <TagLibraryView />
      </Suspense>
    </StudioLibraryOverlay>
  )
}
