/**
 * 紧凑计数格式化（`444k` / `1.2M`）。
 *
 * 为什么不用 `Intl.NumberFormat(locale, { notation: 'compact' })`：单位后缀会
 * 跟着语言变（zh 给「44.4万」、ja 给「44.4万」），而库卡片上的 ↓/♥ 计数是
 * 并排密排的两个 mono 数字，宽度必须可预期、三语必须同形——这里要的是
 * 「同一个数在哪种语言下都长一样」，不是本地化读法。
 *
 * 规则：<1000 原样；否则降到 k/M/B，单位内 <10 时保留一位小数（去掉 `.0`）。
 */

const COMPACT_UNITS = [
  { threshold: 1_000_000_000, suffix: 'B' },
  { threshold: 1_000_000, suffix: 'M' },
  { threshold: 1_000, suffix: 'k' },
] as const

const COMPACT_DECIMAL_BELOW = 10

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const rounded = Math.floor(value)
  for (const unit of COMPACT_UNITS) {
    if (rounded < unit.threshold) continue
    const scaled = rounded / unit.threshold
    const text =
      scaled < COMPACT_DECIMAL_BELOW
        ? (Math.floor(scaled * 10) / 10).toFixed(1).replace(/\.0$/, '')
        : String(Math.floor(scaled))
    return `${text}${unit.suffix}`
  }
  return String(rounded)
}
