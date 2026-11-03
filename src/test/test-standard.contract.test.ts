import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import {
  MOCKABLE_OWN_MODULE_RE,
  MOCK_BASELINE,
} from '../../scripts/test-standard/rules.mjs'

/**
 * 测试标准门（docs/references/testing.md「测试标准」，o-tests 2026-11-03）。
 *
 * 真正拦人的是 eslint.config.mjs 的「测试标准门」块；这里做两件 eslint 自己证明不了的事：
 *  1. 门真的会红（拿假源码喂同一份配置，⛔ 不去读配置里的字符串）；
 *  2. 棘轮：待迁名单只减不增——名单里的文件都还在、也都还违规。迁好了的
 *     文件这里会红，提醒你把它从 scripts/test-standard/mock-baseline.json 删掉。
 */
const RULE = 'no-restricted-syntax'
const FIXTURE = join(process.cwd(), 'src/lib/__fixture__.test.ts')

async function lint(source: string) {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(source, { filePath: FIXTURE })
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === RULE)
    .map((m) => m.message)
}

const OWN_MOCK_RE = /vi\.(?:mock|doMock)\(\s*['"](@\/[^'"]+)['"]/g

function ownMocks(file: string): string[] {
  const source = readFileSync(join(process.cwd(), file), 'utf8')
  return [...source.matchAll(OWN_MOCK_RE)].map((m) => m[1] as string)
}

describe('测试标准门', () => {
  it('mock 自己的模块会红，假边界不红', async () => {
    const red = await lint(
      "import { vi } from 'vitest'\nvi.mock('@/lib/db', () => ({}))\nvi.mock('@/features/lora/hooks', () => ({}))\n",
    )
    expect(red).toHaveLength(2)
    expect(red[0]).toContain('只假边界')

    const green = await lint(
      "import { vi } from 'vitest'\nvi.mock('@/lib/api-client/lora-assets', () => ({}))\nvi.mock('@/services/storage/r2', () => ({}))\nvi.mock('@/lib/logger', () => ({}))\nvi.mock('next-intl', () => ({}))\n",
    )
    expect(green).toEqual([])
  })

  it('真等会红，让一拍的 setTimeout(r, 0) 不红', async () => {
    const red = await lint(
      'export const wait = () => new Promise((r) => setTimeout(r, 900))\n',
    )
    expect(red.join('\n')).toContain('测试别真等')

    const green = await lint(
      'export const tick = () => new Promise((r) => setTimeout(r, 0))\n',
    )
    expect(green).toEqual([])
  })

  it('待迁名单只减不增：名单里的文件都还在、都还 mock 着自己的模块', () => {
    const stale = (MOCK_BASELINE as string[]).filter(
      (file) =>
        !existsSync(join(process.cwd(), file)) ||
        ownMocks(file).every((m) => MOCKABLE_OWN_MODULE_RE.test(m)),
    )
    // 红了：这些文件已经迁好或删掉，把它们从 mock-baseline.json 里删掉。
    expect(stale).toEqual([])
  })
})
