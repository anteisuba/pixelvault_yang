import { StudioShell } from '@/components/business/studio/shell/StudioShell'

/**
 * `/studio` 与 `/library` 共用的外壳（第 9f 步方向 E）：左 = 对话列表 · 中 = 对话（助手面板
 * 只挂这一份）· 右 = 台。各台（`(workspace)` / LoRA / 画布 / 3D）照旧在自己那一层挂
 * Provider，这一层只摆三栏，见 `StudioShell`。
 *
 * `library` = `@library` 那一格：从外壳里点开库（软跳转）时由拦截路由
 * `@library/(.)library/*` 接住，`children` 里的台原样留着；直接打开 `/library/*` 时库就是
 * `children` 本身。两种情况库都传送到中间那一栏上（`StudioLibraryOverlay`）。
 *
 * LoRA 域的两个 Provider 仍在 `studio/lora/layout.tsx`（图片台 ⛔ 读到 LoRA 的状态）。
 */
export default function StudioShellLayout({
  children,
  library,
}: {
  children: React.ReactNode
  library: React.ReactNode
}) {
  return <StudioShell library={library}>{children}</StudioShell>
}
