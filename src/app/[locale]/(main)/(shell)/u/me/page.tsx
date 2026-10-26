import MyProfilePage, { generateMetadata } from './my-profile-page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

export { generateMetadata }

/**
 * `/u/me`：直接打开 / 刷新也在外壳里，叠在中间那一栏（和库同一套），左边只有外壳那条窄图标栏
 * （用户 10-27「侧边栏只保留最新的」）。页面本体在旁边的 `my-profile-page.tsx`。
 */
export default function MyProfileShellPage(
  props: Parameters<typeof MyProfilePage>[0],
) {
  return (
    <StudioLibraryOverlay category="profile">
      <MyProfilePage {...props} />
    </StudioLibraryOverlay>
  )
}
