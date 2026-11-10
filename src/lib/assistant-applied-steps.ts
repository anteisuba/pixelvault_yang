/**
 * 回合托管第 3 片：**这一轮里哪几步已经在这个标签页落过**。
 *
 * ⭐ 刷新回来补放整轮时，改表单 / 改画布的步会再到一次 —— 落过的 ⛔ 再落（画布会多出一批卡，
 *   追加类的提示词会写两遍）。键是「轮号 + 步号」（步号带接力前缀），与 runKey 无关：刷新之后
 *   runKey 是新的，轮号与步号不变。
 * ⚠ 存在 `sessionStorage`：刷新留着、关掉标签页就没（换标签页接回时那边的表单本来就没落过）。
 *   读写失败（隐私模式 / 配额）当作没记过：最坏是重落一次，⛔ 拦住这一轮。
 */

const KEY = 'antei:assistant-applied-steps'
const MAX = 400

function read(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

const keyOf = (turnId: string, stepId: string) => `${turnId}:${stepId}`

export function markStepApplied(turnId: string, stepId: string): void {
  try {
    const list = read()
    const key = keyOf(turnId, stepId)
    if (list.includes(key)) return
    list.push(key)
    window.sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)))
  } catch {
    // 见头注。
  }
}

export function wasStepApplied(turnId: string, stepId: string): boolean {
  return read().includes(keyOf(turnId, stepId))
}
