import CardsPage, { generateMetadata } from './cards-page'
import { STUDIO_LIBRARY_PICK_PARAM } from '@/constants/studio-shell'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { StudioLibraryPickSlot } from '@/components/business/studio/shell/StudioLibraryPickSlot'

export { generateMetadata }

type LibraryCardsPageProps = Parameters<typeof CardsPage>[0] & {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/library/cards`：同一页叠在外壳中间（第 9f 步 9f-2a），页面本体在旁边的 `cards-page.tsx`（旧地址 `/cards` 已 308 到这里，9f-2e）。
 * `?pick=1` = 台叫来挑角色（9f-2d）：只留落点，台把自己那份挑选传送进来。
 */
export default async function LibraryCardsPage(props: LibraryCardsPageProps) {
  const { [STUDIO_LIBRARY_PICK_PARAM]: pick } = await props.searchParams
  return (
    <StudioLibraryOverlay category="cards">
      {pick === '1' ? (
        <StudioLibraryPickSlot category="cards" />
      ) : (
        <CardsPage params={props.params} />
      )}
    </StudioLibraryOverlay>
  )
}
