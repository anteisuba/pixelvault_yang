import CardsPage, { generateMetadata } from './cards-page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/**
 * `/library/cards`：同一页叠在外壳中间（第 9f 步 9f-2a），页面本体在旁边的 `cards-page.tsx`（旧地址 `/cards` 已 308 到这里，9f-2e）。
 */
export default function LibraryCardsPage(
  props: Parameters<typeof CardsPage>[0],
) {
  return (
    <StudioLibraryOverlay category="cards">
      <CardsPage params={props.params} />
    </StudioLibraryOverlay>
  )
}
