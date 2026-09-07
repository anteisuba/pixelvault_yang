/**
 * 助手给下一枪起的**名字**（切片 Y 的 `label` 透传）。
 *
 * ── 为什么是一个模块级的小格子 ────────────────────────────────────
 * 名字在 `prime_generate` / `request_generation` 那一步落下来（`applyOperatorStep`
 * 里的两条分支），而真正把它带上去的是**生成提交那一跳**（宿主的
 * `REQUEST_GENERATE` → `useStudioGenerateAction` → `studioGenerateAPI`）。两端
 * 之间隔着整棵组件树与一次 dispatch，逐层透传一个可选参数正是本仓「漏传 = 三绿
 * 而功能全失效」的高发形态 —— 与 `requestOperatorAttachment` 那只投递口同一条
 * 论据，所以做法也一样。
 *
 * ⛔ **它不进 store**：它不是渲染要读的数据，进 state 只会让每次备枪都触发一次
 * 全面板重渲染。
 * ⚠ **取走即消费**（`takeOperatorGenerationLabel`）：留着它，用户自己按下一次
 * 生成键时那一枪会顶着助手上一轮起的名字 —— 而那一张与那个名字毫无关系。
 */

let pendingLabel: string | null = null

/** 助手起的名字落进来（`prime_generate` / `request_generation` 的 `label`）。 */
export function setOperatorGenerationLabel(label: string): void {
  const trimmed = label.trim()
  pendingLabel = trimmed.length > 0 ? trimmed : null
}

/** 取走并清空 —— 生成提交那一跳调它。 */
export function takeOperatorGenerationLabel(): string | null {
  const next = pendingLabel
  pendingLabel = null
  return next
}

/**
 * 丢掉（用户改口 / 撤销备枪 / 切域）。
 *
 * ⚠ 与「取走」分开一个名字：读得出「这里是丢掉，不是拿去用」。
 */
export function clearOperatorGenerationLabel(): void {
  pendingLabel = null
}
