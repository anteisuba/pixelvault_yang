'use client'

/**
 * 面板**空态**（v2 §4.2 / 画板 `DesignD7bFaces`）—— 首次打开、或刚开一条新会话时，
 * 时间线那一格里长的东西。
 *
 * ── D7b ③「四张脸」改了什么 ─────────────────────────────────────
 * 空态是四张脸里**两样**的落点：那句话与起手药丸。两样都从宿主的 `face` 来，
 * ⛔ 组件里不再按 domain 取药丸表 —— 旧那张 `STUDIO_OPERATOR_SUGGESTIONS`
 * （带 `minChanges` 门，回答的是「语境化建议」）连同 `suggestion.*` 三语词条
 * **已整块删掉**；D7b 的药丸是「这个助手会干什么」的自我介绍，一进来就得四处
 * 各不相同。
 * ⚠ 那句话**不再重复人设名字**（画板原话）：名字在头部那颗头像旁已经有了。
 *
 * 清单逐条：
 *  · 助手头像（大一号）+ **一句话**（`face.emptyLine`）；
 *  · **起手药丸**（`face.starterPills`，≤5、两行以内）—— **点即发送**（拍板 15）
 *    ⛔ 不动：它们是起手势不是草稿模板，填进框里还要再点一次发送，等于把一句
 *    已经写好的话降级成待办。
 *  · ⛔ 空态**不显示**结论记录区与钉住区（§4.2 末行）。
 *
 * ⚠ 头像走 `AssistantTimelineAvatar`（与时间线沟里那颗同一份实现），⛔ 不在这里
 *   第二次实现「自传头像优先于预设」那套判断。
 */

import { Sparkles } from '@/components/icons'

import { STUDIO_OPERATOR_FACE_PILL_LIMIT } from '@/constants/studio-assistant-operator'
import { AssistantTimelineAvatar } from '@/components/business/studio/assistant-operator/TimelineAvatar'
import type { StudioOperatorFace } from '@/contexts/studio-operator-host'
import type { AssistantPersona } from '@/types/assistant-persona'

interface StudioOperatorEmptyStateProps {
  /** 这个宿主那张脸 —— 空态只读 `emptyLine` 与 `starterPills` 两格。 */
  face: StudioOperatorFace
  /** 点一颗 = **直接发这句话**（拍板 15），⛔ 不是填进输入框。 */
  onSuggestion(text: string): void
  persona?: AssistantPersona
}

export function StudioOperatorEmptyState({
  face,
  onSuggestion,
  persona,
}: StudioOperatorEmptyStateProps) {
  return (
    <div
      data-testid="operator-empty"
      className="flex flex-col items-center gap-6 px-4 py-10 text-center"
    >
      {/* 68px = 时间线那颗 32px 的放大档（画板 BEmpty）—— 同一颗组件换尺寸，
          ⛔ 不是第二种头像。 */}
      <AssistantTimelineAvatar
        {...(persona ? { persona } : {})}
        className="size-17"
      />

      {/* 一句话就是一句话（画板 `DesignD7bFaces`）：⛔ 不再是「标题 + 说明」两段，
          ⛔ 也不再重复人设名字。 */}
      <p
        data-testid="operator-empty-line"
        className="max-w-95 text-md leading-relaxed text-foreground"
      >
        {face.emptyLine}
      </p>

      {face.starterPills.length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          {face.starterPills
            .slice(0, STUDIO_OPERATOR_FACE_PILL_LIMIT)
            .map((text) => (
              <button
                key={text}
                type="button"
                data-testid="operator-empty-suggestion"
                onClick={() => onSuggestion(text)}
                /* 10px 圆角（`rounded-lg`，画板 BEmpty）：这一行是一张可点的
                   卡而不是一颗控件，⛔ 不用控件档的 `rounded-md`。 */
                className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-4 text-left text-sm text-foreground shadow-assistant-card transition-colors duration-(--duration-fast) ease-standard hover:bg-accent active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <Sparkles className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{text}</span>
              </button>
            ))}
        </div>
      ) : null}
    </div>
  )
}
