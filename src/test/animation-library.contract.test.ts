import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

/**
 * 动效库分工的机器门（`CLAUDE.md` + `ui-defaults.md` §4，进度表 33 ②）。
 *
 * app 内动效只有 `motion`，且只从 `motion/react` 进；GSAP 只给首页营销域。
 * 真正拦人的是 `eslint.config.mjs` 里的 `ANIMATION_LIBRARY_FORBIDDEN_PATHS` ——
 * 这个测试做两件 eslint 自己证明不了的事：
 *
 *  1. 源码现状是 0（门立起来的那天树是干净的，后面每次跑都在复核这一点）；
 *  2. **门真的会红**。拿两段假源码喂给同一份 eslint 配置，一段在 app 内、
 *     一段在首页域 —— ⛔ 不去读配置文件里有没有那几个字符串，那证明不了
 *     flat config 的块替换有没有把它悄悄盖掉（图标门的头注里记着这个坑）。
 */
const ROOT = join(process.cwd(), 'src')
const RULE = '@typescript-eslint/no-restricted-imports'

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSources(full, out)
      continue
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

async function lintAs(filePath: string, source: string) {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(source, { filePath })
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE)
}

describe('动效库 · app 内只有 motion/react，GSAP 只给首页', () => {
  it('src/** 里没有一个 framer-motion import', () => {
    // 本文件自己带着那串假源码当 fixture，⛔ 不能把自己算成违规。
    const self = join(ROOT, 'test/animation-library.contract.test.ts')
    const offenders = collectSources(ROOT)
      .filter((file) => file !== self)
      .filter((file) =>
        /from '(framer-motion)'/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => file.replace(`${process.cwd()}/`, ''))

    expect(offenders).toEqual([])
  })

  it('eslint 对 app 内的 framer-motion 与 gsap 都报错', async () => {
    const messages = await lintAs(
      join(ROOT, 'components/business/__fixture__.tsx'),
      "import { motion } from 'framer-motion'\nimport gsap from 'gsap'\nexport const a = [motion, gsap]\n",
    )

    expect(messages.map((m) => m.message).join('\n')).toContain('framer-motion')
    expect(messages.map((m) => m.message).join('\n')).toContain('gsap')
  })

  it('首页营销域放行 gsap，但 framer-motion 照样红', async () => {
    const messages = await lintAs(
      join(ROOT, 'components/business/home-v4/__fixture__.tsx'),
      "import gsap from 'gsap'\nimport { motion } from 'framer-motion'\nexport const b = [gsap, motion]\n",
    )

    const text = messages.map((m) => m.message).join('\n')
    expect(text).toContain('framer-motion')
    expect(text).not.toContain('GSAP 只给首页营销域')
  })
})
