import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import tsParser from '@typescript-eslint/parser'
import { ESLint, Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import {
  RAW_BUTTON_BASELINE,
  UI_STANDARD_PLUGIN,
} from '../../scripts/ui-standard/rules.mjs'

/**
 * 手写按钮门（触屏命中区，2026-11-16）。
 *
 * 真正拦人的是 eslint.config.mjs 的「手写按钮门」块；这里做两件 eslint 自己证明不了的事：
 *  1. 门真的会红（拿假源码喂同一份配置，⛔ 不去读配置里的字符串）；
 *  2. 棘轮：基线名单只减不增——名单里的文件都还在、也都还有违规的手写按钮。改好了的
 *     文件这里会红，提醒你把它从 scripts/ui-standard/raw-button-baseline.json 删掉。
 */
const RULE = 'antei/no-raw-button'
// 不在基线里的假路径：落在规则范围内（src/**/*.tsx，非 ui / 非测试）。
const FIXTURE = join(process.cwd(), 'src/features/studio/__fixture__.tsx')

async function lint(source: string) {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(source, { filePath: FIXTURE })
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE)
}

/** 只跑这一条规则（不加载整份配置），给 260+ 个基线文件逐个复核用。 */
const linter = new Linter({ configType: 'flat' })
const RULE_ONLY: Linter.Config[] = [
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { antei: UI_STANDARD_PLUGIN },
    rules: { [RULE]: 'error' },
  },
]

function rawButtonCount(file: string): number {
  const source = readFileSync(join(process.cwd(), file), 'utf8')
  return linter.verify(source, RULE_ONLY, file).filter((m) => m.ruleId === RULE)
    .length
}

describe('手写按钮门', () => {
  it('裸 <button> 会红，带 touch-target / touch-target-y 不红', async () => {
    const red = await lint(
      'export const A = () => <button type="button" className="size-8">x</button>\n',
    )
    expect(red).toHaveLength(1)
    expect(red[0]?.message).toContain('@/components/ui/button')

    const green = await lint(
      [
        "import { cn } from '@/lib/utils'",
        'export const A = () => <button type="button" className="touch-target size-8">x</button>',
        'export const B = ({ on }: { on: boolean }) => (',
        "  <button type=\"button\" className={cn('touch-target-y h-8', on && 'ring')}>y</button>",
        ')',
        '',
      ].join('\n'),
    )
    expect(green).toEqual([])
  })

  it('基线只减不增：名单里的文件都还在、都还有违规的手写按钮', () => {
    const stale = (RAW_BUTTON_BASELINE as string[]).filter(
      (file) =>
        !existsSync(join(process.cwd(), file)) || rawButtonCount(file) === 0,
    )
    // 红了：这些文件已经改好或删掉，把它们从 raw-button-baseline.json 里删掉。
    expect(stale).toEqual([])
  })
})
