'use client'

/**
 * 面板**空态**（D7c ④ · 画板 `DesignD7cFlow`「空态 · 改后」）—— 首次打开、或刚开
 * 一条新会话时，时间线那一格里长的东西。
 *
 * ── 留白是**会让步的**那一格（owner 2026-09-20 真机第二轮）──────────
 * 画板那对 52 / 44 是宽松档的样子，直接写成 `padding` 的下场是：矮容器里它照样
 * 占满 96px，于是那句话被挤出可视区。所以上下留白是**两根可伸可缩的 spacer**：
 * `basis` 就是画板那两个数（宽松档一字不差），`grow` 让它们把多出来的高度按
 * 52:44 分掉（于是这一组落在居中偏下一点，与画板同一个读法），`shrink` 让它们
 * 在挤的时候先于内容让步 —— **留白该比字先消失**。
 * ⚠ 头像与那句话 `shrink-0`：让步的是空白，⛔ 不是内容。
 * ⚠ ⛔ 外层不再 `justify-center`：居中已经由这两根 spacer 做掉了，再叠一层
 *   `justify-center` 会在内容真的装不下时把顶端推到滚不到的地方（flex 居中溢出
 *   的经典坑）—— 而空态的可读点恰恰在顶端。
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
      /* ⚠ `min-h-0` + `flex-1`：这一格**填满**会话区，两根 spacer 才有高度可分；
         少了 `min-h-0`，挤的时候它会顶着 min-content 不让步（见头注）。 */
      className="flex min-h-0 w-full flex-1 flex-col items-center px-4 text-center"
    >
      {/* 上留白 52（画板）—— ⚠ 它是一根会让步的 spacer，不是 `padding`：见头注。 */}
      <span aria-hidden className="w-px min-h-0 shrink grow basis-13" />

      {/* 40px = 时间线那颗 32px 的放大档（画板「空态 · 改后」）—— 同一颗组件换
          尺寸，⛔ 不是第二种头像。 */}
      <AssistantTimelineAvatar
        {...(persona ? { persona } : {})}
        className="size-10 shrink-0"
      />

      {/* 一句话就是一句话（D7b ③）：⛔ 不再是「标题 + 说明」两段。 */}
      <p
        data-testid="operator-empty-line"
        className="mt-2.5 max-w-95 shrink-0 text-2sm leading-relaxed text-muted-foreground"
      >
        {face.emptyLine}
      </p>

      {/* 下留白 44（画板）。 */}
      <span aria-hidden className="w-px min-h-0 shrink grow basis-11" />
    </div>
  )
}
