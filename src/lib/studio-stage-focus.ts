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
