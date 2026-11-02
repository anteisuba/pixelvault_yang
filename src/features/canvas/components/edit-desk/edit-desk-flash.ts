/**
 * 段闪：外部改到的段整段提亮一下 + 外圈浅晕，320ms 一次（④ A 关键切片）。
 *
 * 与画布卡闪（`flashAssistantTouchedNode`）同一条纪律：**命令式 classList**，
 * ⛔ 不进 React state —— 被改的段此刻正要重渲染，React 那一侧的 className 会在
 * 同一拍把 class 覆盖掉。先摘再挂 + 强制重排，同一段连着被改两次才会闪两次。
 * 段不在 DOM 里（手机只读档没画那条轨）时静默跳过。时长与 reduced-motion 降级
 * 写在 `canvas.css` 的 `.edit-clip-touched`；`durationMs` 给了就换掉默认的 320
 * （重拍落版那一下是 460，关键切片动效表「新版落位」）。
 */

/** 段自报家门的属性（V / A / M / T 四轨的段都挂）。 */
export const EDIT_CLIP_FLASH_ATTRIBUTE = 'data-edit-clip-id'

const EDIT_CLIP_TOUCH_CLASS = 'edit-clip-touched'

export function flashEditClips(
  clipIds: readonly string[],
  durationMs?: number,
): void {
  if (typeof document === 'undefined') return
  for (const clipId of clipIds) {
    const el = document.querySelector<HTMLElement>(
      `[${EDIT_CLIP_FLASH_ATTRIBUTE}="${CSS.escape(clipId)}"]`,
    )
    if (!el) continue
    if (durationMs === undefined) el.style.removeProperty('--edit-clip-flash')
    else el.style.setProperty('--edit-clip-flash', `${durationMs}ms`)
    el.classList.remove(EDIT_CLIP_TOUCH_CLASS)
    void el.offsetWidth
    el.classList.add(EDIT_CLIP_TOUCH_CLASS)
    el.addEventListener(
      'animationend',
      () => el.classList.remove(EDIT_CLIP_TOUCH_CLASS),
      { once: true },
    )
  }
}
