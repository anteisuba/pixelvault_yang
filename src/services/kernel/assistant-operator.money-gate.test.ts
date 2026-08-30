import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_MUTATING_TOOLS,
  ASSISTANT_OPERATOR_TOOLS,
} from '@/constants/assistant-operator'

/**
 * **钱闸的结构性证明**（拍板 2 · 任务包 §2「服务端没有任何工具能创建 generation」）。
 *
 * ⚠ 这是一份**读源码**的测试，不是行为测试 —— 有意的。行为测试只能证明「我写的
 * 这几条路径没花钱」；这份证明的是「这个文件够不着花钱的东西」。前者会被下一个人
 * 加的一条新路径绕过，后者不会：他得先来改这份允许名单，而改名单是一个看得见的动作。
 *
 * 同类先例：`prisma/migration-safety.test.ts`（约束型迁移 CI 抓不到，只能读文件锁）。
 */

const SERVICE_PATH = join(
  process.cwd(),
  'src/services/kernel/assistant-operator.service.ts',
)
const SOURCE = readFileSync(SERVICE_PATH, 'utf8')

/**
 * 工具环允许 import 的服务，逐条写明为什么。
 *
 * ⛔ 往这里加一条之前先回答：它会不会（直接或间接）创建 generation、扣 credit、
 * 调 provider 出图？会就不该出现在这个文件里 —— 助手的活是填表单，不是出图。
 */
const ALLOWED_SERVICE_IMPORTS = new Set([
  // 认人：clerkId → 库里的 user.id，检索要按它收敛。
  '@/services/user.service',
  // 只读分页查询（`search_assets`）。⚠ 同一个模块里有 `createGeneration`，
  // 所以下面还有一条「不许出现的标识符」名单兜着。
  '@/services/generation.service',
  // 选 LLM 路由（用户自己的 key / 平台兜底）。
  '@/services/llm-text.service',
  // 文本补全的重试策略，工具环每一步都走它。
  '@/services/kernel/assistant-completion.service',
])

/** 出现即失败的标识符 —— 每一条都是一条能花掉用户钱的路。 */
const FORBIDDEN_IDENTIFIERS = [
  'createGeneration',
  'generateImage',
  'generateVideo',
  'generateAudio',
  'deductCredits',
  'submitGeneration',
  'execution-worker',
  'generate-image.service',
  'generate-video.service',
  'generate-audio.service',
  // db 直连：这一层不该有第二条查库的路，检索走 generation.service 的分页查询。
  "from '@/lib/db'",
]

function importedModules(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
}

describe('⛔ 助手工具环的钱闸', () => {
  it('只 import 允许名单里的服务', () => {
    const services = importedModules(SOURCE).filter((moduleId) =>
      moduleId.startsWith('@/services/'),
    )
    expect(services.length).toBeGreaterThan(0)
    for (const moduleId of services) {
      expect(
        ALLOWED_SERVICE_IMPORTS.has(moduleId),
        `${moduleId} 不在允许名单里。它会花钱吗？会的话别在工具环里 import 它。`,
      ).toBe(true)
    }
  })

  it('源码里不出现任何一条能花钱的标识符', () => {
    for (const identifier of FORBIDDEN_IDENTIFIERS) {
      expect(SOURCE.includes(identifier), `源码里出现了 ${identifier}`).toBe(
        false,
      )
    }
  })

  it('工具表里没有任何一条叫 generate 的（prime 除外，而它只置态）', () => {
    const generating = ASSISTANT_OPERATOR_TOOLS.filter(
      (tool) => tool.includes('generate') && tool !== 'prime_generate',
    )
    expect(generating).toEqual([])
    // prime 是改动型的（因此可撤销），但它改的是按钮的样子，不是账单。
    expect(ASSISTANT_OPERATOR_MUTATING_TOOLS).toContain('prime_generate')
  })

  it('查库只有一处，且一定按 userId 收敛（不许翻别人的库）', () => {
    const callSites = [...SOURCE.matchAll(/getPublicGenerationPage\(/g)]
    // 一处 import + 一处调用
    expect(callSites).toHaveLength(1)
    const callBlock = SOURCE.slice(
      SOURCE.indexOf('getPublicGenerationPage({'),
      SOURCE.indexOf('getPublicGenerationPage({') + 400,
    )
    expect(callBlock).toContain('userId,')
  })
})
