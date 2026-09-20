'use client'

/**
 * 面板**空态**（D7c ④ · 画板 `DesignD7cFlow`「空态 · 改后」）—— 首次打开、或刚开
 * 一条新会话时，时间线那一格里长的东西。
 *
 * ── 现在只剩两样：一颗 40px 头像 + 一句话 ─────────────────────────
 * 那四条满宽建议条**整块搬去输入框正上方**，压成一排 28px 的 chip（`StudioOperatorPanel`
 * 的建议行）。判据是 owner 在画板上写的那句：它们是**诱饵**，不该比助手说的那句话
 * 还重 —— 四条与输入框等宽、带边带影的卡摆在一句话底下，读起来像四个必须先做的
 * 选择。头像同时从 72 缩到 40，和那句话合成一组、垂直居中偏上。
 * ⚠ 那句话**不再重复人设名字**（D7b ③ 原话）：名字在头部那颗头像旁已经有了。
 * ⛔ 空态**不显示**结论记录区与钉住区（§4.2 末行）。
 * ⛔ 这一格不再收 `onSuggestion` —— 药丸不在这里了，留个没人调的回调只会让下一个
 *   人把它们塞回来。
 *
 * ⚠ 头像走 `AssistantTimelineAvatar`（与时间线沟里那颗同一份实现），⛔ 不在这里
 *   第二次实现「自传头像优先于预设」那套判断。
 */

import { AssistantTimelineAvatar } from '@/components/business/studio/assistant-operator/TimelineAvatar'
import type { StudioOperatorFace } from '@/contexts/studio-operator-host'
import type { AssistantPersona } from '@/types/assistant-persona'

interface StudioOperatorEmptyStateProps {
  /** 这个宿主那张脸 —— 空态只读 `emptyLine` 一格（药丸归输入区那一排）。 */
  face: StudioOperatorFace
  persona?: AssistantPersona
}

export function StudioOperatorEmptyState({
  face,
  persona,
}: StudioOperatorEmptyStateProps) {
  return (
    <div
      data-testid="operator-empty"
      /* 画板：`52 / 44` 的上下留白把这一组顶到**居中偏上** —— 正中间会让它读起来
         像一张等着被填的表单，偏上才像「它先说了一句，等你接话」。 */
      className="flex flex-col items-center gap-2.5 px-4 pb-11 pt-13 text-center"
    >
      {/* 40px = 时间线那颗 32px 的放大档（画板「空态 · 改后」）—— 同一颗组件换
          尺寸，⛔ 不是第二种头像。 */}
      <AssistantTimelineAvatar
        {...(persona ? { persona } : {})}
        className="size-10"
      />

      {/* 一句话就是一句话（D7b ③）：⛔ 不再是「标题 + 说明」两段。 */}
      <p
        data-testid="operator-empty-line"
        className="max-w-95 text-2sm leading-relaxed text-muted-foreground"
      >
        {face.emptyLine}
      </p>
    </div>
  )
}
