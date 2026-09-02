import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_CANVAS_TOOLS } from '@/constants/assistant-operator'

/**
 * **钱闸 ②**（任务书 §2.5 / 验收 #3）—— 画布执行在客户端，只锁服务端挡不住。
 *
 * 与 `services/kernel/assistant-operator.money-gate.test.ts` 同一种证明：读源码，
 * 不跑行为。行为测试只能证明「我写的这几条路径没花钱」；这份证明的是「这个文件
 * 够不着花钱的东西」—— 下一个人想加一条「顺手把生成也跑了」的路径，得先来改这份
 * 名单，而改名单是一个看得见的动作。
 */

const APPLY_PATH = join(process.cwd(), 'src/lib/canvas-operator-apply.ts')
const SOURCE = readFileSync(APPLY_PATH, 'utf8')
const HOST_PATH = join(
  process.cwd(),
  'src/hooks/node/use-canvas-operator-host.ts',
)
const HOST_SOURCE = readFileSync(HOST_PATH, 'utf8')

/** 出现即失败 —— 每一条都是旧执行块里那条会扣 credit 的 `generate` op 留下的脚印。 */
const FORBIDDEN_IDENTIFIERS = [
  'handleGenerateMediaNode',
  'generateMediaNode',
  'NODE_GENERATION_SOURCE_IDS',
  'generate-',
  'createGeneration',
  'deductCredits',
  'submitGeneration',
  'studioGenerateAPI',
  'api-client',
  'fetch(',
]

function importedModules(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
}

describe('⛔ 画布操作员 apply 模块的钱闸', () => {
  it('apply 模块不 import 任何服务、不碰 api-client', () => {
    const modules = importedModules(SOURCE)
    expect(modules.length).toBeGreaterThan(0)
    for (const moduleId of modules) {
      expect(
        moduleId.startsWith('@/services/'),
        `${moduleId} 是服务层 —— 纯函数够不着它才是钱闸成立的前提`,
      ).toBe(false)
    }
  })

  it('apply 模块源码里不出现任何一条生成标识符', () => {
    for (const identifier of FORBIDDEN_IDENTIFIERS) {
      expect(SOURCE.includes(identifier), `源码里出现了 ${identifier}`).toBe(
        false,
      )
    }
  })

  it('宿主同样够不着生成：它只会把 patch 交给 runAsSingleHistoryStep', () => {
    for (const identifier of FORBIDDEN_IDENTIFIERS) {
      expect(
        HOST_SOURCE.includes(identifier),
        `宿主源码里出现了 ${identifier}`,
      ).toBe(false)
    }
    for (const moduleId of importedModules(HOST_SOURCE)) {
      expect(moduleId.startsWith('@/services/')).toBe(false)
    }
    expect(HOST_SOURCE).toContain('runAsSingleHistoryStep')
    expect(HOST_SOURCE).toContain('applyGraphPatch')
  })

  it('画布十条里唯一沾 generate 字样的是 prime_node_generate，且它只写 assistantPrimed', () => {
    expect(
      ASSISTANT_OPERATOR_CANVAS_TOOLS.filter(
        (tool) => tool.includes('generate') && tool !== 'prime_node_generate',
      ),
    ).toEqual([])
    const primeBlock = SOURCE.slice(
      SOURCE.indexOf('ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate: {'),
      SOURCE.indexOf('isCanvasOperatorBatchStep'),
    )
    expect(primeBlock).toContain('assistantPrimed: true')
    expect(primeBlock).not.toContain('mediaJobId')
  })

  it('零 React：apply 模块不 import react', () => {
    expect(importedModules(SOURCE).some((id) => id === 'react')).toBe(false)
    expect(SOURCE).not.toContain("'use client'")
  })
})
