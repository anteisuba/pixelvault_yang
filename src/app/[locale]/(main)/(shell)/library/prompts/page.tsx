import PromptsPage, { generateMetadata } from './prompts-page'
import { STUDIO_LIBRARY_PICK_PARAM } from '@/constants/studio-shell'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { StudioLibraryPickSlot } from '@/components/business/studio/shell/StudioLibraryPickSlot'

export { generateMetadata }

/**
 * `/library/prompts`：同一页叠在外壳中间（第 9f 步 9f-2a），页面本体在旁边的 `prompts-page.tsx`（旧地址 `/prompts` 已 308 到这里，9f-2e）。
 * `?pick=1` = 台叫来挑模板（9f-2d）：只留落点，台把自己那份模板面板传送进来。
 */
export default async function LibraryPromptsPage(
  props: Parameters<typeof PromptsPage>[0],
) {
  const params: Record<string, unknown> = await props.searchParams
  return (
    <StudioLibraryOverlay category="prompts">
      {params[STUDIO_LIBRARY_PICK_PARAM] === '1' ? (
        <StudioLibraryPickSlot category="prompts" />
      ) : (
        <PromptsPage {...props} />
      )}
    </StudioLibraryOverlay>
  )
}
