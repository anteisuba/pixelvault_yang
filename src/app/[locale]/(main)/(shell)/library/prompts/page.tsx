import PromptsPage, { generateMetadata } from './prompts-page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/**
 * `/library/prompts`：同一页叠在外壳中间（第 9f 步 9f-2a），页面本体在旁边的 `prompts-page.tsx`（旧地址 `/prompts` 已 308 到这里，9f-2e）。
 */
export default function LibraryPromptsPage(
  props: Parameters<typeof PromptsPage>[0],
) {
  return (
    <StudioLibraryOverlay category="prompts">
      <PromptsPage {...props} />
    </StudioLibraryOverlay>
  )
}
