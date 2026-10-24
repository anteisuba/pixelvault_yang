import { StudioShell } from '@/components/business/studio/shell/StudioShell'

/**
 * `/studio` 的外壳（第 9f 步方向 E）：左 = 对话列表 · 中 = 对话（助手面板只挂这一份）·
 * 右 = 台。各台（`(workspace)` / LoRA / 画布 / 3D）照旧在自己那一层挂 Provider，
 * 这一层只摆三栏，见 `StudioShell`。
 *
 * LoRA 域的两个 Provider 仍在 `studio/lora/layout.tsx`（图片台 ⛔ 读到 LoRA 的状态）。
 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <StudioShell>{children}</StudioShell>
}
