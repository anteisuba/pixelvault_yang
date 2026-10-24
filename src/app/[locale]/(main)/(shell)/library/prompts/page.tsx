import PromptsPage, {
  generateMetadata,
} from '@/app/[locale]/(main)/prompts/page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/** `/library/prompts`：同一页叠在外壳中间（第 9f 步 9f-2a），旧地址那一页原样复用。 */
export default function LibraryPromptsPage(
  props: Parameters<typeof PromptsPage>[0],
) {
  return (
    <StudioLibraryOverlay category="prompts">
      <PromptsPage {...props} />
    </StudioLibraryOverlay>
  )
}
