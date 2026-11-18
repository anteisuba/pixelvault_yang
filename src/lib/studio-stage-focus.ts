/**
 * 舞台上此刻选中的那张（图片台结果格里点过的那张 / LoRA 台放大的那张）—— 助手快照现读，
 * 好让创作者说「这张」时助手知道是哪张（10-25）。
 *
 * ⭐ 模块级一格就够：外壳里同一时间只有一个台在场（9f）；舞台写、快照读，⛔ 不触发渲染。
 * ⚠ 舞台卸载 / 换了选中时先清再写（见调用方的 effect 清理）。
 */
let focusedGenerationId: string | null = null

export function setStudioStageFocus(generationId: string | null): void {
  focusedGenerationId = generationId
}

export function readStudioStageFocus(): string | null {
  return focusedGenerationId
}

/** 舞台上那张结果挂的标记（图片台单张 / 对比格 / LoRA 台主图与底条）。 */
const STAGE_GENERATION_ATTR = 'data-stage-generation-id'

/**
 * 把舞台上那张滚进视野并选中（助手对话里那一行「已出图，在右边」点一下，11-18）。
 * 对比格 / LoRA 底条那一格是可点的：点一下就是「选中它」（与创作者自己点同一条路）。
 * @returns 舞台上找没找到它（台上已经换成别的一批时找不到，调用方退回只给提示）。
 */
export function locateStudioStageGeneration(generationId: string): boolean {
  if (typeof document === 'undefined') return false
  const target = Array.from(
    document.querySelectorAll<HTMLElement>(`[${STAGE_GENERATION_ATTR}]`),
  ).find(
    (element) => element.getAttribute(STAGE_GENERATION_ATTR) === generationId,
  )
  if (!target) return false
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: reduce ? 'auto' : 'smooth',
  })
  if (target.matches('button, [role="option"]')) target.click()
  return true
}
