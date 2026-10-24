import VoicesRoute, {
  generateMetadata,
} from '@/app/[locale]/(main)/voices/page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/** `/library/voices`：同一页叠在外壳中间（第 9f 步 9f-2a），旧地址那一页原样复用。 */
export default function LibraryVoicesRoute(
  props: Parameters<typeof VoicesRoute>[0],
) {
  return (
    <StudioLibraryOverlay category="voices">
      <VoicesRoute {...props} />
    </StudioLibraryOverlay>
  )
}
