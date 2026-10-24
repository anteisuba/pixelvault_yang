import VoicesRoute, { generateMetadata } from './voices-page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/** `/library/voices`：同一页叠在外壳中间（第 9f 步 9f-2a），页面本体在旁边的 `voices-page.tsx`（旧地址 `/voices` 已 308 到这里，9f-2e）。 */
export default function LibraryVoicesRoute(
  props: Parameters<typeof VoicesRoute>[0],
) {
  return (
    <StudioLibraryOverlay category="voices">
      <VoicesRoute {...props} />
    </StudioLibraryOverlay>
  )
}
