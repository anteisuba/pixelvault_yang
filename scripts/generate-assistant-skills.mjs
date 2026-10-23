#!/usr/bin/env node
/**
 * 把内置技能（src/features/assistant/skills/builtin/<name>/ 下的 SKILL.md 与 references/）打成一份
 * TS 模块，服务端直接 import（⛔ 运行时读盘：Vercel 打包不一定带上这些文件）。
 * 改了任何一份技能文件就跑：npm run skills:generate。`builtin.generated.test.ts` 守着两边一致。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// 从仓库根目录跑（npm run / vitest 都是）；⛔ import.meta.url：jsdom 测试环境里它不是 file:。
const ROOT = process.cwd()
export const BUILTIN_DIR = join(ROOT, 'src/features/assistant/skills/builtin')
export const GENERATED_FILE = join(
  ROOT,
  'src/features/assistant/skills/builtin.generated.ts',
)

function filesOf(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry)
      return statSync(path).isDirectory() ? filesOf(path) : [path]
    })
}

export function readBuiltinSkills(dir = BUILTIN_DIR) {
  return readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .sort()
    .map((entry) => {
      const files = Object.fromEntries(
        filesOf(join(dir, entry)).map((path) => [
          relative(join(dir, entry), path).split('\\').join('/'),
          readFileSync(path, 'utf8'),
        ]),
      )
      return { dir: entry, files }
    })
}

export function renderBuiltinSkills(dir = BUILTIN_DIR) {
  const skills = readBuiltinSkills(dir)
  return `// ⚠ 生成的文件，⛔ 手改：改 skills/builtin/ 下的文件，再跑 npm run skills:generate。
export const BUILTIN_SKILL_FILES: readonly {
  readonly dir: string
  readonly files: Readonly<Record<string, string>>
}[] = ${JSON.stringify(skills, null, 2)}
`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(GENERATED_FILE, renderBuiltinSkills())
  console.log(`wrote ${relative(ROOT, GENERATED_FILE)}`)
}
