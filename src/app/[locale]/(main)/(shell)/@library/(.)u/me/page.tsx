import MyProfilePage from '@/app/[locale]/(main)/(shell)/u/me/my-profile-page'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

/**
 * 从外壳里点开「我的主页」（账号菜单）：拦截下来叠在中间那一栏，台不卸载（第 9f 步 9f-2e）。
 * 顶上「去库里管理」进素材库。直接打开 / 刷新 `/u/me` 仍是原来那一整页（地址、canonical 都不变）。
 */
export default function MyProfileOverlayPage(
  props: Parameters<typeof MyProfilePage>[0],
) {
  return (
    <StudioLibraryOverlay category="profile">
      <MyProfilePage {...props} />
    </StudioLibraryOverlay>
  )
}
