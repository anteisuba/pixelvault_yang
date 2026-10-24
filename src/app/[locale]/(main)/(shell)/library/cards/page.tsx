import CardsPage, { generateMetadata } from '@/app/[locale]/(main)/cards/page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/** `/library/cards`：同一页叠在外壳中间（第 9f 步 9f-2a），旧地址那一页原样复用。 */
export default function LibraryCardsPage(
  props: Parameters<typeof CardsPage>[0],
) {
  return (
    <StudioLibraryOverlay category="cards">
      <CardsPage {...props} />
    </StudioLibraryOverlay>
  )
}
