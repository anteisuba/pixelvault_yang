import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 字体三槽的机器门（ui-defaults.md §1，进度表 32 ②）。
 *
 * 判据是「等宽只给机器串」：数值、id、参数、时间码、代码与提示词原文。标题是
 * 这条判据里**唯一不会有例外**的那一档 —— 标题永远是给人读的一句话，CJK 在
 * Geist Mono 下还会整句回落到正文 CJK 字形，等宽只剩下拉丁那几个字母长得不一样。
 *
 * ⛔ 故意只守标题：按钮与 span 两边都有正当用法（掩码 API key 是按钮、触发词
 * chip 是按钮），把它们一起禁掉只会逼出一堆 eslint-disable —— 那是脆弱规则，
 * 不是门。其余落点的判据写在 ui-defaults.md §1，靠 review 过。
 */
const ROOT = join(process.cwd(), 'src')
const HEADING_TAG = /<h[1-6](\s[^<>]*)?>/g

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectTsx(full, out)
      continue
    }
    if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('字体三槽 · 等宽不进标题', () => {
  it('src/**/*.tsx 里没有一个 <h1>–<h6> 带 font-mono', () => {
    const offenders: string[] = []

    for (const file of collectTsx(ROOT)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(HEADING_TAG)) {
        if (!match[0].includes('font-mono')) continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${file.replace(`${process.cwd()}/`, '')}:${line}`)
      }
    }

    expect(offenders).toEqual([])
  })
})

/**
 * 展示槽的机器门（ui-defaults.md §1，进度表 33 ①）。
 *
 * `font-display` 在**应用内**只有一个落点：空态大标题，也就是空态原语
 * `src/components/ui/empty-state.tsx` 自己那一行。全站其余两处（首页 hero、
 * legal 页标题）走各自域 CSS 里的 `--font-stack-display`，不经过这个 utility。
 *
 * 换句话说：应用内任何组件里再冒出一个 `font-display`，就是第四类落点 ——
 * 要么它该用空态原语，要么 ui-defaults §1 得先改。⛔ 不许悄悄多一个。
 */
describe('字体三槽 · 展示槽只有空态这一个应用内落点', () => {
  it('src/**/*.tsx 里 className 带 font-display 的只有空态原语', () => {
    const offenders: string[] = []

    for (const file of collectTsx(ROOT)) {
      const source = readFileSync(file, 'utf8')
      if (!/\bfont-display\b/.test(source)) continue
      const relative = file.replace(`${process.cwd()}/`, '')
      if (relative === 'src/components/ui/empty-state.tsx') continue
      // 原语自己的测试断言标题带 font-display —— 那是门的一部分，不是落点。
      if (relative === 'src/components/ui/empty-state.test.tsx') continue
      offenders.push(relative)
    }

    expect(offenders).toEqual([])
  })
})
