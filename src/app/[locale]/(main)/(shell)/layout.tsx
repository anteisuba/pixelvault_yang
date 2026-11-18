import { StudioShell } from '@/components/business/studio/shell/StudioShell'
import { StudioGenerationSessionsProvider } from '@/contexts/studio-generation-sessions'
import { LoraStackProvider } from '@/features/lora/hooks'

/**
 * `/studio` 与 `/library` 共用的外壳（第 9f 步方向 E）：左 = 对话列表 · 中 = 对话（助手面板
 * 只挂这一份）· 右 = 台。各台（`(workspace)` / LoRA / 画布 / 3D）照旧在自己那一层挂
 * Provider，这一层只摆三栏，见 `StudioShell`。
 *
 * `library` = `@library` 那一格：从外壳里点开库（软跳转）时由拦截路由
 * `@library/(.)library/*` 接住，`children` 里的台原样留着；直接打开 `/library/*` 时库就是
 * `children` 本身。两种情况库都传送到中间那一栏上（`StudioLibraryOverlay`）。
 *
 * LoRA 挂载栈挂在这一层（9f-2b）：库叠层里的 LoRA 也往同一份栈里挂，台上的装配列当场看见。
 * 图片 / 视频台不读它（`use-studio-workbench-operator-host` 不给 `lora`）；`?style=` 与提示词
 * 标签栈仍在 `studio/lora/layout.tsx`。
 *
 * 各台在飞的那一单也挂在这一层（`StudioGenerationSessionsProvider`）：换台 = 上一张台卸载，
 * 出图状态与轮询住在台自己身上时会一起丢（11-17 LoRA 台真机：切去配音台再回来，作业消失）。
 */
export default function StudioShellLayout({
  children,
  library,
}: {
  children: React.ReactNode
  library: React.ReactNode
}) {
  return (
    <StudioGenerationSessionsProvider>
      <LoraStackProvider>
        <StudioShell library={library}>{children}</StudioShell>
      </LoraStackProvider>
    </StudioGenerationSessionsProvider>
  )
}
